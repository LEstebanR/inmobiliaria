import crypto from "crypto"

const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN ?? ""
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? ""

const API_BASE = "https://api.mercadopago.com"

export const PRO_AMOUNT_COP = 99_999
const CURRENCY = "COP"
const SUBSCRIPTION_REASON = "Conexory Pro — suscripción mensual"

export function makeExternalReference(userId: string): string {
  return `pro-${userId}-${Date.now()}`
}

// Inverse of makeExternalReference: recovers the user a Mercado Pago object
// belongs to. Cuids can contain dashes, so the id is everything between the
// "pro-" prefix and the trailing timestamp.
export function referenceToUserId(reference: string): string | null {
  const match = reference.match(/^pro-([^-]+(?:-[^-]+)*)-\d+$/)
  if (!match) return null
  const parts = reference.split("-")
  if (parts.length < 3) return null
  return parts.slice(1, -1).join("-")
}

export interface CreatePreapprovalResult {
  ok: boolean
  preapprovalId?: string
  status?: string
  cardBrand?: string
  error?: string
}

// The buyer's card is tokenized client-side (lib/mercadopago.js's cardForm,
// via the public key — raw card data never reaches our server) into a
// cardTokenId, which authorizes the subscription immediately instead of
// bouncing the buyer to Mercado Pago's hosted checkout. Mercado Pago still
// drives every future recurring charge itself and tells us about it via
// webhook, so there's no server-side cron charging.
export async function createPreapproval({
  userId,
  email,
  backUrl,
  cardTokenId,
}: {
  userId: string
  email: string
  backUrl: string
  cardTokenId: string
}): Promise<CreatePreapprovalResult> {
  if (!MERCADOPAGO_ACCESS_TOKEN) return { ok: false, error: "missing_access_token" }

  const res = await fetch(`${API_BASE}/preapproval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      reason: SUBSCRIPTION_REASON,
      external_reference: makeExternalReference(userId),
      payer_email: email,
      card_token_id: cardTokenId,
      back_url: backUrl,
      status: "authorized",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: PRO_AMOUNT_COP,
        currency_id: CURRENCY,
      },
    }),
    cache: "no-store",
  })

  const raw = await res.text()
  const json = parseJson<{ id?: string; status?: string; payment_method_id?: string; message?: string }>(
    raw,
  )

  if (!res.ok || !json?.id) {
    console.error("[mercadopago] createPreapproval failed:", res.status, raw.slice(0, 500))
    return { ok: false, error: json?.message ?? `http_${res.status}` }
  }

  return { ok: true, preapprovalId: json.id, status: json.status, cardBrand: json.payment_method_id }
}

export interface CardTokenDetails {
  ok: boolean
  cardLastFour?: string
  error?: string
}

// Looks up the last four digits of a just-tokenized card by its token id.
// Mercado Pago's card-tokenization endpoint (which cardForm calls internally)
// returns this in its own creation response, but cardForm's client-side
// wrapper never surfaces it to us — this fetches the same record server-side
// right after we receive the token, so subscribeAction/changeCardAction can
// show the real card immediately instead of waiting on a webhook.
export async function getCardToken(tokenId: string): Promise<CardTokenDetails> {
  const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
  if (!publicKey) return { ok: false, error: "missing_public_key" }

  const res = await fetch(
    `${API_BASE}/v1/card_tokens/${tokenId}?public_key=${encodeURIComponent(publicKey)}`,
    { cache: "no-store" },
  )
  const raw = await res.text()
  const json = parseJson<{ last_four_digits?: string }>(raw)

  if (!res.ok) {
    console.error("[mercadopago] getCardToken failed:", res.status, raw.slice(0, 500))
    return { ok: false, error: `http_${res.status}` }
  }
  return { ok: true, cardLastFour: json?.last_four_digits }
}

export interface PreapprovalDetails {
  ok: boolean
  status?: string
  externalReference?: string
  payerEmail?: string
  dateCreated?: Date | null
  error?: string
}

// Webhooks only carry an id — this fetches the authoritative object, unlike
// Wompi which embedded the full transaction/subscription in the event body.
export async function getPreapproval(preapprovalId: string): Promise<PreapprovalDetails> {
  if (!MERCADOPAGO_ACCESS_TOKEN) return { ok: false, error: "missing_access_token" }

  const res = await fetch(`${API_BASE}/preapproval/${preapprovalId}`, {
    headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    cache: "no-store",
  })
  const raw = await res.text()
  const json = parseJson<{
    status?: string
    external_reference?: string
    payer_email?: string
    date_created?: string
  }>(raw)

  if (!res.ok) {
    console.error("[mercadopago] getPreapproval failed:", res.status, raw.slice(0, 500))
    return { ok: false, error: `http_${res.status}` }
  }
  return {
    ok: true,
    status: json?.status,
    externalReference: json?.external_reference,
    payerEmail: json?.payer_email,
    dateCreated: parseDate(json?.date_created),
  }
}

export interface PaymentDetails {
  ok: boolean
  status?: string
  externalReference?: string
  preapprovalId?: string
  amountCents?: number
  cardBrand?: string
  cardLastFour?: string
  error?: string
}

// A "payment" is one recurring charge generated by a preapproval. external_reference
// is propagated from the parent subscription, so referenceToUserId() works the same
// way it did for Wompi transactions. Unlike the preapproval itself, an individual
// payment embeds the card used (brand via payment_method_id, last_four_digits under
// card) — that's the only place Mercado Pago exposes it without a Customer API
// lookup, so the webhook is what captures it for display.
export async function getPayment(paymentId: string): Promise<PaymentDetails> {
  if (!MERCADOPAGO_ACCESS_TOKEN) return { ok: false, error: "missing_access_token" }

  const res = await fetch(`${API_BASE}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    cache: "no-store",
  })
  const raw = await res.text()
  const json = parseJson<{
    status?: string
    external_reference?: string
    preapproval_id?: string
    transaction_amount?: number
    payment_method_id?: string
    card?: { last_four_digits?: string }
  }>(raw)

  if (!res.ok) {
    console.error("[mercadopago] getPayment failed:", res.status, raw.slice(0, 500))
    return { ok: false, error: `http_${res.status}` }
  }
  return {
    ok: true,
    status: json?.status,
    externalReference: json?.external_reference,
    preapprovalId: json?.preapproval_id,
    amountCents:
      typeof json?.transaction_amount === "number" ? Math.round(json.transaction_amount * 100) : undefined,
    cardBrand: json?.payment_method_id,
    cardLastFour: json?.card?.last_four_digits,
  }
}

