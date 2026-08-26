import { prisma } from "@/lib/prisma"
import {
  verifyMercadoPagoWebhook,
  getPayment,
  getPreapproval,
  referenceToUserId,
} from "@/lib/mercadopago"
import { classifyPreapproval, cancelOrphanPreapproval } from "@/lib/orphan-subscriptions"
import { sendPaymentFailed, sendSubscriptionConfirmation } from "@/lib/email"

export async function POST(req: Request) {
  const url = new URL(req.url)
  const bodyText = await req.text()

  let body: { type?: string; topic?: string; data?: { id?: string } }
  try {
    body = JSON.parse(bodyText)
  } catch {
    return new Response("invalid json", { status: 400 })
  }

  // Mercado Pago sends the topic/id both as query params and in the body —
  // read either, since the exact shape has varied across their webhook
  // versions (legacy IPN used topic/id, current webhooks use type/data.id).
  const type = url.searchParams.get("type") ?? body.type ?? url.searchParams.get("topic") ?? body.topic ?? ""
  const dataId = url.searchParams.get("data.id") ?? body.data?.id ?? url.searchParams.get("id") ?? ""

  if (
    !verifyMercadoPagoWebhook({
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      dataId,
    })
  ) {
    return new Response(null, { status: 401 })
  }

  if (!dataId) return new Response(null, { status: 200 })

  if (type === "payment") {
    await handlePaymentNotification(dataId, type, body)
  } else if (type === "subscription_preapproval") {
    await handlePreapprovalNotification(dataId, type, body)
  }

  return new Response(null, { status: 200 })
}

async function handlePaymentNotification(paymentId: string, type: string, body: object) {
  const payment = await getPayment(paymentId)
  if (!payment.ok) return

  // The status is part of the idempotency key, not just the id: a single
  // payment/preapproval goes through several distinct statuses over its
  // lifecycle (e.g. authorized -> cancelled), each arriving as its own
  // notification. Keying only on type+id would make every notification
  // after the first look like a duplicate of it and get silently dropped.
  const externalId = `${type}-${paymentId}-${payment.status ?? "unknown"}`
  const isNew = await recordEvent(externalId, type, payment.status ?? "unknown", body)
  if (!isNew) return

  const userId = referenceToUserId(payment.externalReference ?? "")
  await linkEvent(externalId, userId)

  if (payment.status === "approved") {
    // A charge that landed on someone who no longer has an account or a plan
    // must not just be ignored: Mercado Pago would keep charging it every
    // month. Cut the preapproval before anything else.
    if (
      payment.preapprovalId &&
      (await stopOrphanCharge({
        preapprovalId: payment.preapprovalId,
        externalReference: payment.externalReference ?? null,
        detail: { paymentId, amountCents: payment.amountCents },
      }))
    ) {
      return
    }

    await handleApproved(userId, {
      preapprovalId: payment.preapprovalId,
      cardBrand: payment.cardBrand,
      cardLastFour: payment.cardLastFour,
    })
  } else if (payment.status === "rejected" || payment.status === "cancelled") {
    await handleDeclined(userId)
  }
}

// Returns true when the preapproval had no valid local owner and was cancelled,
// meaning the caller should stop processing this notification.
async function stopOrphanCharge({
  preapprovalId,
  externalReference,
  dateCreated,
  detail,
}: {
  preapprovalId: string
  externalReference: string | null
  dateCreated?: Date | null
  detail?: Record<string, unknown>
}): Promise<boolean> {
  const verdict = await classifyPreapproval({ id: preapprovalId, externalReference, dateCreated })
  if (!verdict.orphaned) return false

  await cancelOrphanPreapproval({
    preapprovalId,
    reason: verdict.reason,
    userId: verdict.userId,
    source: "webhook",
    detail,
  })
  return true
}

async function handlePreapprovalNotification(preapprovalId: string, type: string, body: object) {
  const preapproval = await getPreapproval(preapprovalId)
  if (!preapproval.ok) return

  const externalId = `${type}-${preapprovalId}-${preapproval.status ?? "unknown"}`
  const isNew = await recordEvent(externalId, type, preapproval.status ?? "unknown", body)
  if (!isNew) return

  const userId = referenceToUserId(preapproval.externalReference ?? "")

  // "paused" is Mercado Pago's own signal that repeated charge retries failed —
  // treat it the same as a declined charge. "cancelled" mirrors an explicit
  // cancellation, whether we triggered it (cancelPreapproval) or the buyer did
  // it from their own Mercado Pago account.
  if (preapproval.status === "cancelled") {
    await handleCancelled(userId)
  } else if (preapproval.status === "paused") {
    await handleDeclined(userId)
  } else if (preapproval.status === "authorized" || preapproval.status === "pending") {
    // Still live on Mercado Pago's side — the last chance to catch one whose
    // owner is gone before it produces another charge.
    await stopOrphanCharge({
      preapprovalId,
      externalReference: preapproval.externalReference ?? null,
      dateCreated: preapproval.dateCreated,
      detail: { preapprovalStatus: preapproval.status, payerEmail: preapproval.payerEmail },
    })
  }
}

