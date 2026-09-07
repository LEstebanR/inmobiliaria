import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import EditForm, { type InitialData } from "./edit-form"
import { DEFAULT_TRANSACTION_TYPE } from "@/lib/property-types"
import { hasProAccess } from "@/lib/plans"

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session) redirect("/login")

  const property = await prisma.property.findUnique({
    where: { id, userId: session.user.id },
  })

  if (!property) notFound()

  const initial: InitialData = {
    id: property.id,
    title: property.title,
    titleEn: property.titleEn ?? "",
    type: property.type,
    transactionType: property.transactionType ?? DEFAULT_TRANSACTION_TYPE,
    price: Math.round(Number(property.price)).toString(),
    state: property.state ?? "",
    city: property.city,
    neighborhood: property.neighborhood ?? "",
    area: property.area?.toString() ?? "",
    landArea: property.landArea?.toString() ?? "",
    bedrooms: property.bedrooms?.toString() ?? "",
    bathrooms: property.bathrooms?.toString() ?? "",
    parking: property.parking?.toString() ?? "",
    gatedCommunity: property.gatedCommunity,
    description: property.description ?? "",
    descriptionEn: property.descriptionEn ?? "",
    englishAvailable: property.englishAvailable,
    images: property.images,
    videoUrl: property.videoUrl ?? "",
    latitude: property.latitude ?? null,
    longitude: property.longitude ?? null,
    showContact: property.showContact,
  }

  return <EditForm initial={initial} isPremium={hasProAccess(session.user)} />
}
