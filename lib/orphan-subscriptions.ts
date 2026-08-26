import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import { cancelPreapproval, referenceToUserId } from "@/lib/mercadopago"

// A preapproval keeps charging on Mercado Pago's schedule until we cancel it,
// and nothing in our database is required for that to happen. So whenever the
// local counterpart is gone or is no longer entitled to be billed — a user row
// deleted straight in the database (which cascades the subscription away), a
// plan already cancelled or expired, a stale preapproval left behind by a
// re-subscription — the charge must be stopped at the source.

// Statuses whose subscription must not be charged again. "canceling" is absent
// on purpose: that user paid for a period still running, and Mercado Pago's
// preapproval was already cancelled when they cancelled.
const NOT_BILLABLE_STATUSES = ["cancelled", "expired"]

export type OrphanReason =
  | "unknown_reference"
  | "user_deleted"
  | "subscription_missing"
  | "subscription_not_billable"
  | "superseded_preapproval"

export type OrphanVerdict =
  | { orphaned: false }
  | { orphaned: true; reason: OrphanReason; userId: string | null }

// createPreapproval runs before startSubscription's upsert, so Mercado Pago can
// notify us about a brand-new preapproval while the local row it belongs to
// does not exist yet (or still holds the previous subscription's state). Every
// verdict that such a half-written state could produce is held back until the
// preapproval is old enough for that write to have settled — a real orphan is
// still caught by the next daily reconciliation.
const RACE_PRONE_REASONS: OrphanReason[] = [
  "subscription_missing",
  "subscription_not_billable",
  "superseded_preapproval",
]
const NEW_PREAPPROVAL_GRACE_MS = 60 * 60 * 1000

// Decides whether a live preapproval still has a local owner entitled to it.
// Deliberately conservative: anything it cannot positively identify as
// orphaned is left alone, because a false positive cancels a paying customer.
export async function classifyPreapproval(preapproval: {
  id: string
  externalReference: string | null
  // Null when the caller cannot know it (a payment notification, which arrives
  // long after the preapproval was created and so carries no race risk).
  dateCreated?: Date | null
}): Promise<OrphanVerdict> {
  const userId = referenceToUserId(preapproval.externalReference ?? "")

  // A reference we did not mint (another integration, a manual test in the
  // Mercado Pago panel) is not ours to cancel.
  if (!userId) return { orphaned: false }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, subscription: { select: { status: true, mpPreapprovalId: true } } },
  })

  // A deleted user is the one verdict no in-flight subscription can produce:
  // nothing creates a preapproval for a user row that does not exist.
  if (!user) return { orphaned: true, reason: "user_deleted", userId }

  const verdict = classifyAgainstSubscription(preapproval.id, user.subscription, userId)
  if (!verdict.orphaned) return verdict

  if (RACE_PRONE_REASONS.includes(verdict.reason) && isRecent(preapproval.dateCreated)) {
    return { orphaned: false }
  }

  return verdict
}

function classifyAgainstSubscription(
  preapprovalId: string,
  subscription: { status: string; mpPreapprovalId: string | null } | null,
  userId: string,
): OrphanVerdict {
  if (!subscription) return { orphaned: true, reason: "subscription_missing", userId }

  if (NOT_BILLABLE_STATUSES.includes(subscription.status)) {
    return { orphaned: true, reason: "subscription_not_billable", userId }
  }

  // The user is billable, but this is not the preapproval we bill them
  // through. startSubscription overwrites mpPreapprovalId when someone
  // subscribes again, so an older one can survive on Mercado Pago's side and
  // charge in parallel with the current one.
  if (subscription.mpPreapprovalId && subscription.mpPreapprovalId !== preapprovalId) {
    return { orphaned: true, reason: "superseded_preapproval", userId }
  }

  return { orphaned: false }
}

function isRecent(dateCreated: Date | null | undefined): boolean {
  if (!dateCreated) return false
  return Date.now() - dateCreated.getTime() < NEW_PREAPPROVAL_GRACE_MS
}

export interface CancelOrphanInput {
  preapprovalId: string
  reason: OrphanReason
  userId: string | null
  payerEmail?: string | null
  source: "webhook" | "cron" | "resubscribe"
  detail?: Record<string, unknown>
}

// Cancels the preapproval and leaves an audit trail that outlives the user:
// PaymentEvent's userId is SetNull on delete, so the record of what we stopped
// charging survives even when the account it belonged to is already gone.
// Money already taken is not refunded here — that stays a manual decision.
export async function cancelOrphanPreapproval(
  input: CancelOrphanInput,
): Promise<{ cancelled: boolean }> {
  const result = await cancelPreapproval(input.preapprovalId)

  await recordOrphanEvent(input, result.ok)

  Sentry.captureMessage(
    result.ok
      ? `Orphan subscription cancelled (${input.reason})`
      : `Orphan subscription could NOT be cancelled (${input.reason})`,
    {
      level: result.ok ? "warning" : "error",
      tags: { area: "billing", reason: input.reason, source: input.source },
      extra: {
        preapprovalId: input.preapprovalId,
        userId: input.userId,
        payerEmail: input.payerEmail,
        ...input.detail,
      },
    },
  )

  return { cancelled: result.ok }
}

async function recordOrphanEvent(input: CancelOrphanInput, cancelled: boolean) {
  // Keyed by preapproval + reason so a repeated attempt (a cancel that failed
  // and is retried on the next cron run) does not pile up duplicate rows.
  const externalId = `orphan-${input.preapprovalId}-${input.reason}`
  const payload = {
    preapprovalId: input.preapprovalId,
    reason: input.reason,
    userId: input.userId,
    payerEmail: input.payerEmail ?? null,
    source: input.source,
    cancelled,
    ...input.detail,
  }

  await prisma.paymentEvent
    .upsert({
      where: { externalId },
      create: {
        externalId,
        type: "orphan_subscription",
        status: cancelled ? "cancelled" : "cancel_failed",
        payload,
        // Only link a user that still exists; user_deleted has no row to point at.
        userId: input.reason === "user_deleted" ? null : input.userId,
      },
      update: { status: cancelled ? "cancelled" : "cancel_failed", payload },
    })
    .catch(() => null)
}
