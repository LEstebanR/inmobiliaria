import { describe, test, expect, mock } from "bun:test"

const userId = "cljabc123"

const mockVerifyMercadoPagoWebhook = mock((...args: [unknown]) => {
  void args
  return true
})
type PaymentDetails = {
  ok: boolean
  status?: string
  externalReference?: string
  preapprovalId?: string
}
type PreapprovalDetails = {
  ok: boolean
  status?: string
  externalReference?: string
  dateCreated?: Date | null
}
const mockGetPayment = mock((...args: [string]) => {
  void args
  return Promise.resolve<PaymentDetails>({ ok: true, status: "approved" })
})
const mockGetPreapproval = mock((...args: [string]) => {
  void args
  return Promise.resolve<PreapprovalDetails>({ ok: true, status: "cancelled" })
})
const mockCancelPreapproval = mock((...args: [string]) => {
  void args
  return Promise.resolve({ ok: true })
})

// Spread the real module so unrelated exports (makeExternalReference) stay
// real for any other test file that imports "@/lib/mercadopago" after this
// one — mock.module() replaces it process-wide, not just for this file.
const realMercadoPago = await import("@/lib/mercadopago")
mock.module("@/lib/mercadopago", () => ({
  ...realMercadoPago,
  verifyMercadoPagoWebhook: mockVerifyMercadoPagoWebhook,
  getPayment: mockGetPayment,
  getPreapproval: mockGetPreapproval,
  cancelPreapproval: mockCancelPreapproval,
}))

const mockPaymentEventCreate = mock((...args: [{ data: Record<string, unknown> }]) => {
  void args
  return Promise.resolve({})
})
const mockPaymentEventUpdate = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({})
})
const mockPaymentEventUpsert = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({})
})
const mockSubscriptionFindUnique = mock(() =>
  Promise.resolve<{ currentPeriodEnd: Date | null; status: string; lastChargeAt: Date | null } | null>(
    null
  )
)
const mockSubscriptionUpsert = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({})
})
const mockSubscriptionUpdateMany = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({ count: 1 })
})
const mockUserUpdate = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({ email: "u@example.com", name: "User" })
})
type UserRow = {
  id: string
  email: string
  name: string
  subscription: { status: string; mpPreapprovalId: string | null } | null
}
const mockUserFindUnique = mock(() =>
  Promise.resolve<UserRow | null>({
    id: userId,
    email: "u@example.com",
    name: "User",
    subscription: { status: "active", mpPreapprovalId: "pa-1" },
  })
)

mock.module("@/lib/prisma", () => ({
  prisma: {
    paymentEvent: {
      create: mockPaymentEventCreate,
      update: mockPaymentEventUpdate,
      upsert: mockPaymentEventUpsert,
    },
    subscription: {
      findUnique: mockSubscriptionFindUnique,
      upsert: mockSubscriptionUpsert,
      updateMany: mockSubscriptionUpdateMany,
    },
    user: { update: mockUserUpdate, findUnique: mockUserFindUnique },
  },
}))

const mockSendSubscriptionConfirmation = mock((...args: [string, string]) => {
  void args
  return Promise.resolve()
})
const mockSendPaymentFailed = mock((...args: [string, string]) => {
  void args
  return Promise.resolve()
})
// Spread the real module so unrelated exports (sendRenewalReminder,
// sendSubscriptionCancelled, needed by the billing cron's tests) stay real —
// mock.module() replaces "@/lib/email" process-wide, not just for this file.
const realEmail = await import("@/lib/email")
mock.module("@/lib/email", () => ({
  ...realEmail,
  sendSubscriptionConfirmation: mockSendSubscriptionConfirmation,
  sendPaymentFailed: mockSendPaymentFailed,
}))

const { POST } = await import("./route")

const reference = `pro-${userId}-1700000000`

