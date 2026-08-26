import { describe, test, expect, mock, beforeEach } from "bun:test"

type Session = { user: { id: string; isPremium: boolean; role: string } } | null

const mockGetSession = mock((...args: [unknown]) => {
  void args
  return Promise.resolve<Session>({ user: { id: "u1", isPremium: false, role: "user" } })
})
mock.module("@/lib/auth", () => ({
  getSession: mockGetSession,
  auth: { api: {} },
}))

const mockPropertyFindUnique = mock((...args: [unknown]) => {
  void args
  return Promise.resolve<{ price: unknown } | null>(null)
})
const mockPropertyUpdate = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({})
})
mock.module("@/lib/prisma", () => ({
  prisma: { property: { findUnique: mockPropertyFindUnique, update: mockPropertyUpdate } },
}))

const mockCaptureException = mock((...args: [unknown, unknown]) => {
  void args
})
// mock.module() replaces "@sentry/nextjs" process-wide, so this stub must
// carry every Sentry function any other module reaches for — a partial one
// makes unrelated code throw "is not a function" in the full-suite run.
mock.module("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
  captureMessage: () => undefined,
}))

// next/headers is mocked globally in test-setup.ts.

const { updateProperty } = await import("./actions")

const validInput = {
  title: "Apartamento en Laureles",
  type: "apartment",
  transactionType: "sale",
  price: "350000000",
  state: "Antioquia",
  city: "Medellín",
  neighborhood: "Laureles",
  area: "65",
  landArea: "",
  bedrooms: "2",
  bathrooms: "2",
  parking: "1",
  description: "Bonito apartamento",
  images: ["https://example.com/a.jpg"],
  videoUrl: "",
  showContact: false,
  gatedCommunity: false,
}

beforeEach(() => {
  mockGetSession.mockImplementation(() =>
    Promise.resolve({ user: { id: "u1", isPremium: false, role: "user" } })
  )
  mockPropertyFindUnique.mockImplementation(() => Promise.resolve(null))
  mockPropertyUpdate.mockClear()
  mockCaptureException.mockClear()
})

describe("updateProperty", () => {
  test("returns an error when unauthenticated", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null))
    const result = await updateProperty("p1", validInput)
    expect(result.success).toBe(false)
  })

  test("returns an error for invalid input", async () => {
    const result = await updateProperty("p1", { ...validInput, title: "" })
    expect(result.success).toBe(false)
  })

  test("blocks exceeding the free photo limit", async () => {
    const images = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.jpg`)
    const result = await updateProperty("p1", { ...validInput, images })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/foto/i)
    expect(mockPropertyUpdate).not.toHaveBeenCalled()
  })

  test("sets previousPrice when the new price is lower than the current one", async () => {
    mockPropertyFindUnique.mockImplementation(() => Promise.resolve({ price: "400000000" }))
    const result = await updateProperty("p1", { ...validInput, price: "350000000" })
    expect(result.success).toBe(true)
    expect(mockPropertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousPrice: "400000000" }) })
    )
  })

  test("leaves previousPrice null when the price increases", async () => {
    mockPropertyFindUnique.mockImplementation(() => Promise.resolve({ price: "300000000" }))
    const result = await updateProperty("p1", { ...validInput, price: "350000000" })
    expect(result.success).toBe(true)
    expect(mockPropertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousPrice: null }) })
    )
  })

  test("leaves previousPrice null when the price is unchanged", async () => {
    mockPropertyFindUnique.mockImplementation(() => Promise.resolve({ price: "350000000" }))
    const result = await updateProperty("p1", { ...validInput, price: "350000000" })
    expect(mockPropertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousPrice: null }) })
    )
    void result
  })

  test("leaves previousPrice null when the property can't be found", async () => {
    mockPropertyFindUnique.mockImplementation(() => Promise.resolve(null))
    await updateProperty("p1", validInput)
    expect(mockPropertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousPrice: null }) })
    )
  })

  test("pro user can exceed the free photo limit up to the pro limit", async () => {
    mockGetSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "u1", isPremium: true, role: "user" } })
    )
    const images = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.jpg`)
    const result = await updateProperty("p1", { ...validInput, images })
    expect(result.success).toBe(true)
  })

  test("captures the exception with Sentry and returns a generic error on failure", async () => {
    mockPropertyUpdate.mockImplementation(() => {
      throw new Error("DB down")
    })
    const result = await updateProperty("p1", validInput)
    expect(result.success).toBe(false)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
  })
})
