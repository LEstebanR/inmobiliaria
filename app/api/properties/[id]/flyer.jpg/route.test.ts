import { describe, test, expect, mock, beforeEach } from "bun:test"

type Session = { user: { id: string } } | null

const mockGetSession = mock((...args: [unknown]) => {
  void args
  return Promise.resolve<Session>({ user: { id: "u1" } })
})
mock.module("@/lib/auth", () => ({
  getSession: mockGetSession,
  auth: { api: {} },
}))

const baseProperty = {
  id: "p1",
  showContact: true,
  images: ["https://blob.example.com/one.jpg", "https://blob.example.com/two.jpg"],
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  user: { name: "Luis", image: null, phone: "3001234567", brandColor: "#0a0a0a" },
}

const mockPropertyFindUnique = mock((...args: [unknown]) => {
  void args
  return Promise.resolve<typeof baseProperty | null>(baseProperty)
})
mock.module("@/lib/prisma", () => ({
  prisma: { property: { findUnique: mockPropertyFindUnique } },
}))

const mockList = mock((...args: [unknown]) => {
  void args
  return Promise.resolve<{ blobs: { url: string }[] }>({ blobs: [] })
})
const mockPut = mock((...args: [unknown, unknown, unknown]) => {
  void args
  return Promise.resolve({ url: "https://blob.example.com/flyer.jpg" })
})
// Spread the real module so unrelated exports (del, needed by other test
// files) stay real — mock.module() replaces "@vercel/blob" process-wide.
const realBlob = await import("@vercel/blob")
mock.module("@vercel/blob", () => ({ ...realBlob, list: mockList, put: mockPut }))

const mockGenerateFlyerJpeg = mock((...args: [unknown, unknown, unknown]) => {
  void args
  return Promise.resolve(Buffer.from("fake-jpeg-bytes"))
})
mock.module("@/lib/flyer", () => ({
  generateFlyerJpeg: mockGenerateFlyerJpeg,
  FLYER_RENDER_VERSION: "v1",
}))

// next/headers is mocked globally in test-setup.ts.

const { GET } = await import("./route")

function makeRequest(search = ""): Request {
  return new Request(`https://conexory.com/api/properties/p1/flyer.jpg${search}`)
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockGetSession.mockImplementation(() => Promise.resolve({ user: { id: "u1" } }))
  mockPropertyFindUnique.mockImplementation(() => Promise.resolve(baseProperty))
  mockList.mockImplementation(() => Promise.resolve({ blobs: [] }))
  mockPut.mockClear()
  mockGenerateFlyerJpeg.mockClear()
  mockGenerateFlyerJpeg.mockImplementation(() => Promise.resolve(Buffer.from("fake-jpeg-bytes")))
})

describe("GET /api/properties/[id]/flyer.jpg", () => {
  test("returns 401 when unauthenticated", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null))
    const res = await GET(makeRequest(), ctx("p1"))
    expect(res.status).toBe(401)
  })

  test("returns 404 when the property isn't the user's", async () => {
    mockPropertyFindUnique.mockImplementation(() => Promise.resolve(null))
    const res = await GET(makeRequest(), ctx("p1"))
    expect(res.status).toBe(404)
  })

  test("generates and returns a fresh JPEG when nothing is cached", async () => {
    const res = await GET(makeRequest(), ctx("p1"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
    expect(mockGenerateFlyerJpeg).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledTimes(1)
    const body = await res.arrayBuffer()
    expect(Buffer.from(body).toString()).toBe("fake-jpeg-bytes")
  })

  test("redirects to the cached blob when one already exists for this cache key", async () => {
    mockList.mockImplementation(() =>
      Promise.resolve({ blobs: [{ url: "https://blob.example.com/cached.jpg" }] })
    )
    const res = await GET(makeRequest(), ctx("p1"))
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("https://blob.example.com/cached.jpg")
    expect(mockGenerateFlyerJpeg).not.toHaveBeenCalled()
  })

  test("strips the contacto info block when the agent hid contact for this property", async () => {
    mockPropertyFindUnique.mockImplementation(() =>
      Promise.resolve({ ...baseProperty, showContact: false })
    )
    await GET(makeRequest("?include=precio,contacto"), ctx("p1"))
    const [, , options] = mockGenerateFlyerJpeg.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { include: string[] },
    ]
    expect(options.include).not.toContain("contacto")
  })

  test("falls back to the property's brand color when no accentColor is given", async () => {
    await GET(makeRequest(), ctx("p1"))
    const [, , options] = mockGenerateFlyerJpeg.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { accentColor: string },
    ]
    expect(options.accentColor).toBe("#0a0a0a")
  })

  test("keeps only selected photos that belong to the property", async () => {
    await GET(
      makeRequest("?photos=https%3A%2F%2Fblob.example.com%2Ftwo.jpg%2Chttps%3A%2F%2Felsewhere.example%2Fother.jpg"),
      ctx("p1")
    )
    const [, , options] = mockGenerateFlyerJpeg.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { photos: string[] },
    ]
    expect(options.photos).toEqual(["https://blob.example.com/two.jpg"])
  })

  test("limits selected photos to the active template capacity", async () => {
    const images = Array.from({ length: 5 }, (_, i) => `https://blob.example.com/${i + 1}.jpg`)
    mockPropertyFindUnique.mockImplementation(() => Promise.resolve({ ...baseProperty, images }))

    await GET(makeRequest(`?template=ficha&photos=${images.join(",")}`), ctx("p1"))
    const [, , options] = mockGenerateFlyerJpeg.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { photos: string[] },
    ]
    expect(options.photos).toEqual(images.slice(0, 3))
  })

  test("still returns the image even if caching the blob fails", async () => {
    mockPut.mockImplementation(() => Promise.reject(new Error("blob down")))
    const res = await GET(makeRequest(), ctx("p1"))
    expect(res.status).toBe(200)
  })

  test("falls back to the default template for an invalid template param", async () => {
    await GET(makeRequest("?template=not-a-real-template"), ctx("p1"))
    const [, , options] = mockGenerateFlyerJpeg.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { template: string },
    ]
    expect(options.template).toBe("clasica")
  })
})