// Idempotency: if this event was already processed, returns false so the
// caller skips re-applying it.
async function recordEvent(
  externalId: string,
  type: string,
  status: string,
  payload: object,
): Promise<boolean> {
  try {
    await prisma.paymentEvent.create({ data: { externalId, type, status, payload } })
    return true
  } catch (e: unknown) {
    if (isUniqueConstraintError(e)) return false
    throw e
  }
}

async function linkEvent(externalId: string, userId: string | null) {
  if (!userId) return
  await prisma.paymentEvent.update({ where: { externalId }, data: { userId } }).catch(() => null)
}

async function handleApproved(
  userId: string | null,
  payment: { preapprovalId?: string; cardBrand?: string; cardLastFour?: string },
) {
  if (!userId) return

  // A stale or malformed external_reference (e.g. leftover test data) can
  // resolve to a userId that doesn't exist. Without this check, user.update
  // and subscription.upsert's create branch below throw (P2025/P2003), which
  // surfaces as an uncaught 500 to Mercado Pago and gets retried forever.
  const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!userExists) return

  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { currentPeriodEnd: true, status: true, lastChargeAt: true },
  })

  // A late/stray approval (e.g. a charge in flight when the user canceled)
  // must not resurrect a plan the user already ended. A genuine re-subscription
  // has already moved the sub back to "incomplete" by this point.
  if (existing && ["canceling", "cancelled", "expired"].includes(existing.status)) {
    return
  }

  // lastChargeAt (not just status/currentPeriodEnd) is what distinguishes a
  // genuine renewal from the first real charge landing on a subscription
  // that startSubscription already activated optimistically — that path sets
  // status "active" + currentPeriodEnd without ever setting lastChargeAt.
  const isFirstRealConfirmation = !existing?.lastChargeAt

  // Extend from the later of now / current period end so renewals charged a
  // few days early don't lose the remaining days of the running period.
  // But if this is the first real charge confirming a subscription that was
  // already activated optimistically, currentPeriodEnd already holds the
  // correct date for this same charge — extending it again here would double
  // the period (charge 1 of 1 counted as if it were charge 2).
  let periodEnd: Date
  if (isFirstRealConfirmation && existing?.currentPeriodEnd && existing.currentPeriodEnd > new Date()) {
    periodEnd = existing.currentPeriodEnd
  } else {
    const base =
      existing?.currentPeriodEnd && existing.currentPeriodEnd > new Date()
        ? existing.currentPeriodEnd
        : new Date()
    periodEnd = new Date(base)
    periodEnd.setDate(periodEnd.getDate() + 30)
  }

  // isRenewal (for the welcome email) still goes off lastChargeAt: the
  // confirmation email should go out exactly once, on the first real charge,
  // not on every renewal.
  const isRenewal = existing?.status === "active" && !isFirstRealConfirmation

  const [user] = await Promise.all([
    prisma.user.update({
      where: { id: userId },
      data: { isPremium: true },
      select: { email: true, name: true },
    }),
    prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        status: "active",
        mpPreapprovalId: payment.preapprovalId,
        currentPeriodEnd: periodEnd,
        lastChargeAt: new Date(),
        cardBrand: payment.cardBrand,
        cardLastFour: payment.cardLastFour,
      },
      update: {
        status: "active",
        currentPeriodEnd: periodEnd,
        pastDueSince: null,
        renewalReminderSentAt: null,
        lastChargeAt: new Date(),
        // Only overwrite these when Mercado Pago actually gives us a value,
        // so a payment payload that omits one doesn't wipe what we already hold.
        ...(payment.preapprovalId ? { mpPreapprovalId: payment.preapprovalId } : {}),
        ...(payment.cardBrand ? { cardBrand: payment.cardBrand } : {}),
        ...(payment.cardLastFour ? { cardLastFour: payment.cardLastFour } : {}),
      },
    }),
  ])

  if (!isRenewal) {
    await sendSubscriptionConfirmation(user.email, user.name).catch(() => null)
  }
}

async function handleDeclined(userId: string | null) {
  if (!userId) return

  // Stamp pastDueSince only on the first failure so it reflects when the
  // trouble started. No retries on our side — the next billing cron run
  // downgrades this sub to Free and emails the user then.
  const { count } = await prisma.subscription.updateMany({
    where: { userId, pastDueSince: null },
    data: { status: "past_due", pastDueSince: new Date() },
  })

  // count === 0 means this sub was already past_due — the "your payment
  // failed" email already went out, so don't resend it.
  if (count === 0) return

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  })
  if (user) await sendPaymentFailed(user.email, user.name).catch(() => null)
}

async function handleCancelled(userId: string | null) {
  if (!userId) return

  // Honor the period already paid: stop future charges but keep the user Pro
  // until currentPeriodEnd, when the billing cron downgrades them.
  await prisma.subscription.updateMany({
    where: { userId, status: { in: ["active", "past_due", "incomplete"] } },
    data: { status: "canceling" },
  })
}

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  )
}
