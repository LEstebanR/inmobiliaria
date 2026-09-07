import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, BedDouble, Bath, Ruler, Car, MapPin, EyeOff, LandPlot, ShieldCheck, Eye, MessageCircle, TrendingUp, TrendingDown, Users, Contact } from "lucide-react"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getAppUrl } from "@/lib/urls"
import { youtubeId } from "@/lib/youtube"
import { PROPERTY_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/property-types"
import { formatCOP } from "@/lib/format"
import { daysAgo } from "@/lib/dates"
import { readMetrics, socialTotal, contactTotal } from "@/lib/property-metrics"
import { hasProAccess, propertyLimit, pinnedLimit } from "@/lib/plans"
import { DEFAULT_ACCENT_COLOR } from "@/lib/flyer-options"
import SharePanel from "./share-panel"
import PropertyCarousel from "@/components/property-carousel"
import PropertyVideo from "@/components/property-video"
import PropertyActions from "./property-actions"
import PropertyMap from "@/components/property-map-client"

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session) redirect("/login")

  const weekAgo = daysAgo(7)
  const twoWeeksAgo = daysAgo(14)

  const [property, totalVisits, visitsThisWeek, visitsPrevWeek, activePropertiesCount, pinnedCount, agent] = await Promise.all([
    prisma.property.findUnique({ where: { id, userId: session.user.id } }),
    prisma.propertyVisit.count({ where: { propertyId: id } }),
    prisma.propertyVisit.count({ where: { propertyId: id, createdAt: { gte: weekAgo } } }),
    prisma.propertyVisit.count({ where: { propertyId: id, createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.property.count({ where: { userId: session.user.id, published: true, id: { not: id } } }),
    prisma.property.count({ where: { userId: session.user.id, pinnedAt: { not: null }, id: { not: id } } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { brandColor: true } }),
  ])

  if (!property) notFound()

  const isPremium = hasProAccess(session.user)
  const weekDelta = visitsThisWeek - visitsPrevWeek
  const limit = propertyLimit(isPremium)
  // Same copy togglePublished (app/dashboard/properties/[id]/actions.ts) returns
  // when it rejects the activation server-side — this is only the proactive UX hint.
  const disableActivateReason =
    !property.published && activePropertiesCount >= limit
      ? isPremium
        ? `Has alcanzado el máximo de ${limit} propiedades activas de tu plan Pro. Contáctanos para un plan personalizado.`
        : `Has alcanzado el límite de ${limit} propiedades activas del plan gratuito. Actualiza a Pro para activar más.`
      : undefined
  const pinLimit = pinnedLimit()
  // Same message togglePinned (app/dashboard/properties/[id]/actions.ts) returns
  // when it rejects pinning server-side — proactive UX hint, same as disableActivateReason.
  const disablePinReason =
    property.pinnedAt == null && pinnedCount >= pinLimit
      ? `Ya tienes ${pinLimit} propiedades fijadas. Desfija una para fijar esta.`
      : undefined
  const metrics = readMetrics(property.metrics)
  const totalWhatsapp = metrics.whatsapp
  const totalSocial = socialTotal(metrics)
  const totalContact = contactTotal(metrics)

  const publicUrl = `${getAppUrl()}/p/${property.slug}`
  const publicUrlNoContact = `${getAppUrl()}/p/${property.slug}?c=0`
  const englishUrl = property.englishAvailable ? `${getAppUrl()}/p/${property.slug}?lang=en` : undefined
  const englishUrlNoContact = property.englishAvailable ? `${getAppUrl()}/p/${property.slug}?lang=en&c=0` : undefined
  const typeLabel = PROPERTY_TYPE_LABELS[property.type] ?? property.type
  const transactionLabel = property.transactionType
    ? TRANSACTION_TYPE_LABELS[property.transactionType] ?? null
    : null
  const price = formatCOP(Number(property.price))
  const videoId = youtubeId(property.videoUrl)
  const location = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ")

  const hasDetails =
    property.area != null ||
    property.landArea != null ||
    property.bedrooms != null ||
    property.bathrooms != null ||
    property.parking != null ||
    property.gatedCommunity

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-3xl w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 -ml-2 rounded-xl text-mute hover:bg-canvas-soft hover:text-ink transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-ink tracking-tight">
              {property.published ? "Propiedad publicada" : "Propiedad desactivada"}
            </h1>
            <p className="text-sm text-body truncate">{property.title}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <PropertyActions
            propertyId={property.id}
            initialPublished={property.published}
            initialShowContact={property.showContact}
            initialPinned={property.pinnedAt != null}
            disableActivateReason={disableActivateReason}
            disablePinReason={disablePinReason}
          />
        </div>
      </div>

      {/* Deactivated banner */}
      {!property.published && (
        <div className="flex items-center gap-3 bg-warning-50 border border-warning-200 rounded-2xl px-4 py-3 mb-4">
          <EyeOff className="w-4 h-4 text-warning-600 flex-shrink-0" />
          <p className="text-sm text-warning-700 font-medium">
            El link público no está disponible mientras la propiedad esté desactivada.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* Analytics */}
        <div className="bg-white rounded-2xl border border-hairline p-6">
          <p className="text-xs font-bold text-mute uppercase tracking-wide mb-5">Estadísticas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Total visits */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-mute">
                <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="text-xs font-medium">Visitas totales</span>
              </div>
              <p className="text-3xl font-black text-ink tracking-tighter tabular-nums">{totalVisits}</p>
            </div>

            {/* Visits this week */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-mute">
                <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="text-xs font-medium">Esta semana</span>
              </div>
              <div className="flex items-end gap-1.5">
                <p className="text-3xl font-black text-ink tracking-tighter tabular-nums">{visitsThisWeek}</p>
                {weekDelta !== 0 && (
                  <span className={`flex items-center gap-0.5 text-xs font-bold mb-1 ${weekDelta > 0 ? "text-ink" : "text-mute"}`}>
                    {weekDelta > 0
                      ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={2} />
                      : <TrendingDown className="w-3.5 h-3.5" strokeWidth={2} />
                    }
                    {weekDelta > 0 ? "+" : ""}{weekDelta}
                  </span>
                )}
              </div>
            </div>

            {/* WhatsApp clicks — Pro only */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-mute">
                <MessageCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="text-xs font-medium">Clics WhatsApp</span>
              </div>
              {isPremium ? (
                <p className="text-3xl font-black text-ink tracking-tighter tabular-nums">{totalWhatsapp}</p>
              ) : (
                <p className="text-xl font-black text-mute tracking-tight">Pro</p>
              )}
            </div>

            {/* Social clicks — Pro only */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-mute">
                <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="text-xs font-medium">Redes</span>
              </div>
              {isPremium ? (
                <p className="text-3xl font-black text-ink tracking-tighter tabular-nums">{totalSocial}</p>
              ) : (
                <p className="text-xl font-black text-mute tracking-tight">Pro</p>
              )}
            </div>

            {/* Contact clicks — Pro only */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-mute">
                <Contact className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span className="text-xs font-medium">Contacto</span>
              </div>
              {isPremium ? (
                <p className="text-3xl font-black text-ink tracking-tighter tabular-nums">{totalContact}</p>
              ) : (
                <p className="text-xl font-black text-mute tracking-tight">Pro</p>
              )}
            </div>
          </div>

          {!isPremium && (
            <p className="text-xs text-mute mt-4 pt-4 border-t border-hairline">
              <Link href="/dashboard/upgrade" className="font-semibold text-ink hover:opacity-70 transition-opacity">Activa Pro</Link>
              {" "}para ver clics en WhatsApp, redes y contacto.
            </p>
          )}
        </div>

        <SharePanel
          url={publicUrl}
          urlNoContact={publicUrlNoContact}
          englishUrl={englishUrl}
          englishUrlNoContact={englishUrlNoContact}
          propertyId={property.id}
          slug={property.slug}
          published={property.published}
          showContact={property.showContact}
          title={property.title}
          type={typeLabel}
          price={price}
          location={location || undefined}
          area={property.area}
          landArea={property.landArea}
          bedrooms={property.bedrooms}
          bathrooms={property.bathrooms}
          parking={property.parking}
          gatedCommunity={property.gatedCommunity}
          description={property.description}
          isPremium={isPremium}
          agentBrandColor={agent?.brandColor ?? DEFAULT_ACCENT_COLOR}
          images={property.images}
        />

        {/* Carousel */}
        {property.images.length > 0 && (
          <PropertyCarousel
            images={property.images}
            title={property.title}
          />
        )}

        {/* Summary */}
        <div className="bg-white rounded-2xl border border-hairline p-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 sm:flex-1">
              <span className="inline-flex items-center bg-canvas-soft text-ink text-xs font-bold px-2.5 py-1 rounded-full mb-3 whitespace-nowrap">
                {typeLabel}{transactionLabel ? ` · ${transactionLabel}` : ""}
              </span>
              <h2 className="text-xl font-black text-ink tracking-tight leading-tight mb-1">
                {property.title}
              </h2>
              {location && (
                <div className="flex items-center gap-1.5 text-body text-sm">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{location}</span>
                </div>
              )}
            </div>
            <p className="text-xl sm:text-2xl font-black text-ink tracking-tighter flex-shrink-0">{price}</p>
          </div>

          {hasDetails && (
            <div className="flex flex-wrap gap-4 pt-4 border-t border-hairline">
              {property.area != null && (
                <div className="flex items-center gap-1.5 text-sm text-body">
                  <Ruler className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <span className="font-semibold">{property.area} m²</span>
                </div>
              )}
              {property.landArea != null && (
                <div className="flex items-center gap-1.5 text-sm text-body">
                  <LandPlot className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <span className="font-semibold">{property.landArea} m² de terreno</span>
                </div>
              )}
              {property.bedrooms != null && (
                <div className="flex items-center gap-1.5 text-sm text-body">
                  <BedDouble className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <span className="font-semibold">{property.bedrooms} {property.bedrooms === 1 ? "habitación" : "habitaciones"}</span>
                </div>
              )}
              {property.bathrooms != null && (
                <div className="flex items-center gap-1.5 text-sm text-body">
                  <Bath className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <span className="font-semibold">{property.bathrooms} {property.bathrooms === 1 ? "baño" : "baños"}</span>
                </div>
              )}
              {property.parking != null && (
                <div className="flex items-center gap-1.5 text-sm text-body">
                  <Car className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <span className="font-semibold">{property.parking} {property.parking === 1 ? "parqueadero" : "parqueaderos"}</span>
                </div>
              )}
              {property.gatedCommunity && (
                <div className="flex items-center gap-1.5 text-sm text-body">
                  <ShieldCheck className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <span className="font-semibold">Unidad cerrada</span>
                </div>
              )}
            </div>
          )}
        </div>

        {property.description && (
          <div className="bg-white rounded-2xl border border-hairline p-6">
            <p className="text-xs font-bold text-mute uppercase tracking-wide mb-3">Descripción</p>
            <p className="text-sm text-body leading-relaxed whitespace-pre-wrap">
              {property.description}
            </p>
          </div>
        )}

        {videoId && <PropertyVideo videoId={videoId} title={property.title} />}

        {property.latitude != null && property.longitude != null && (
          <PropertyMap
            latitude={property.latitude}
            longitude={property.longitude}
            label={location || undefined}
          />
        )}
      </div>
    </div>
  )
}
