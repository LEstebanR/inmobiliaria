import { describe, test, expect } from "bun:test"
import crypto from "crypto"

// MERCADOPAGO_WEBHOOK_SECRET is set by test-setup.ts (bunfig.toml preload)
// before any test file — including this one — gets a chance to import the
// real module.
const { verifyMercadoPagoWebhook, makeExternalReference, referenceToUserId, searchLivePreapprovals } =
  await import("./mercadopago")

function sign(dataId: string, xRequestId: string, ts: string, secret = "test_webhook_secret") {
  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex")
  return `ts=${ts},v1=${v1}`
}

describe("verifyMercadoPagoWebhook", () => {
  const dataId = "123456"
  const xRequestId = "req-1"
  const ts = "1700000000"

  test("accepts a signature computed with the real secret", () => {
    const xSignature = sign(dataId, xRequestId, ts)
    expect(verifyMercadoPagoWebhook({ xSignature, xRequestId, dataId })).toBe(true)
  })

  test("accepts a mixed-case dataId (lowercased before hashing)", () => {
    const xSignature = sign(dataId, xRequestId, ts)
    expect(
      verifyMercadoPagoWebhook({ xSignature, xRequestId, dataId: dataId.toUpperCase() }),
    ).toBe(true)
  })

  test("rejects a signature computed with the wrong secret", () => {
    const xSignature = sign(dataId, xRequestId, ts, "wrong_secret")
    expect(verifyMercadoPagoWebhook({ xSignature, xRequestId, dataId })).toBe(false)
  })

  test("rejects a tampered dataId (manifest no longer matches)", () => {
    const xSignature = sign(dataId, xRequestId, ts)
    expect(verifyMercadoPagoWebhook({ xSignature, xRequestId, dataId: "999999" })).toBe(false)
  })

  test("rejects when x-signature is missing", () => {
    expect(verifyMercadoPagoWebhook({ xSignature: null, xRequestId, dataId })).toBe(false)
  })

  test("rejects when x-request-id is missing", () => {
    const xSignature = sign(dataId, xRequestId, ts)
    expect(verifyMercadoPagoWebhook({ xSignature, xRequestId: null, dataId })).toBe(false)
  })

  test("rejects when dataId is missing", () => {
    const xSignature = sign(dataId, xRequestId, ts)
    expect(verifyMercadoPagoWebhook({ xSignature, xRequestId, dataId: null })).toBe(false)
  })

  test("rejects a malformed x-signature header", () => {
    expect(verifyMercadoPagoWebhook({ xSignature: "not-a-valid-header", xRequestId, dataId })).toBe(
      false,
    )
  })

  test("rejects a v1 of different length instead of throwing", () => {
    expect(
      verifyMercadoPagoWebhook({ xSignature: `ts=${ts},v1=short`, xRequestId, dataId }),
    ).toBe(false)
  })
})

describe("makeExternalReference", () => {
  test("embeds the userId with a pro- prefix", () => {
    expect(makeExternalReference("user-123")).toMatch(/^pro-user-123-\d+$/)
  })
})

describe("referenceToUserId", () => {
  test("round-trips a reference produced by makeExternalReference", () => {
    const reference = makeExternalReference("cl_abc-123")
    expect(referenceToUserId(reference)).toBe("cl_abc-123")
  })

  test("returns null for a reference we did not mint", () => {
    expect(referenceToUserId("someone-elses-ref")).toBeNull()
    expect(referenceToUserId("")).toBeNull()
  })
})

describe("searchLivePreapprovals", () => {
  function stubFetch(pages: Record<string, unknown[]>) {
    const calls: string[] = []
    globalThis.fetch = ((input: string | URL) => {
      const url = String(input)
      calls.push(url)
      const results = pages[url] ?? []
      return Promise.resolve(
        new Response(JSON.stringify({ paging: { total: results.length }, results }), { status: 200 }),
      )
    }) as unknown as typeof fetch
    return calls
  }

  const originalFetch = globalThis.fetch
  const base = "https://api.mercadopago.com/preapproval/search"

  test("collects authorized and pending preapprovals", async () => {
    stubFetch({
      [`${base}?status=authorized&limit=50&offset=0`]: [
        {
          id: "pa-1",
          status: "authorized",
          external_reference: "pro-u1-1700000000",
          payer_email: "a@example.com",
          date_created: "2026-07-01T10:00:00.000Z",
        },
      ],
      [`${base}?status=pending&limit=50&offset=0`]: [{ id: "pa-2", status: "pending" }],
    })

    const result = await searchLivePreapprovals()
    globalThis.fetch = originalFetch

    expect(result.ok).toBe(true)
    expect(result.results?.map((r) => r.id)).toEqual(["pa-1", "pa-2"])
    expect(result.results?.[0]).toMatchObject({
      externalReference: "pro-u1-1700000000",
      payerEmail: "a@example.com",
      dateCreated: new Date("2026-07-01T10:00:00.000Z"),
    })
    expect(result.results?.[1].dateCreated).toBeNull()
  })

  test("follows pagination until a short page", async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: `pa-${i}`, status: "authorized" }))
    const calls = stubFetch({
      [`${base}?status=authorized&limit=50&offset=0`]: fullPage,
      [`${base}?status=authorized&limit=50&offset=50`]: [{ id: "pa-last", status: "authorized" }],
    })

    const result = await searchLivePreapprovals()
    globalThis.fetch = originalFetch

    expect(result.results).toHaveLength(51)
    expect(calls).toContain(`${base}?status=authorized&limit=50&offset=50`)
    expect(calls).not.toContain(`${base}?status=authorized&limit=50&offset=100`)
  })

  test("fails closed on an HTTP error instead of reporting an empty list", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("boom", { status: 500 }))) as unknown as typeof fetch

    const result = await searchLivePreapprovals()
    globalThis.fetch = originalFetch

    expect(result.ok).toBe(false)
    expect(result.results).toBeUndefined()
  })

  test("fails closed when the body is not the expected shape", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: "nope" }), { status: 200 }),
      )) as unknown as typeof fetch

    const result = await searchLivePreapprovals()
    globalThis.fetch = originalFetch

    expect(result.ok).toBe(false)
  })
})

// createPreapproval / getPreapproval / getPayment / cancelPreapproval aren't
// tested here: they're mock.module-replaced by lib/subscription.test.ts and
// the webhook route tests, which need them faked to unit test the callers.
// Bun's mock.module is process-global (not file-scoped), so whichever file
// registers a mock for "@/lib/mercadopago" first wins for every subsequent
// import in the same test run — a real fake here would silently be shadowed.
