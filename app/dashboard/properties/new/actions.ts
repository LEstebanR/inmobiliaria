"use server"

import * as Sentry from "@sentry/nextjs"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PropertySchema, type PropertyInput } from "@/lib/validations/property"
import { propertyLimit, photoLimit, hasProAccess, PRO_PROPERTY_LIMIT } from "@/lib/plans"
import { setOnboardingFlag } from "@/lib/onboarding-server"
import { parseOnboarding } from "@/lib/onboarding"

async function generateUniqueSlug(): Promise<string> {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  for (let attempt = 0; attempt < 10; attempt++) {
    const slug = Array.from({ length: 7 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("")
    const existing = await prisma.property.findUnique({ where: { slug } })
    if (!existing) return slug
  }
  throw new Error("No se pudo generar un slug único")
}

export async function isPropertyTourPending(): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboarding: true },
  })
  return !parseOnboarding(user?.onboarding).propertyTourCompleted
}

export async function completePropertyTour(): Promise<void> {
  const session = await getSession()
  if (!session) return
  await setOnboardingFlag(session.user.id, "propertyTourCompleted")
}

export async function getEnglishProfileStatus(): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { bioEn: true },
  })
  return !!user?.bioEn
}

type CreateResult = { success: true; id: string } | { success: false; error: string }

export async function createProperty(data: PropertyInput): Promise<CreateResult> {
  try {
    const session = await getSession()
    if (!session) return { success: false, error: "Sesión expirada. Vuelve a iniciar sesión." }

    const parsed = PropertySchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const proAccess = hasProAccess(session.user)
    const maxPhotos = photoLimit(proAccess)
    if (parsed.data.images.length > maxPhotos) {
      return { success: false, error: `Tu plan permite máximo ${maxPhotos} fotos por propiedad.` }
    }

    const limit = propertyLimit(proAccess)
    const activeCount = await prisma.property.count({
      where: { userId: session.user.id, published: true },
    })
    if (activeCount >= limit) {
      return {
        success: false,
        error: proAccess
          ? `Has alcanzado el máximo de ${limit} propiedades activas de tu plan Pro. Contáctanos para un plan personalizado.`
          : `Has alcanzado el límite de ${limit} propiedades activas del plan gratuito. Actualiza a Pro para publicar hasta ${PRO_PROPERTY_LIMIT} propiedades.`,
      }
    }

    const slug = await generateUniqueSlug()
    const property = await prisma.property.create({
      data: {
        slug,
        userId: session.user.id,
        title: parsed.data.title,
        titleEn: parsed.data.titleEn,
        type: parsed.data.type,
        transactionType: parsed.data.transactionType,
        price: parsed.data.price,
        state: parsed.data.state,
        city: parsed.data.city,
        neighborhood: parsed.data.neighborhood,
        area: parsed.data.area,
        landArea: parsed.data.landArea,
        gatedCommunity: parsed.data.gatedCommunity,
        bedrooms: parsed.data.bedrooms,
        bathrooms: parsed.data.bathrooms,
        parking: parsed.data.parking,
        description: parsed.data.description,
        descriptionEn: parsed.data.descriptionEn,
        englishAvailable: parsed.data.englishAvailable,
        images: parsed.data.images,
        videoUrl: parsed.data.videoUrl,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
        showContact: parsed.data.showContact,
      },
    })

    // Best-effort: a flag-write failure must not fail the (already committed) create.
    await setOnboardingFlag(session.user.id, "firstPropertyCreated").catch(() => {})

    return { success: true, id: property.id }
  } catch (err) {
    Sentry.captureException(err, { tags: { action: "createProperty" } })
    console.error("createProperty failed:", err)
    return {
      success: false,
      error:
        "No pudimos guardar la propiedad. Revisa tu conexión y, si agregaste un video, que el enlace sea de YouTube. Si el problema persiste, recarga la página.",
    }
  }
}
