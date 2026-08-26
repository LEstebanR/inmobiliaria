import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import { downgradeToFree } from "@/lib/subscription"
import { searchLivePreapprovals } from "@/lib/mercadopago"
import {
  classifyPreapproval,
  cancelOrphanPreapproval,
  type OrphanReason,
} from "@/lib/orphan-subscriptions"
import { sendRenewalReminder, sendSubscriptionCancelled } from "@/lib/email"

// Daily billing job (scheduled in vercel.json). Mercado Pago drives the
// recurring charges itself (unlike Wompi) and reports outcomes via
// /api/webhooks/mercadopago, so this route no longer charges anything — it's
// left with the parts Mercado Pago doesn't do for us: reminding users before
// a renewal, and downgrading accounts whose cancellation/decline already
// landed via webhook.
export const dynamic = "force-dynamic"

const REMINDER_DAYS = 3

// Ceiling on how many subscriptions one run may cancel at Mercado Pago. A bug
// in the classification, or a database that answers but with the wrong data,
// would otherwise be able to cancel the whole customer base in a single pass.
// Anything above this is reported instead of acted on.
const MAX_ORPHAN_CANCELS_PER_RUN = 10

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? ""
  if (!secret) return false
  return req.headers.get("authorization") === `Bearer ${secret}`
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new Response(null, { status: 401 })
  }

  const now = new Date()
  const summary = { reminded: 0, downgraded: 0, canceled: 0, manualExpired: 0, orphansCanceled: 0 }

  await sendReminders(now, summary)
  await expireCanceled(now, summary)
  await downgradeExpired(now, summary)
  await expireManualPro(now, summary)
  await cancelOrphanSubscriptions(summary)

  return Response.json({ ok: true, ...summary })
}

// Plans the user canceled: keep them Pro until the paid period ends, then drop
// to Free on/after currentPeriodEnd (never before — see the timezone note below).
async function expireCanceled(
  now: Date,
  summary: { canceled: number },
) {
  const due = await prisma.subscription.findMany({
    where: { status: "canceling", currentPeriodEnd: { lt: now } },
    select: { id: true, userId: true },
  })

  for (const sub of due) {
    await downgradeToFree(sub.userId)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "cancelled" },
    })
    summary.canceled++
  }
}

async function sendReminders(
  now: Date,
  summary: { reminded: number },
) {
  const due = await prisma.subscription.findMany({
    where: {
      status: "active",
      renewalReminderSentAt: null,
      currentPeriodEnd: { gt: now, lte: daysFromNow(REMINDER_DAYS) },
    },
    select: {
      id: true,
      currentPeriodEnd: true,
      mpPreapprovalId: true,
      user: { select: { email: true, name: true } },
    },
  })

  for (const sub of due) {
    if (!sub.currentPeriodEnd) continue
    await sendRenewalReminder(
      sub.user.email,
      sub.user.name,
      sub.currentPeriodEnd,
      !!sub.mpPreapprovalId,
    ).catch(() => null)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { renewalReminderSentAt: now },
    })
    summary.reminded++
  }
}

async function downgradeExpired(
  now: Date,
  summary: { downgraded: number },
) {
  // No grace window: pastDueSince is stamped at the failed renewal charge (at/after
  // currentPeriodEnd), so any past_due sub is downgraded on this very run — or, for
  // a decline that arrived via webhook after this run started, on the next one.
  const expired = await prisma.subscription.findMany({
    where: {
      status: "past_due",
      pastDueSince: { lte: now },
    },
    select: { id: true, userId: true, user: { select: { email: true, name: true } } },
  })

  for (const sub of expired) {
    await downgradeToFree(sub.userId)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "expired" },
    })
    await sendSubscriptionCancelled(sub.user.email, sub.user.name).catch(() => null)
    summary.downgraded++
  }
}

// Admin-granted manual Pro with a premiumUntil date that has passed.
// If the user also has an active subscription, keep isPremium and just clear
// the manual date so the real subscription continues uninterrupted.
async function expireManualPro(
  now: Date,
  summary: { manualExpired: number },
) {
  const expired = await prisma.user.findMany({
    where: { isPremium: true, premiumUntil: { lte: now } },
    select: {
      id: true,
      subscription: { select: { status: true } },
    },
  })

  for (const user of expired) {
    const hasActiveSub =
      user.subscription?.status === "active" ||
      user.subscription?.status === "canceling"

    if (hasActiveSub) {
      await prisma.user.update({
        where: { id: user.id },
        data: { premiumUntil: null },
      })
    } else {
      await downgradeToFree(user.id)
      await prisma.user.update({
        where: { id: user.id },
        data: { premiumUntil: null },
      })
    }
    summary.manualExpired++
  }
}

// Reconciles what Mercado Pago is still about to charge against who is actually
// entitled to be charged. This is the only safety net for a subscription whose
// local trace is gone entirely — deleting a user row cascades its subscription
// away, taking mpPreapprovalId with it, while Mercado Pago happily keeps
// billing the card every month. Running daily means an orphan is caught well
// before its next monthly charge.
async function cancelOrphanSubscriptions(summary: { orphansCanceled: number }) {
  const live = await searchLivePreapprovals()
  if (!live.ok || !live.results) {
    // Never infer "no live subscriptions" from a failed lookup.
    Sentry.captureMessage("Orphan reconciliation skipped: preapproval search failed", {
      level: "error",
      tags: { area: "billing" },
      extra: { error: live.error },
    })
    return
  }

  type Orphan = {
    preapproval: (typeof live.results)[number]
    reason: OrphanReason
    userId: string | null
  }
  const orphans: Orphan[] = []

  for (const preapproval of live.results) {
    // A database error here must abort the sweep, not be read as "this user
    // does not exist" — that mistake cancels paying customers.
    const verdict = await classifyPreapproval({
      id: preapproval.id,
      externalReference: preapproval.externalReference,
      dateCreated: preapproval.dateCreated,
    }).catch((err) => {
      Sentry.captureException(err, {
        tags: { area: "billing", job: "orphan-reconciliation" },
        extra: { preapprovalId: preapproval.id },
      })
      return null
    })
    if (!verdict) return
    if (verdict.orphaned) {
      orphans.push({ preapproval, reason: verdict.reason, userId: verdict.userId })
    }
  }

  if (orphans.length > MAX_ORPHAN_CANCELS_PER_RUN) {
    Sentry.captureMessage("Orphan reconciliation aborted: too many candidates", {
      level: "error",
      tags: { area: "billing" },
      extra: {
        candidates: orphans.length,
        limit: MAX_ORPHAN_CANCELS_PER_RUN,
        preapprovalIds: orphans.map((o) => o.preapproval.id),
      },
    })
    return
  }

  for (const { preapproval, reason, userId } of orphans) {
    const { cancelled } = await cancelOrphanPreapproval({
      preapprovalId: preapproval.id,
      reason,
      userId,
      payerEmail: preapproval.payerEmail,
      source: "cron",
      detail: { preapprovalStatus: preapproval.status },
    })
    if (cancelled) summary.orphansCanceled++
  }
}
