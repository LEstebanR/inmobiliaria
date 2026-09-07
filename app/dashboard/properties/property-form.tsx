import { PropertySchema, type PropertyInput } from "@/lib/validations/property"

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs font-medium text-red-500 mt-1">{message}</p>
}

// Maps a Zod field path to the form section (SectionCard id) that contains it.
const FIELD_SECTION: Record<string, string> = {
  type: "tour-type",
  transactionType: "tour-transaction",
  images: "tour-photos",
  videoUrl: "tour-photos",
  title: "tour-basic",
  titleEn: "tour-language",
  price: "tour-basic",
  city: "tour-basic",
  state: "tour-basic",
  neighborhood: "tour-basic",
  area: "tour-details",
  landArea: "tour-details",
  bedrooms: "tour-details",
  bathrooms: "tour-details",
  parking: "tour-details",
  description: "tour-description",
  descriptionEn: "tour-language",
}

// Visual top-to-bottom order of the sections, to scroll to the first invalid
// one (Zod reports issues in schema order, not layout order).
const SECTION_ORDER = [
  "tour-type",
  "tour-transaction",
  "tour-photos",
  "tour-basic",
  "tour-details",
  "tour-description",
  "tour-language",
]

export type PropertyValidation =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; sectionId: string | null }

// Shared client-side validation for the create/edit property forms: returns
// per-field messages and the first invalid section to scroll into view.
export function validatePropertyInput(data: PropertyInput): PropertyValidation {
  const parsed = PropertySchema.safeParse(data)
  if (parsed.success) return { ok: true }

  const fieldErrors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "")
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  const erroredSections = new Set(
    parsed.error.issues
      .map((i) => FIELD_SECTION[String(i.path[0] ?? "")])
      .filter(Boolean),
  )
  const sectionId = SECTION_ORDER.find((s) => erroredSections.has(s)) ?? null
  return { ok: false, fieldErrors, sectionId }
}
