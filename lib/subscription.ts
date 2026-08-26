import { prisma } from "@/lib/prisma"
import { FREE_PROPERTY_LIMIT } from "@/lib/plans"
import { createPreapproval, getCardToken } from "@/lib/mercadopago"
import { cancelOrphanPreapproval } from "@/lib/orphan-subscriptions"

// Drop a user to Free: clear the premium flag and deactivate properties beyond
// the Free limit (keeping the most recent ones). Used both when a canceled plan
// reaches its period end and when an unpaid one exhausts its grace window.
export async function downgradeToFree(userId: string) {
  const activeProperties = await prisma.property.findMany({
    where: { userId, published: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  })
  const idsToDeactivate = activeProperties
    .slice(FREE_PROPERTY_LIMIT)
    .map((p) => p.id)

  await Promise.all([
    prisma.user.update({ where: { id: userId }, data: { isPremium: false } }),
    idsToDeactivate.length > 0
      ? prisma.property.updateMany({
          where: { id: { in: idsToDeactivate } },
          data: { published: false },
        })
      : Promise.resolve(),
  ])
}

export type StartSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: "preapproval_failed" }

// Kicks off a subscription with a card already tokenized client-side
// (cardTokenId) and persists the preapproval id so the webhook (which only
// carries an id, not a full payload) can find the right user later.
//
// Mercado Pago's first charge on an "authorized" preapproval settles
// asynchronously — anywhere from a few minutes to about an hour — which
// would otherwise leave a buyer who just handed over a validated card
// staring at "confirming your payment" for a long time. Since the card was
// already validated moments earlier (that's what "authorized" means here),
// we activate isPremium optimistically instead of waiting for the webhook.
// lastChargeAt stays null until the webhook confirms a real charge — the
// webhook uses that (not just status/currentPeriodEnd) to tell "this is the
// first confirmation" from "this is a renewal", so it still sends the
// welcome-to-Pro email once, and handleDeclined downgrades back to Free if
// that first real charge ends up rejected.
export async function startSubscription({
  userId,
  email,
  backUrl,
  cardTokenId,
}: {
  userId: string
  email: string
  backUrl: string
  cardTokenId: string
}): Promise<StartSubscriptionResult> {
  // Read before creating: the upsert below overwrites mpPreapprovalId, and the
  // preapproval it replaces keeps charging on Mercado Pago's side unless we
  // cancel it. Losing the id first would leave that charge running with no
  // local trace of it.
  const previous = await prisma.subscription.findUnique({
    where: { userId },
    select: { mpPreapprovalId: true },
  })

  const [result, cardToken] = await Promise.all([
    createPreapproval({ userId, email, backUrl, cardTokenId }),
    getCardToken(cardTokenId),
  ])
  if (!result.ok || !result.preapprovalId) {
    return { ok: false, reason: "preapproval_failed" }
  }

  const authorized = result.status === "authorized"
  const periodEnd = new Date()
  periodEnd.setDate(periodEnd.getDate() + 30)
  const cardBrand = result.cardBrand
  const cardLastFour = cardToken.ok ? cardToken.cardLastFour : undefined

  await Promise.all([
    prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        status: authorized ? "active" : "incomplete",
        mpPreapprovalId: result.preapprovalId,
        currentPeriodEnd: authorized ? periodEnd : null,
        cardBrand,
        cardLastFour,
      },
      update: {
        status: authorized ? "active" : "incomplete",
        mpPreapprovalId: result.preapprovalId,
        currentPeriodEnd: authorized ? periodEnd : null,
        pastDueSince: null,
        cardBrand,
        cardLastFour,
      },
    }),
    authorized ? prisma.user.update({ where: { id: userId }, data: { isPremium: true } }) : Promise.resolve(),
  ])

  // Only after the new subscription is safely persisted: if cancelling the old
  // one fails, the buyer still ends up subscribed and the daily reconciliation
  // catches the leftover — the reverse order could leave them with neither.
  if (previous?.mpPreapprovalId && previous.mpPreapprovalId !== result.preapprovalId) {
    await cancelOrphanPreapproval({
      preapprovalId: previous.mpPreapprovalId,
      reason: "superseded_preapproval",
      userId,
      payerEmail: email,
      source: "resubscribe",
      detail: { replacedBy: result.preapprovalId },
    })
  }

  return { ok: true }
}
