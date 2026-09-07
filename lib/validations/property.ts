import { z } from "zod"
import { PRO_PHOTO_LIMIT } from "@/lib/plans"
import { PROPERTY_TYPE_IDS, TRANSACTION_TYPE_IDS } from "@/lib/property-types"
import { isYoutubeUrl } from "@/lib/youtube"

const optionalString = (maxLength: number) =>
  z.string().max(maxLength).transform((v) => v.trim() || null)

const optionalLocalizedString = (maxLength: number) =>
  z.string().max(maxLength).transform((v) => v.trim() || null).optional()

const optionalNonNegativeInt = z
  .string()
  .refine((v) => v === "" || /^\d+$/.test(v), {
    message: "Usa solo números enteros (por ejemplo: 2).",
  })
  .transform((v) => (v === "" ? null : parseInt(v, 10)))

const optionalPositiveFloat = z
  .string()
  .refine((v) => v === "" || /^\d+(\.\d+)?$/.test(v), {
    message: "Escribe solo números (por ejemplo: 65).",
  })
  .transform((v) => (v === "" ? null : parseFloat(v)))
  .refine((n) => n === null || n > 0, {
    message: "El valor debe ser mayor a 0.",
  })

export const PropertySchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Escríbele un título a tu propiedad (mínimo 3 caracteres).")
    .max(120, "El título quedó muy largo, déjalo en máximo 120 caracteres."),
  englishAvailable: z.boolean().optional().default(false),
  titleEn: optionalLocalizedString(120),
  type: z.enum(PROPERTY_TYPE_IDS, {
    error: "Elige el tipo de propiedad.",
  }),
  transactionType: z.enum(TRANSACTION_TYPE_IDS, {
    error: "Elige el tipo de operación.",
  }),
  price: z
    .string()
    .regex(/^\d+$/, "Escribe el precio solo con números, sin puntos ni símbolos.")
    .transform(Number)
    .refine((n) => n > 0, { message: "Ingresa un precio mayor a $0." })
    .refine((n) => n <= 9_999_999_999_999, {
      message: "Ese precio parece demasiado alto, revísalo.",
    }),
  state: optionalString(100),
  city: z
    .string()
    .trim()
    .min(2, "Selecciona la ciudad de la propiedad.")
    .max(100, "El nombre de la ciudad quedó muy largo."),
  neighborhood: optionalString(100),
  area: optionalPositiveFloat,
  landArea: optionalPositiveFloat,
  bedrooms: optionalNonNegativeInt,
  bathrooms: optionalNonNegativeInt,
  parking: optionalNonNegativeInt,
  description: optionalString(1000),
  descriptionEn: optionalLocalizedString(1000),
  // Absolute ceiling (Pro plan). The per-plan limit (10 free / 20 pro) is enforced by the actions.
  images: z.array(z.string()).max(PRO_PHOTO_LIMIT, `Puedes subir máximo ${PRO_PHOTO_LIMIT} fotos por propiedad.`),
  videoUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || isYoutubeUrl(v), {
      message: "Ese enlace no parece de YouTube. Revisa que sea el link de un video.",
    })
    .transform((v) => (v === "" ? null : v)),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  showContact: z.boolean().optional().default(false),
  gatedCommunity: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (!data.englishAvailable) return

  if (!data.description) {
    ctx.addIssue({
      code: "custom",
      path: ["description"],
      message: "La descripción en español es obligatoria para publicar en inglés.",
    })
  }

  if (!data.titleEn) {
    ctx.addIssue({
      code: "custom",
      path: ["titleEn"],
      message: "Escribe el título en inglés.",
    })
  }

  if (!data.descriptionEn) {
    ctx.addIssue({
      code: "custom",
      path: ["descriptionEn"],
      message: "Escribe la descripción en inglés.",
    })
  }
})

// type/transactionType accept any string in the input — Zod validates the enums server-side
export type PropertyInput = Omit<z.input<typeof PropertySchema>, "type" | "transactionType" | "titleEn" | "descriptionEn"> & {
  type: string
  transactionType: string
  titleEn?: string
  descriptionEn?: string
}