export interface CancelPreapprovalResult {
  ok: boolean
  error?: string
}

// Stops future auto-charges immediately on Mercado Pago's side. Unlike Wompi
// (where we drove every charge, so a local status flip was enough), Mercado
// Pago keeps billing on its own schedule until told otherwise.
export async function cancelPreapproval(preapprovalId: string): Promise<CancelPreapprovalResult> {
  if (!MERCADOPAGO_ACCESS_TOKEN) return { ok: false, error: "missing_access_token" }

  const res = await fetch(`${API_BASE}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
    cache: "no-store",
  })

  if (!res.ok) {
    const raw = await res.text()
    console.error("[mercadopago] cancelPreapproval failed:", res.status, raw.slice(0, 500))
    return { ok: false, error: `http_${res.status}` }
  }
  return { ok: true }
}

export interface UpdatePreapprovalCardResult {
  ok: boolean
  cardBrand?: string
  error?: string
}

// Swaps the card charged for future recurring payments on an existing
// subscription. The buyer re-tokenizes a card client-side exactly like at
// sign-up, and this just points the same preapproval at the new token — no
// need to cancel and recreate the subscription. The response carries the new
// payment_method_id (brand) immediately; changeCardAction pairs it with
// getCardToken() for the last four digits.
export async function updatePreapprovalCard(
  preapprovalId: string,
  cardTokenId: string,
): Promise<UpdatePreapprovalCardResult> {
  if (!MERCADOPAGO_ACCESS_TOKEN) return { ok: false, error: "missing_access_token" }

  const res = await fetch(`${API_BASE}/preapproval/${preapprovalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ card_token_id: cardTokenId }),
    cache: "no-store",
  })

  const raw = await res.text()
  if (!res.ok) {
    console.error("[mercadopago] updatePreapprovalCard failed:", res.status, raw.slice(0, 500))
    return { ok: false, error: `http_${res.status}` }
  }
  const json = parseJson<{ payment_method_id?: string }>(raw)
  return { ok: true, cardBrand: json?.payment_method_id }
}