function makeRequest(url: string, body: unknown): Request {
  return {
    url,
    headers: new Headers({ "x-signature": "ts=1,v1=x", "x-request-id": "req-1" }),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Request
}

function paymentWebhook(dataId = "pay-1") {
  return makeRequest(`https://conexory.com/api/webhooks/mercadopago?type=payment&data.id=${dataId}`, {
    type: "payment",
    data: { id: dataId },
  })
}

function preapprovalWebhook(dataId = "preapproval-1") {
  return makeRequest(
    `https://conexory.com/api/webhooks/mercadopago?type=subscription_preapproval&data.id=${dataId}`,
    { type: "subscription_preapproval", data: { id: dataId } },
  )
}

describe("POST /api/webhooks/mercadopago", () => {
  test("returns 400 for invalid JSON", async () => {
    const res = await POST({
      url: "https://conexory.com/api/webhooks/mercadopago",
      headers: new Headers(),
      text: () => Promise.resolve("not json"),
    } as unknown as Request)
    expect(res.status).toBe(400)
  })

  test("returns 401 when the signature is invalid", async () => {
    mockVerifyMercadoPagoWebhook.mockImplementationOnce(() => false)
    const res = await POST(paymentWebhook())
    expect(res.status).toBe(401)
  })

  test("returns 200 without touching anything when dataId is missing", async () => {
    mockUserUpdate.mockClear()
    const res = await POST(
      makeRequest("https://conexory.com/api/webhooks/mercadopago?type=payment", { type: "payment" }),
    )
    expect(res.status).toBe(200)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  test("returns 200 silently on a duplicate event (idempotency)", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockPaymentEventCreate.mockImplementationOnce(() => Promise.reject({ code: "P2002" }))
    mockUserUpdate.mockClear()
    const res = await POST(paymentWebhook())
    expect(res.status).toBe(200)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  test("re-throws non-duplicate errors from paymentEvent.create", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockPaymentEventCreate.mockImplementationOnce(() => Promise.reject(new Error("db down")))
    await expect(POST(paymentWebhook())).rejects.toThrow("db down")
  })

  test("approved payment activates the user and creates an active subscription", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockSubscriptionFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockUserUpdate.mockClear()
    mockSubscriptionUpsert.mockClear()
    mockSendSubscriptionConfirmation.mockClear()
    const res = await POST(paymentWebhook())
    expect(res.status).toBe(200)
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: userId }, data: { isPremium: true } })
    )
    const [call] = mockSubscriptionUpsert.mock.calls
    expect((call[0] as { create: { status: string } }).create.status).toBe("active")
    expect(mockSendSubscriptionConfirmation).toHaveBeenCalledTimes(1)
  })

  test("cancels the preapproval when an approved payment belongs to a deleted user", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockUserFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockUserUpdate.mockClear()
    mockSubscriptionUpsert.mockClear()
    mockCancelPreapproval.mockClear()
    mockPaymentEventUpsert.mockClear()
    const res = await POST(paymentWebhook())
    expect(res.status).toBe(200)
    expect(mockCancelPreapproval).toHaveBeenCalledWith("pa-1")
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
    const [auditCall] = mockPaymentEventUpsert.mock.calls
    expect(auditCall[0]).toMatchObject({
      create: { type: "orphan_subscription", status: "cancelled", userId: null },
    })
  })

  test("cancels the preapproval when an approved payment belongs to a user with no subscription row", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockUserFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ id: userId, email: "u@example.com", name: "User", subscription: null }),
    )
    mockUserUpdate.mockClear()
    mockCancelPreapproval.mockClear()
    await POST(paymentWebhook())
    expect(mockCancelPreapproval).toHaveBeenCalledWith("pa-1")
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  test("cancels a superseded preapproval that is still charging alongside the current one", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "old-pa" }),
    )
    mockUserFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: userId,
        email: "u@example.com",
        name: "User",
        subscription: { status: "active", mpPreapprovalId: "current-pa" },
      }),
    )
    mockUserUpdate.mockClear()
    mockCancelPreapproval.mockClear()
    await POST(paymentWebhook())
    expect(mockCancelPreapproval).toHaveBeenCalledWith("old-pa")
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  test("leaves a healthy subscription alone", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockSubscriptionFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockCancelPreapproval.mockClear()
    await POST(paymentWebhook())
    expect(mockCancelPreapproval).not.toHaveBeenCalled()
  })

  test("cancels an authorized preapproval notification whose user no longer exists", async () => {
    mockGetPreapproval.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: "authorized",
        externalReference: reference,
        dateCreated: new Date(Date.now() - 40 * 86_400_000),
      }),
    )
    mockUserFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockCancelPreapproval.mockClear()
    await POST(preapprovalWebhook("preapproval-1"))
    expect(mockCancelPreapproval).toHaveBeenCalledWith("preapproval-1")
  })

  test("does not cancel a just-created preapproval whose subscription row has not been written yet", async () => {
    mockGetPreapproval.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: "authorized",
        externalReference: reference,
        dateCreated: new Date(),
      }),
    )
    mockUserFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ id: userId, email: "u@example.com", name: "User", subscription: null }),
    )
    mockCancelPreapproval.mockClear()
    await POST(preapprovalWebhook("preapproval-2"))
    expect(mockCancelPreapproval).not.toHaveBeenCalled()
  })

  test("persists the card brand and last four digits from the payment", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: "approved",
        externalReference: reference,
        preapprovalId: "pa-1",
        cardBrand: "master",
        cardLastFour: "3564",
      }),
    )
    mockSubscriptionFindUnique.mockImplementationOnce(() => Promise.resolve(null))
    mockSubscriptionUpsert.mockClear()
    await POST(paymentWebhook())
    const [call] = mockSubscriptionUpsert.mock.calls
    expect((call[0] as { create: { cardBrand: string; cardLastFour: string } }).create).toMatchObject({
      cardBrand: "master",
      cardLastFour: "3564",
    })
  })

  test("does not send a confirmation email for a renewal of an active subscription", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockSubscriptionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
        status: "active",
        lastChargeAt: new Date(Date.now() - 30 * 86_400_000),
      })
    )
    mockSendSubscriptionConfirmation.mockClear()
    await POST(paymentWebhook())
    expect(mockSendSubscriptionConfirmation).not.toHaveBeenCalled()
  })

  test("sends a confirmation email the first time an optimistically-activated subscription's charge is confirmed", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockSubscriptionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
        status: "active",
        lastChargeAt: null,
      })
    )
    mockSendSubscriptionConfirmation.mockClear()
    await POST(paymentWebhook())
    expect(mockSendSubscriptionConfirmation).toHaveBeenCalledTimes(1)
  })

  test("does not extend currentPeriodEnd again when confirming an optimistically-activated subscription's first charge", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    const optimisticPeriodEnd = new Date(Date.now() + 30 * 86_400_000)
    mockSubscriptionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ currentPeriodEnd: optimisticPeriodEnd, status: "active", lastChargeAt: null })
    )
    mockSubscriptionUpsert.mockClear()
    await POST(paymentWebhook())
    const [call] = mockSubscriptionUpsert.mock.calls
    expect((call[0] as { update: { currentPeriodEnd: Date } }).update.currentPeriodEnd).toEqual(
      optimisticPeriodEnd
    )
  })

  test("extends currentPeriodEnd by 30 days on a genuine renewal", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    const currentPeriodEnd = new Date(Date.now() + 2 * 86_400_000)
    mockSubscriptionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        currentPeriodEnd,
        status: "active",
        lastChargeAt: new Date(Date.now() - 28 * 86_400_000),
      })
    )
    mockSubscriptionUpsert.mockClear()
    await POST(paymentWebhook())
    const [call] = mockSubscriptionUpsert.mock.calls
    const expected = new Date(currentPeriodEnd)
    expected.setDate(expected.getDate() + 30)
    expect((call[0] as { update: { currentPeriodEnd: Date } }).update.currentPeriodEnd).toEqual(expected)
  })

  test("ignores a late approval for a subscription the user already cancelled", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: reference, preapprovalId: "pa-1" }),
    )
    mockSubscriptionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ currentPeriodEnd: null, status: "cancelled", lastChargeAt: null })
    )
    mockUserUpdate.mockClear()
    mockSubscriptionUpsert.mockClear()
    await POST(paymentWebhook())
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled()
  })

  test("does nothing when the reference can't be resolved to a user", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "approved", externalReference: "not-a-valid-reference", preapprovalId: "pa-1" }),
    )
    mockUserUpdate.mockClear()
    const res = await POST(paymentWebhook())
    expect(res.status).toBe(200)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  test("rejected payment marks the subscription past_due and emails the user", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "rejected", externalReference: reference }),
    )
    mockSubscriptionUpdateMany.mockImplementationOnce(() => Promise.resolve({ count: 1 }))
    mockSendPaymentFailed.mockClear()
    const res = await POST(paymentWebhook())
    expect(res.status).toBe(200)
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith({
      where: { userId, pastDueSince: null },
      data: { status: "past_due", pastDueSince: expect.any(Date) },
    })
    expect(mockSendPaymentFailed).toHaveBeenCalledTimes(1)
  })

  test("does not resend the payment-failed email for a second decline in the same cycle", async () => {
    mockGetPayment.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "rejected", externalReference: reference }),
    )
    mockSubscriptionUpdateMany.mockImplementationOnce(() => Promise.resolve({ count: 0 }))
    mockSendPaymentFailed.mockClear()
    await POST(paymentWebhook())
    expect(mockSendPaymentFailed).not.toHaveBeenCalled()
  })

  test("subscription_preapproval cancelled moves an active subscription to canceling", async () => {
    mockGetPreapproval.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "cancelled", externalReference: reference }),
    )
    mockSubscriptionUpdateMany.mockClear()
    const res = await POST(preapprovalWebhook())
    expect(res.status).toBe(200)
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith({
      where: { userId, status: { in: ["active", "past_due", "incomplete"] } },
      data: { status: "canceling" },
    })
  })

  test("subscription_preapproval paused marks the subscription past_due", async () => {
    mockGetPreapproval.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "paused", externalReference: reference }),
    )
    mockSubscriptionUpdateMany.mockImplementationOnce(() => Promise.resolve({ count: 1 }))
    mockSendPaymentFailed.mockClear()
    const res = await POST(preapprovalWebhook())
    expect(res.status).toBe(200)
    expect(mockSendPaymentFailed).toHaveBeenCalledTimes(1)
  })

  test("keys idempotency by status, not just id — a later status for the same preapproval isn't a duplicate of an earlier one", async () => {
    // The same preapprovalId goes through multiple distinct notifications
    // over its lifecycle (e.g. authorized -> cancelled). Keying the
    // idempotency record only on type+id would make the second notification
    // look like a duplicate of the first (same id) and get silently dropped
    // — exactly what happened when a real cancellation never reached
    // handleCancelled because an earlier "authorized" event for the same
    // preapproval had already claimed that externalId.
    mockGetPreapproval.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, status: "cancelled", externalReference: reference }),
    )
    mockPaymentEventCreate.mockClear()
    await POST(preapprovalWebhook("preapproval-1"))
    const [[{ data }]] = mockPaymentEventCreate.mock.calls as [[{ data: { externalId: string } }]]
    expect(data.externalId).toContain("cancelled")
    expect(data.externalId).not.toBe("subscription_preapproval-preapproval-1")
  })
})
