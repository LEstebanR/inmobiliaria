"use server"

import * as Sentry from "@sentry/nextjs"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PropertySchema, type PropertyInput } from "@/lib/validations/property"
import { photoLimit, hasProAccess } from "@/lib/plans"

type UpdateResult = { success: true } | { success: false; error: string }

export async function updateProperty(
  propertyId: string,
  data: PropertyInput
): Promise<UpdateResult> {
  try {
    const session = await getSession()
    if (!session) return { success: false, error: "Sesión expirada. Vuelve a iniciar sesión." }

    const parsed = PropertySchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const maxPhotos = photoLimit(hasProAccess(session.user))
    if (parsed.data.images.length > maxPhotos) {
      return { success: false, error: `Tu plan permite máximo ${maxPhotos} fotos por propiedad.` }
    }

    const current = await prisma.property.findUnique({
      where: { id: propertyId, userId: session.user.id },
      select: { price: true },
    })

    const newPrice = parsed.data.price
    const previousPrice =
      current && Number(newPrice) < Number(current.price)
        ? current.price
        : null

    await prisma.property.update({
      where: { id: propertyId, userId: session.user.id },
      data: {
        title: parsed.data.title,
        titleEn: parsed.data.titleEn,
        type: parsed.data.type,
        transactionType: parsed.data.transactionType,
        price: newPrice,
        previousPrice,
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

    return { success: true }
  } catch (err) {
    Sentry.captureException(err, { tags: { action: "updateProperty" } })
    console.error("updateProperty failed:", err)
    return {
      success: false,
      error:
        "No pudimos guardar los cambios. Revisa tu conexión y, si agregaste un video, que el enlace sea de YouTube. Si el problema persiste, recarga la página.",
    }
  }
}