// Mercado Pago signs webhooks via the `x-signature` header ("ts=...,v1=...")
// instead of a checksum embedded in the body like Wompi. The manifest is
// "id:{data.id};request-id:{x-request-id};ts:{ts};", HMAC-SHA256'd with the
// webhook secret from the app's "Tus integraciones" panel. data.id is
// lowercased per Mercado Pago's own examples — some notifications send it
// with mixed case, which would otherwise fail verification.
export function verifyMercadoPagoWebhook({
  xSignature,
  xRequestId,
  dataId,
}: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}): boolean {
  if (!MERCADOPAGO_WEBHOOK_SECRET || !xSignature || !xRequestId || !dataId) return false

  const parts: Record<string, string> = {}
  for (const part of xSignature.split(",")) {
    const [key, value] = part.split("=")
    if (key && value) parts[key.trim()] = value.trim()
  }
  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
  const computed = crypto.createHmac("sha256", MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest("hex")

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(v1))
  } catch {
    return false
  }
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export interface PreapprovalSummary {
  id: string
  status: string
  externalReference: string | null
  payerEmail: string | null
  dateCreated: Date | null
}

export interface SearchPreapprovalsResult {
  ok: boolean
  results?: PreapprovalSummary[]
  error?: string
}

const SEARCH_PAGE_SIZE = 50
const SEARCH_MAX_PAGES = 20

// Lists the subscriptions Mercado Pago still considers live on our side of the
// account. Every other call here is driven by something we already hold locally
// (a preapproval id, a payment id); this one is the opposite direction — it
// asks Mercado Pago what it is about to charge, so we can spot preapprovals
// whose local counterpart no longer exists (e.g. a user row deleted straight
// in the database, which cascades the subscription away and leaves us with no
// record that the billing is still running).
export async function searchLivePreapprovals(): Promise<SearchPreapprovalsResult> {
  if (!MERCADOPAGO_ACCESS_TOKEN) return { ok: false, error: "missing_access_token" }

  const results: PreapprovalSummary[] = []

  // "pending" is included on purpose: an unconfirmed preapproval can still turn
  // authorized later and start charging, so an orphaned one must be cancelled
  // too, not just the already-authorized ones.
  for (const status of ["authorized", "pending"]) {
    for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
      const offset = page * SEARCH_PAGE_SIZE
      const res = await fetch(
        `${API_BASE}/preapproval/search?status=${status}&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
          cache: "no-store",
        },
      )
      const raw = await res.text()

      if (!res.ok) {
        console.error("[mercadopago] searchLivePreapprovals failed:", res.status, raw.slice(0, 500))
        return { ok: false, error: `http_${res.status}` }
      }

      const json = parseJson<{
        results?: {
          id?: string
          status?: string
          external_reference?: string
          payer_email?: string
          date_created?: string
        }[]
      }>(raw)
      const pageResults = json?.results
      if (!Array.isArray(pageResults)) {
        console.error("[mercadopago] searchLivePreapprovals: unexpected body", raw.slice(0, 500))
        return { ok: false, error: "unexpected_body" }
      }

      for (const item of pageResults) {
        if (!item?.id) continue
        results.push({
          id: item.id,
          status: item.status ?? "unknown",
          externalReference: item.external_reference ?? null,
          payerEmail: item.payer_email ?? null,
          dateCreated: parseDate(item.date_created),
        })
      }

      if (pageResults.length < SEARCH_PAGE_SIZE) break
    }
  }

  return { ok: true, results }
}
