import { cache } from "react"
import { notFound } from "next/navigation"
import { after } from "next/server"
import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { MapPin, BedDouble, Bath, Ruler, Car, LandPlot, ShieldCheck, EyeOff, ArrowUpRight } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { getAppUrl } from "@/lib/urls"
import { youtubeId } from "@/lib/youtube"
import { PROPERTY_TYPE_LABELS as TYPE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/property-types"
import { formatCOP } from "@/lib/format"
import PublicGallery from "@/components/public-gallery"
import PropertyVideo from "@/components/property-video"
import Reveal from "@/components/reveal"
import PropertyMap from "@/components/property-map-client"
import ContactButtons from "./contact-buttons"
import SocialLinkButton from "./social-link-button"
import WhatsAppFab from "./whatsapp-fab"

const TYPE_LABELS_EN: Record<string, string> = {
  apartment: "Apartment", house: "House", office: "Office", commercial: "Commercial property",
  lot: "Lot", warehouse: "Warehouse", house_lot: "House with lot", farm: "Farm", aparta_suite: "Aparta suite",
}

const TRANSACTION_LABELS_EN: Record<string, string> = {
  sale: "For sale", rent: "For rent", rent_furnished: "Furnished rental", exchange: "Exchange",
}

// ── Social icon SVGs (same as agent page) ─────────────────────────────────

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.97a8.19 8.19 0 0 0 4.78 1.52V7.03a4.85 4.85 0 0 1-1.01-.34z" />
    </svg>
  )
}
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}
function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
      <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white" />
    </svg>
  )
}

// ── Data ───────────────────────────────────────────────────────────────────

const getProperty = cache(async (slug: string) => {
  return prisma.property.findUnique({
    where: { slug },
    include: {
      user: {
        select: {
          name: true, email: true, image: true, location: true, bio: true, bioEn: true,
          phone: true, phoneIsWhatsapp: true,
          instagram: true, facebook: true, tiktok: true, linkedin: true, youtube: true,
        },
      },
    },
  })
})

// ── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ c?: string; lang?: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { c, lang } = await searchParams
  // A throw here never reaches error.tsx — Next falls back to the not-found
  // metadata, so a DB blip would title the page "Propiedad no encontrada" and
  // tell the visitor (and Google) that a live listing is gone. Degrade to the
  // layout defaults instead and let the page render surface the real failure.
  const property = await getProperty(slug).catch(() => undefined)
  if (property === undefined) return {}
  if (!property) return { title: "Propiedad no encontrada" }

  const english = lang === "en" && property.englishAvailable
  const type = (english ? TYPE_LABELS_EN : TYPE_LABELS)[property.type] ?? property.type

  const location = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ")

  const features = [
    property.bedrooms != null
      ? `${property.bedrooms} ${english ? property.bedrooms === 1 ? "bedroom" : "bedrooms" : property.bedrooms === 1 ? "habitación" : "habitaciones"}`
      : null,
    property.bathrooms != null
      ? `${property.bathrooms} ${english ? property.bathrooms === 1 ? "bathroom" : "bathrooms" : property.bathrooms === 1 ? "baño" : "baños"}`
      : null,
    property.area != null ? `${property.area} m²` : null,
    property.parking != null
      ? `${property.parking} ${english ? property.parking === 1 ? "parking space" : "parking spaces" : property.parking === 1 ? "parqueadero" : "parqueaderos"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const price = formatCOP(Number(property.price))
  const descParts = [
    `${type}${location ? english ? ` in ${location}` : ` en ${location}` : ""}`,
    price,
    features || null,
    english ? "Contact the agent directly by WhatsApp." : "Contacta al asesor directamente por WhatsApp.",
  ].filter(Boolean)
  const description = descParts.join(". ")

  const ogTitle = `${type}${location ? english ? ` in ${location}` : ` en ${location}` : ""} — ${price}`
  const ogImage = {
    url: `/p/${slug}/og.jpg${english ? "?lang=en" : ""}`,
    width: 1200,
    height: 630,
    alt: "Propiedad en Conexory",
  }

  const meta: Metadata = {
    title: `${type}${location ? english ? ` in ${location}` : ` en ${location}` : ""} — ${price}`,
    description,
    alternates: { canonical: `/p/${slug}${english ? "?lang=en" : ""}` },
    openGraph: {
      type: "website",
      url: `/p/${slug}${english ? "?lang=en" : ""}`,
      title: ogTitle,
      description,
      siteName: "Conexory",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [`/p/${slug}/og.jpg${english ? "?lang=en" : ""}`],
    },
  }

  if (c === "0") {
    return { ...meta, robots: { index: false, follow: false } }
  }

  return meta
}

// ── Footer ─────────────────────────────────────────────────────────────────

function PageFooter({ english }: { english: boolean }) {
  return (
    <footer className="border-t border-hairline mt-2">
      <Link
        href="/"
        className="group flex items-center justify-center gap-2.5 py-6 px-4 hover:bg-canvas-softer transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center shadow-sm transition-transform group-hover:scale-105">
          <Image
            src="/mark-white.png"
            alt="Conexory"
            width={20}
            height={20}
            className="w-5 h-5"
          />
        </div>
        <div className="leading-tight">
          <p className="text-[11px] text-mute font-medium">{english ? "Published with" : "Publicado con"}</p>
          <p className="inline-flex items-center gap-0.5 text-sm font-black text-ink tracking-tight">
            Conexory
            <ArrowUpRight className="w-3.5 h-3.5 text-mute transition-all group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </p>
        </div>
      </Link>
    </footer>
  )
}

// ── Agent card (mirrors agent profile page design) ─────────────────────────

type AgentUser = {
  name: string
  email: string
  image: string | null
  location: string | null
  bio: string | null
  phone: string | null
  phoneIsWhatsapp: boolean
  instagram: string | null
  facebook: string | null
  tiktok: string | null
  linkedin: string | null
  youtube: string | null
  bioEn: string | null
}

function AgentCard({ propertyId, user, whatsappMessage, english }: { propertyId: string; user: AgentUser; whatsappMessage: string; english: boolean }) {
  const initials = user.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const socialLinks = [
    { handle: user.instagram, href: `https://instagram.com/${user.instagram}`,   label: "Instagram", Icon: InstagramIcon, eventType: "social_instagram_click" },
    { handle: user.tiktok,    href: `https://tiktok.com/@${user.tiktok}`,         label: "TikTok",    Icon: TikTokIcon,    eventType: "social_tiktok_click" },
    { handle: user.facebook,  href: `https://facebook.com/${user.facebook}`,      label: "Facebook",  Icon: FacebookIcon,  eventType: "social_facebook_click" },
    { handle: user.linkedin,  href: `https://linkedin.com/in/${user.linkedin}`,   label: "LinkedIn",  Icon: LinkedInIcon,  eventType: "social_linkedin_click" },
    { handle: user.youtube,   href: `https://youtube.com/@${user.youtube}`,       label: "YouTube",   Icon: YouTubeIcon,   eventType: "social_youtube_click" },
  ].filter(({ handle }) => !!handle)

  const hasSocial = socialLinks.length > 0

  return (
    <div className="bg-white border border-hairline rounded-2xl p-6">

      {/* Avatar */}
      <div className="flex justify-center mb-4">
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name}
            width={72}
            height={72}
            className="w-[72px] h-[72px] rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="w-[72px] h-[72px] rounded-full bg-ink flex items-center justify-center text-white text-lg font-black select-none shadow-sm">
            {initials}
          </div>
        )}
      </div>

      {/* Name + role + location */}
      <div className="text-center mb-4">
        <p className="text-base font-black text-ink tracking-tight leading-tight">{user.name}</p>
        <p className="text-xs text-mute font-medium mt-0.5">{english ? "Real estate agent" : "Asesor inmobiliario"}</p>
        {user.location && (
          <div className="flex items-center justify-center gap-1 mt-2">
            <MapPin className="w-3 h-3 text-mute flex-shrink-0" strokeWidth={2} />
            <span className="text-xs text-mute">{user.location}</span>
          </div>
        )}
      </div>

      {/* Bio */}
      {(english ? user.bioEn ?? user.bio : user.bio) && (
        <p className="text-xs text-body leading-relaxed text-center mb-4">{english ? user.bioEn ?? user.bio : user.bio}</p>
      )}

      {/* Social icons */}
      {hasSocial && (
        <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
          {socialLinks.map(({ href, label, Icon, eventType }) => (
            <SocialLinkButton key={label} propertyId={propertyId} href={href} label={label} eventType={eventType}>
              <Icon className="w-[15px] h-[15px]" />
            </SocialLinkButton>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-hairline mb-4" />

      {/* Contact buttons — equal width, icon-only, tooltip on hover */}
      <ContactButtons
        propertyId={propertyId}
        phone={user.phone}
        phoneIsWhatsapp={user.phoneIsWhatsapp}
        email={user.email}
        whatsappMessage={whatsappMessage}
      />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function PublicPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ c?: string; lang?: string }>
}) {
  const { slug } = await params
  const { c, lang } = await searchParams
  const hideContact = c === "0"

  const property = await getProperty(slug)

  if (!property) notFound()

  const english = lang === "en" && property.englishAvailable
  const title = english ? property.titleEn ?? property.title : property.title
  const description = english ? property.descriptionEn ?? property.description : property.description

  // Track visit fire-and-forget after response is sent
  if (property.published) {
    after(() => prisma.propertyVisit.create({ data: { propertyId: property.id } }))
  }

  const typeLabel = (english ? TYPE_LABELS_EN : TYPE_LABELS)[property.type] ?? property.type

  if (!property.published) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col">
        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-3xl bg-canvas-soft flex items-center justify-center mb-6">
            <EyeOff className="w-9 h-9 text-mute" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-black text-ink tracking-tight mb-2">
            {english ? "Property unavailable" : "Propiedad no disponible"}
          </h1>
          <p className="text-body text-sm leading-relaxed max-w-xs">
            {english
              ? "This property was temporarily deactivated by the agent and may no longer be available."
              : "Esta propiedad fue desactivada temporalmente por el agente. Es posible que ya no esté disponible."}
          </p>
        </main>
        <PageFooter english={english} />
      </div>
    )
  }

  const price = formatCOP(Number(property.price))
  const priceReduced =
    property.previousPrice != null &&
    Number(property.previousPrice) > Number(property.price)
  const previousPrice = priceReduced ? formatCOP(Number(property.previousPrice)) : null
  const videoId = youtubeId(property.videoUrl)
  const location = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ")
  const transactionLabel = property.transactionType
    ? (english ? TRANSACTION_LABELS_EN : TRANSACTION_TYPE_LABELS)[property.transactionType] ?? null
    : null

  const propertyUrl = `${getAppUrl()}/p/${property.slug}`
  const whatsappMessage = english
    ? `Hello, I am interested in this property: ${title}\n${propertyUrl}?lang=en`
    : `Hola, estoy interesado en esta propiedad: ${title}\n${propertyUrl}`

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: title,
    description: description ?? undefined,
    url: `${propertyUrl}${english ? "?lang=en" : ""}`,
    datePosted: property.createdAt.toISOString(),
    ...(property.images.length > 0 && { image: property.images }),
    offers: {
      "@type": "Offer",
      price: Number(property.price),
      priceCurrency: "COP",
      availability: "https://schema.org/InStock",
    },
    address: {
      "@type": "PostalAddress",
      ...(property.city && { addressLocality: property.city }),
      ...(property.state && { addressRegion: property.state }),
      addressCountry: "CO",
    },
    ...(property.bedrooms != null && { numberOfRooms: property.bedrooms }),
    ...(property.area != null && {
      floorSize: {
        "@type": "QuantitativeValue",
        value: property.area,
        unitCode: "MTK",
      },
    }),
  }

  const stats = [
    property.area != null && { icon: Ruler, value: property.area, label: "m²" },
    property.landArea != null && { icon: LandPlot, value: property.landArea, label: english ? "lot m²" : "m² lote" },
    property.bedrooms != null && {
      icon: BedDouble,
      value: property.bedrooms,
      label: english ? property.bedrooms === 1 ? "Bedroom" : "Bedrooms" : property.bedrooms === 1 ? "Habitación" : "Habitaciones",
    },
    property.bathrooms != null && {
      icon: Bath,
      value: property.bathrooms,
      label: english ? property.bathrooms === 1 ? "Bathroom" : "Bathrooms" : property.bathrooms === 1 ? "Baño" : "Baños",
    },
    property.parking != null && {
      icon: Car,
      value: property.parking,
      label: english ? property.parking === 1 ? "Parking space" : "Parking spaces" : property.parking === 1 ? "Parqueadero" : "Parqueaderos",
    },
  ].filter(Boolean) as { icon: typeof Ruler; value: number; label: string }[]

  const showContactCard = property.showContact && !hideContact

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Gallery — edge-to-edge on mobile */}
      {property.images.length > 0 && (
        <div className="w-full sm:max-w-2xl sm:mx-auto sm:px-4 sm:pt-5">
          <PublicGallery
            images={property.images}
            title={title}
            english={english}
            className="sm:rounded-2xl"
          />
        </div>
      )}

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-5 pb-8 space-y-6">
        {/* Headline + price */}
        <Reveal>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-mute mb-1.5">
                {typeLabel}{transactionLabel ? ` · ${transactionLabel}` : ""}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight leading-tight">
                {title}
              </h1>
              {location && (
                <div className="flex items-center gap-1.5 text-body text-sm mt-2">
                  <MapPin className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                  <span>{location}</span>
                </div>
              )}
              {property.gatedCommunity && (
                <div className="inline-flex items-center gap-1.5 mt-3 bg-canvas-soft text-ink text-xs font-semibold px-2.5 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
                  {english ? "Gated community" : "Unidad cerrada"}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {priceReduced && (
                <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-ink text-white">
                  {english ? "Price reduced" : "Precio reducido"}
                </span>
              )}
              <p className="text-4xl sm:text-5xl font-black text-ink tracking-tighter">
                {price}
              </p>
              {priceReduced && previousPrice && (
                <p className="text-base text-mute line-through">{previousPrice}</p>
              )}
            </div>
          </div>
        </Reveal>

        {/* Stats — horizontal row */}
        {stats.length > 0 && (
          <Reveal delay={80}>
            <div className="flex items-center divide-x divide-hairline border-y border-hairline -mx-4 sm:mx-0 sm:rounded-2xl sm:border">
              {stats.map(({ icon: Icon, value, label }) => (
                <div
                  key={label}
                  className="flex-1 flex flex-col items-center py-4 gap-1 min-w-0"
                >
                  <Icon className="w-4 h-4 text-mute" strokeWidth={1.75} />
                  <p className="text-lg font-black text-ink leading-none">{value}</p>
                  <p className="text-[11px] text-mute font-medium truncate px-1">{label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Description */}
        {description && (
          <Reveal delay={140}>
            <div>
              <h2 className="text-xs font-bold text-mute uppercase tracking-widest mb-3">
                {english ? "Description" : "Descripción"}
              </h2>
              <p className="text-[15px] text-body leading-relaxed whitespace-pre-wrap">
                {description}
              </p>
            </div>
          </Reveal>
        )}

        {/* Video — separate from the photo gallery, between description and map */}
        {videoId && (
          <Reveal delay={150}>
            <PropertyVideo videoId={videoId} title={title} />
          </Reveal>
        )}

        {/* Map */}
        {property.latitude != null && property.longitude != null && (
          <Reveal delay={180}>
            <PropertyMap
              latitude={property.latitude}
              longitude={property.longitude}
              label={location || undefined}
            />
          </Reveal>
        )}

        {/* Contact card — mobile only; desktop uses the fixed floating card */}
        {showContactCard && (
          <div className="xl:hidden">
            <Reveal delay={200}>
              <AgentCard propertyId={property.id} user={property.user} whatsappMessage={whatsappMessage} english={english} />
            </Reveal>
          </div>
        )}
      </main>

      {/* Fixed floating card — xl+ only, positioned in the right margin */}
      {showContactCard && (
        <div className="hidden xl:block fixed right-10 top-5 w-64 z-10">
          <AgentCard propertyId={property.id} user={property.user} whatsappMessage={whatsappMessage} english={english} />
        </div>
      )}

      {showContactCard && (
        <WhatsAppFab
          propertyId={property.id}
          phone={property.user.phone}
          phoneIsWhatsapp={property.user.phoneIsWhatsapp}
          whatsappMessage={whatsappMessage}
          english={english}
        />
      )}

      <PageFooter english={english} />
    </div>
  )
}
