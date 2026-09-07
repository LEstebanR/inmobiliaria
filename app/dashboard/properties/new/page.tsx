"use client"

import { Suspense, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Home,
  Building2,
  Briefcase,
  ShoppingBag,
  Trees,
  Warehouse,
  Tractor,
  Hotel,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { createProperty, getEnglishProfileStatus } from "./actions"
import { FieldError, validatePropertyInput } from "../property-form"
import ImageUpload from "@/components/image-upload"
import LocationSelect from "@/components/location-select"
import PropertyTour from "./property-tour"
import { useSession } from "@/lib/auth-client"
import { photoLimit, hasProAccess } from "@/lib/plans"
import { PROPERTY_TYPES, TRANSACTION_TYPES, DEFAULT_TRANSACTION_TYPE } from "@/lib/property-types"

const MapPicker = dynamic(() => import("@/components/map-picker"), { ssr: false })

const TYPE_ICONS: Record<string, LucideIcon> = {
  apartment: Building2,
  house: Home,
  office: Briefcase,
  commercial: ShoppingBag,
  lot: Trees,
  warehouse: Warehouse,
  house_lot: Home,
  farm: Tractor,
  aparta_suite: Hotel,
}

function formatCOP(digits: string): string {
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function SectionCard({
  title,
  children,
  id,
}: {
  title: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <div id={id} className="bg-white rounded-2xl border border-hairline p-6 space-y-4">
      <h2 className="text-sm font-bold text-ink uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {children}
      {optional && <span className="ml-1.5 text-xs font-normal text-mute">Opcional</span>}
    </label>
  )
}

export default function NewPropertyPage() {
  const [type, setType] = useState("")
  const [transactionType, setTransactionType] = useState(DEFAULT_TRANSACTION_TYPE)
  const [title, setTitle] = useState("")
  const [titleEn, setTitleEn] = useState("")
  const [price, setPrice] = useState("") // plain digits, no thousand separators
  const [state, setState] = useState("")
  const [city, setCity] = useState("")
  const [neighborhood, setNeighborhood] = useState("")
  const [area, setArea] = useState("")
  const [landArea, setLandArea] = useState("")
  const [gatedCommunity, setGatedCommunity] = useState(false)
  const [bedrooms, setBedrooms] = useState("")
  const [bathrooms, setBathrooms] = useState("")
  const [parking, setParking] = useState("")
  const [description, setDescription] = useState("")
  const [descriptionEn, setDescriptionEn] = useState("")
  const [englishAvailable, setEnglishAvailable] = useState(false)
  const [englishProfileComplete, setEnglishProfileComplete] = useState(true)
  const [videoUrl, setVideoUrl] = useState("")
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [showContact, setShowContact] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { data: session } = useSession()
  const maxImages = photoLimit(
    session ? hasProAccess(session.user) : false
  )

  useEffect(() => {
    getEnglishProfileStatus().then(setEnglishProfileComplete).catch(() => setEnglishProfileComplete(false))
  }, [])

  function clearError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    setError("")

    const data = {
      title,
      titleEn,
      englishAvailable,
      type,
      transactionType,
      price,
      state,
      city,
      neighborhood,
      area,
      landArea,
      bedrooms,
      bathrooms,
      parking,
      gatedCommunity,
      description,
      descriptionEn,
      images: imageUrls,
      videoUrl,
      latitude,
      longitude,
      showContact,
    }

    const validation = validatePropertyInput(data)
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      setError("Revisa los campos marcados en rojo.")
      if (validation.sectionId) {
        document.getElementById(validation.sectionId)?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      return
    }

    setFieldErrors({})

    // Validation passed and we're publishing — now it's safe to end the form tour.
    window.dispatchEvent(new Event("conexory:finish-property-tour"))

    startTransition(async () => {
      const result = await createProperty(data)
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`/dashboard/properties/${result.id}`)
    })
  }

  return (
    <div className="flex-1 p-6 lg:p-8 max-w-3xl w-full mx-auto">
      <Suspense fallback={null}>
        <PropertyTour />
      </Suspense>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/dashboard"
          className="p-2 rounded-xl text-mute hover:bg-canvas-soft hover:text-ink transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black text-ink tracking-tight">Nueva propiedad</h1>
          <p className="text-sm text-body">Completa los datos y obtén tu link para compartir</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Property type */}
        <SectionCard id="tour-type" title="Tipo de propiedad">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {PROPERTY_TYPES.map((pt) => {
              const Icon = TYPE_ICONS[pt.id] ?? Building2
              const isSelected = type === pt.id
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => { setType(pt.id); clearError("type") }}
                  className={cn(
                    "flex flex-col items-center gap-2 py-4 px-1 text-center rounded-xl text-xs font-medium transition-all border-2",
                    isSelected
                      ? "bg-canvas-soft text-ink border-ink"
                      : "bg-white text-body border-hairline hover:border-hairline-strong hover:bg-canvas-softer"
                  )}
                >
                  <Icon
                    className={cn("w-5 h-5", isSelected ? "text-ink" : "text-mute")}
                    strokeWidth={isSelected ? 2.25 : 1.75}
                  />
                  {pt.label}
                </button>
              )
            })}
          </div>
          <FieldError message={fieldErrors.type} />
        </SectionCard>

        {/* Transaction type */}
        <SectionCard id="tour-transaction" title="Tipo de operación">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TRANSACTION_TYPES.map((tt) => {
              const isSelected = transactionType === tt.id
              return (
                <button
                  key={tt.id}
                  type="button"
                  onClick={() => setTransactionType(tt.id)}
                  className={cn(
                    "py-3 px-2 text-center rounded-xl text-sm font-medium transition-all border-2",
                    isSelected
                      ? "bg-canvas-soft text-ink border-ink"
                      : "bg-white text-body border-hairline hover:border-hairline-strong hover:bg-canvas-softer"
                  )}
                >
                  {tt.label}
                </button>
              )
            })}
          </div>
        </SectionCard>

        {/* Photos */}
        <SectionCard id="tour-photos" title="Fotos y video">
          <ImageUpload
            onUrlsChange={setImageUrls}
            onUploadingChange={setIsUploading}
            maxImages={maxImages}
          />
          <div className="space-y-1.5 pt-4 border-t border-hairline">
            <FieldLabel optional>Video de YouTube</FieldLabel>
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={videoUrl}
              onChange={(e) => { setVideoUrl(e.target.value); clearError("videoUrl") }}
              className="h-11"
              inputMode="url"
            />
            <p className="text-xs text-mute">
              Pega el enlace del video y aparecerá en el carrusel de la propiedad.
            </p>
            <FieldError message={fieldErrors.videoUrl} />
          </div>
        </SectionCard>

        {/* Basic information */}
        <SectionCard id="tour-basic" title="Información básica">
          <div className="space-y-1.5">
            <FieldLabel>Título del anuncio</FieldLabel>
            <Input
              placeholder="Ej: Apartamento moderno con vista al parque"
              value={title}
              onChange={(e) => { setTitle(e.target.value); clearError("title") }}
              className="h-11"
              maxLength={120}
            />
            <p className="text-xs text-mute text-right">{title.length}/120</p>
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel>Precio</FieldLabel>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-mute select-none">
                $
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="2.800.000"
                value={formatCOP(price)}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "")
                  setPrice(digits)
                  clearError("price")
                }}
                className="w-full h-11 pl-7 pr-16 rounded-xl border border-hairline-strong text-sm font-medium text-ink placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-ink/30 focus:border-ink transition-colors"
              />
            </div>
            <FieldError message={fieldErrors.price} />
          </div>

          <div>
            <LocationSelect
              onStateChange={setState}
              onCityChange={(c) => { setCity(c); clearError("city") }}
              required
            />
            <FieldError message={fieldErrors.city} />
          </div>

          <div className="space-y-1.5">
            <FieldLabel optional>Barrio / Zona</FieldLabel>
            <Input
              placeholder="Chapinero"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="h-11"
            />
          </div>
        </SectionCard>

        {/* Details */}
        <SectionCard id="tour-details" title="Detalles">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <FieldLabel optional>Área (m²)</FieldLabel>
              <Input
                placeholder="65"
                value={area}
                onChange={(e) => { setArea(e.target.value); clearError("area") }}
                className="h-11"
                type="number"
                inputMode="decimal"
                min="0"
              />
              <FieldError message={fieldErrors.area} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel optional>Terreno (m²)</FieldLabel>
              <Input
                placeholder="120"
                value={landArea}
                onChange={(e) => { setLandArea(e.target.value); clearError("landArea") }}
                className="h-11"
                type="number"
                inputMode="decimal"
                min="0"
              />
              <FieldError message={fieldErrors.landArea} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <FieldLabel optional>Habitaciones</FieldLabel>
              <Input
                placeholder="2"
                value={bedrooms}
                onChange={(e) => { setBedrooms(e.target.value); clearError("bedrooms") }}
                className="h-11"
                type="number"
                inputMode="numeric"
                min="0"
              />
              <FieldError message={fieldErrors.bedrooms} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel optional>Baños</FieldLabel>
              <Input
                placeholder="1"
                value={bathrooms}
                onChange={(e) => { setBathrooms(e.target.value); clearError("bathrooms") }}
                className="h-11"
                type="number"
                inputMode="numeric"
                min="0"
              />
              <FieldError message={fieldErrors.bathrooms} />
            </div>
            <div className="space-y-1.5">
              <FieldLabel optional>Parqueaderos</FieldLabel>
              <Input
                placeholder="1"
                value={parking}
                onChange={(e) => { setParking(e.target.value); clearError("parking") }}
                className="h-11"
                type="number"
                inputMode="numeric"
                min="0"
              />
              <FieldError message={fieldErrors.parking} />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer group select-none pt-2">
            <div className="relative flex-shrink-0">
              <input
                type="checkbox"
                className="sr-only"
                checked={gatedCommunity}
                onChange={(e) => setGatedCommunity(e.target.checked)}
              />
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${gatedCommunity ? "bg-ink border-ink" : "bg-white border-hairline-strong group-hover:border-ink"}`}
              >
                {gatedCommunity && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm font-semibold text-ink">Unidad cerrada</span>
          </label>
        </SectionCard>

        {/* Description */}
        <SectionCard id="tour-description" title="Descripción">
          <div className="space-y-1.5">
            <FieldLabel optional>Descripción libre</FieldLabel>
            <textarea
              placeholder="Describe la propiedad: características, acabados, ubicación, puntos de interés cercanos..."
              value={description}
              onChange={(e) => { setDescription(e.target.value); clearError("description") }}
              rows={5}
              maxLength={1000}
              className="w-full rounded-xl border border-hairline-strong px-4 py-3 text-sm text-ink placeholder:text-mute resize-none focus:outline-none focus:ring-2 focus:ring-ink/30 focus:border-ink transition-colors"
            />
            <p className="text-xs text-mute text-right">{description.length}/1000</p>
            <FieldError message={fieldErrors.description} />
          </div>
        </SectionCard>

        <SectionCard id="tour-language" title="Disponibilidad en inglés">
          <label className="flex items-start gap-3 cursor-pointer group select-none">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={englishAvailable}
                onChange={(e) => setEnglishAvailable(e.target.checked)}
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${englishAvailable ? "bg-ink border-ink" : "bg-white border-hairline-strong group-hover:border-ink"}`}>
                {englishAvailable && <span className="text-white text-xs font-black">✓</span>}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">También disponible en inglés</p>
              <p className="text-xs text-mute leading-relaxed mt-0.5">
                Crearemos un segundo link con toda la ficha traducida. Necesitas ingresar título y descripción en ambos idiomas.
              </p>
            </div>
          </label>

          {englishAvailable && (
            <div className="space-y-4 pt-4 border-t border-hairline">
              {!englishProfileComplete && (
                <div className="bg-warning-50 border border-warning-200 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-bold text-warning-900">Completa tu perfil en inglés</p>
                  <p className="text-xs text-warning-700 mt-0.5">
                    Agrega tu descripción breve en inglés en <Link href="/dashboard/settings" className="font-bold underline">Configuración</Link> para que la card del asesor aparezca traducida.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <FieldLabel>Título en inglés</FieldLabel>
                <Input
                  placeholder="E.g. Modern apartment with park view"
                  value={titleEn}
                  onChange={(e) => { setTitleEn(e.target.value); clearError("titleEn") }}
                  className="h-11"
                  maxLength={120}
                />
                <p className="text-xs text-mute text-right">{titleEn.length}/120</p>
                <FieldError message={fieldErrors.titleEn} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Descripción en inglés</FieldLabel>
                <textarea
                  placeholder="Describe the property, finishes, location and nearby points of interest..."
                  value={descriptionEn}
                  onChange={(e) => { setDescriptionEn(e.target.value); clearError("descriptionEn") }}
                  rows={5}
                  maxLength={1000}
                  className="w-full rounded-xl border border-hairline-strong px-4 py-3 text-sm text-ink placeholder:text-mute resize-none focus:outline-none focus:ring-2 focus:ring-ink/30 focus:border-ink transition-colors"
                />
                <p className="text-xs text-mute text-right">{descriptionEn.length}/1000</p>
                <FieldError message={fieldErrors.descriptionEn} />
              </div>
            </div>
          )}
        </SectionCard>

        {/* Location on map */}
        <SectionCard id="tour-map" title="Ubicación en mapa">
          <p className="text-xs text-mute -mt-1">
            Opcional. Permite mostrar la ubicación exacta en la ficha pública.
          </p>
          <MapPicker
            latitude={latitude}
            longitude={longitude}
            suggestedCity={[city, state].filter(Boolean).join(", ")}
            onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng) }}
          />
        </SectionCard>

        {/* Contact info */}
        <SectionCard id="tour-contact" title="Datos de contacto">
          <label className="flex items-start gap-3 cursor-pointer group select-none">
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={showContact}
                onChange={(e) => setShowContact(e.target.checked)}
              />
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${showContact ? "bg-ink border-ink" : "bg-white border-hairline-strong group-hover:border-ink"}`}
              >
                {showContact && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Mostrar mis datos de contacto</p>
              <p className="text-xs text-mute leading-relaxed mt-0.5">
                Tu nombre, teléfono y correo aparecerán al final del link público. Útil para compartir en redes como Instagram.
              </p>
            </div>
          </label>
        </SectionCard>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* Actions */}
        <div id="tour-submit" className="flex gap-3 pb-8">
          <Button type="button" variant="outline" className="flex-1" asChild>
            <Link href="/dashboard">Cancelar</Link>
          </Button>
          <Button
            type="submit"
            disabled={isPending || isUploading}
            className="flex-1 font-bold shadow-sm "
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Publicando...
              </>
            ) : isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Subiendo fotos...
              </>
            ) : (
              "Publicar propiedad"
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
