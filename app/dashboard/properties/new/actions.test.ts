import { describe, test, expect, mock } from "bun:test"

const mockGetSession = mock(() =>
  Promise.resolve<{ user: { id: string; isPremium: boolean; role: string } } | null>({
    user: { id: "u1", isPremium: false, role: "user" },
  })
)

mock.module("@/lib/auth", () => ({
  getSession: mockGetSession,
  auth: { api: {} },
}))

// next/headers is mocked globally in test-setup.ts

const mockPropertyCount = mock(() => Promise.resolve(0))
const mockPropertyFindUnique = mock(() => Promise.resolve(null))
const mockPropertyCreate = mock((...args: [{ data: { userId: string } }]) => {
  void args
  return Promise.resolve({ id: "prop-1" })
})
const mockUserFindUnique = mock(() =>
  Promise.resolve<{ onboarding: unknown } | null>(null)
)

mock.module("@/lib/prisma", () => ({
  prisma: {
    property: {
      count: mockPropertyCount,
      findUnique: mockPropertyFindUnique,
      create: mockPropertyCreate,
    },
    user: { findUnique: mockUserFindUnique },
  },
}))

const mockCaptureException = mock(() => {})
// mock.module() replaces "@sentry/nextjs" process-wide, so this stub must
// carry every Sentry function any other module reaches for — a partial one
// makes unrelated code throw "is not a function" in the full-suite run.
mock.module("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
  captureMessage: () => undefined,
}))

const mockSetOnboardingFlag = mock(() => Promise.resolve())
mock.module("@/lib/onboarding-server", () => ({
  setOnboardingFlag: mockSetOnboardingFlag,
}))

// @/lib/onboarding's parseOnboarding is pure and already covered directly in
// lib/onboarding.test.ts — run the real thing here via mockUserFindUnique's
// `onboarding` field instead of mocking the module (mock.module() replaces a
// module process-wide, and other test files need it for their own flags).

const { createProperty, isPropertyTourPending, completePropertyTour } = await import("./actions")

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

describe("createProperty", () => {
  test("returns error when unauthenticated", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null))
    const result = await createProperty(validInput)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/sesión/i)
    mockGetSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "u1", isPremium: false, role: "user" } })
    )
  })

  test("returns error for invalid input", async () => {
    const result = await createProperty({ ...validInput, title: "" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBeDefined()
  })

  test("returns error when photo limit exceeded (free user)", async () => {
    const images = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}.jpg`)
    const result = await createProperty({ ...validInput, images })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/foto/i)
  })

  test("returns error when active property limit reached (free user)", async () => {
    mockPropertyCount.mockImplementation(() => Promise.resolve(3))
    const result = await createProperty(validInput)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toMatch(/límite|máximo/i)
    mockPropertyCount.mockImplementation(() => Promise.resolve(0))
  })

  test("creates property and returns id on valid input", async () => {
    const result = await createProperty(validInput)
    expect(result.success).toBe(true)
    if (result.success) expect(result.id).toBe("prop-1")
  })

  test("calls prisma.property.create with correct userId", async () => {
    mockPropertyCreate.mockClear()
    await createProperty(validInput)
    expect(mockPropertyCreate).toHaveBeenCalledTimes(1)
    const [call] = mockPropertyCreate.mock.calls
    expect(call[0].data.userId).toBe("u1")
  })

  test("calls setOnboardingFlag after successful creation", async () => {
    mockSetOnboardingFlag.mockClear()
    await createProperty(validInput)
    expect(mockSetOnboardingFlag).toHaveBeenCalledWith("u1", "firstPropertyCreated")
  })

  test("captures exception with Sentry and returns error on unexpected failure", async () => {
    mockPropertyCreate.mockImplementation(() => { throw new Error("DB down") })
    mockCaptureException.mockClear()
    const result = await createProperty(validInput)
    expect(result.success).toBe(false)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    mockPropertyCreate.mockImplementation(() => Promise.resolve({ id: "prop-1" }))
  })

  test("pro user can exceed free photo limit up to pro limit", async () => {
    mockGetSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "u1", isPremium: true, role: "user" } })
    )
    const images = Array.from({ length: 15 }, (_, i) => `https://example.com/${i}.jpg`)
    const result = await createProperty({ ...validInput, images })
    expect(result.success).toBe(true)
    mockGetSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "u1", isPremium: false, role: "user" } })
    )
  })
})

describe("isPropertyTourPending", () => {
  test("returns false when unauthenticated", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null))
    expect(await isPropertyTourPending()).toBe(false)
    mockGetSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "u1", isPremium: false, role: "user" } })
    )
  })

  test("returns true when the tour hasn't been completed", async () => {
    mockUserFindUnique.mockImplementation(() =>
      Promise.resolve({ onboarding: { propertyTourCompleted: false } })
    )
    expect(await isPropertyTourPending()).toBe(true)
  })

  test("returns false when the tour was already completed", async () => {
    mockUserFindUnique.mockImplementation(() =>
      Promise.resolve({ onboarding: { propertyTourCompleted: true } })
    )
    expect(await isPropertyTourPending()).toBe(false)
    mockUserFindUnique.mockImplementation(() => Promise.resolve(null))
  })
})

describe("completePropertyTour", () => {
  test("does nothing when unauthenticated", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null))
    mockSetOnboardingFlag.mockClear()
    await completePropertyTour()
    expect(mockSetOnboardingFlag).not.toHaveBeenCalled()
    mockGetSession.mockImplementation(() =>
      Promise.resolve({ user: { id: "u1", isPremium: false, role: "user" } })
    )
  })

  test("sets the propertyTourCompleted flag when authenticated", async () => {
    mockSetOnboardingFlag.mockClear()
    await completePropertyTour()
    expect(mockSetOnboardingFlag).toHaveBeenCalledWith("u1", "propertyTourCompleted")
  })
})
