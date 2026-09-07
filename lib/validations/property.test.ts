import { describe, test, expect } from "bun:test"
import { PropertySchema } from "./property"

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

describe("PropertySchema", () => {
  test("accepts a fully valid input", () => {
    const result = PropertySchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  test("rejects an empty title", () => {
    const result = PropertySchema.safeParse({ ...validInput, title: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Escríbele un título a tu propiedad (mínimo 3 caracteres)."
      )
    }
  })

  test("rejects a negative price", () => {
    const result = PropertySchema.safeParse({ ...validInput, price: "-100" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Escribe el precio solo con números, sin puntos ni símbolos."
      )
    }
  })

  test("rejects an invalid property type", () => {
    const result = PropertySchema.safeParse({ ...validInput, type: "spaceship" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Elige el tipo de propiedad.")
    }
  })

  test("rejects more photos than the Pro plan allows", () => {
    const images = Array.from({ length: 21 }, (_, i) => `https://example.com/${i}.jpg`)
    const result = PropertySchema.safeParse({ ...validInput, images })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Puedes subir máximo 20 fotos por propiedad.")
    }
  })

  test("rejects a video URL that isn't from YouTube", () => {
    const result = PropertySchema.safeParse({ ...validInput, videoUrl: "https://vimeo.com/123" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Ese enlace no parece de YouTube. Revisa que sea el link de un video."
      )
    }
  })

  test("coerces empty optional numeric fields to null", () => {
    const result = PropertySchema.safeParse({ ...validInput, bedrooms: "", area: "" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.bedrooms).toBeNull()
      expect(result.data.area).toBeNull()
    }
  })

  test("requires Spanish and English title and description when English is enabled", () => {
    const result = PropertySchema.safeParse({ ...validInput, englishAvailable: true, description: "" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["description", "titleEn", "descriptionEn"]),
      )
    }
  })

  test("accepts bilingual content when English is enabled", () => {
    const result = PropertySchema.safeParse({
      ...validInput,
      englishAvailable: true,
      titleEn: "Modern apartment in Laureles",
      descriptionEn: "Bright apartment close to parks and restaurants.",
    })
    expect(result.success).toBe(true)
  })

  test("does not require English content for Spanish-only properties", () => {
    const result = PropertySchema.safeParse({
      ...validInput,
      englishAvailable: false,
      titleEn: "",
      descriptionEn: "",
    })
    expect(result.success).toBe(true)
  })
})
