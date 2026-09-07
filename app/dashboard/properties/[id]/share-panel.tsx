"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Copy, Check, ExternalLink, AlertCircle, EyeOff, Sparkles, Undo2, Loader2, ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon"
import FlyerModal from "@/components/flyer-modal"
import {
  SHARE_INFO_IDS,
  SHARE_INFO_LABELS,
  SHARE_MESSAGE_KINDS,
  SHARE_MESSAGE_KIND_LABELS,
  type ShareInfo,
  type ShareMessageKind,
} from "@/lib/share-message-options"
import { incrementShares, generateShareMessage } from "./actions"

type TemplateCtx = {
  title: string
  type: string
  location?: string
  price: string
  bedrooms?: number | null
  bathrooms?: number | null
  area?: number | null
  landArea?: number | null
  parking?: number | null
  gatedCommunity?: boolean
  description?: string | null
  include: ShareInfo[]
}

function stripEmojis(text: string): string {
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[ \t]+\n/gm, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Static templates: only used as fallback when the AI call fails.
function buildBody(templateId: ShareMessageKind, ctx: TemplateCtx): string {
  const has = (info: ShareInfo) => ctx.include.includes(info)
  const featureParts = [
    has("habitaciones") && ctx.bedrooms != null
      ? `${ctx.bedrooms} ${ctx.bedrooms === 1 ? "habitación" : "habitaciones"}`
      : null,
    has("banos") && ctx.bathrooms != null
      ? `${ctx.bathrooms} ${ctx.bathrooms === 1 ? "baño" : "baños"}`
      : null,
    has("area") && ctx.area != null ? `${ctx.area} m²` : null,
    has("terreno") && ctx.landArea != null ? `${ctx.landArea} m² de terreno` : null,
    has("parqueaderos") && ctx.parking != null
      ? `${ctx.parking} ${ctx.parking === 1 ? "parqueadero" : "parqueaderos"}`
      : null,
    has("cerrada") && ctx.gatedCommunity ? "unidad cerrada" : null,
  ].filter((l): l is string => l !== null)

  const detailLines = [
    `*${ctx.title}*`,
    `${ctx.type}${has("ubicacion") && ctx.location ? ` en ${ctx.location}` : ""}`,
    "",
    has("precio")
      ? `${templateId === "price_drop" ? "Nuevo precio" : "Precio"}: *${ctx.price}*`
      : null,
    featureParts.length > 0 ? featureParts.join(" - ") : null,
    has("descripcion") && ctx.description ? ctx.description : null,
  ].filter((l): l is string => l !== null)

  switch (templateId) {
    case "intro":
      return [
        "Hola, quiero mostrarte esta propiedad que te podría interesar:",
        "",
        ...detailLines,
        "",
        "Si quieres más detalles o coordinar una visita, escríbeme cuando gustes y con gusto te atenderé.",
        "",
        "También puedes ver todas las fotos e información completa en:",
      ].join("\n")

    case "followup":
      return [
        "Hola, quería saber si tuviste oportunidad de ver la propiedad que te compartí:",
        "",
        ...detailLines,
        "",
        "Te comparto el enlace nuevamente por si necesitas:",
      ].join("\n")

    case "price_drop":
      return [
        "Buenas noticias — bajamos el precio de esta propiedad que te habíamos mostrado:",
        "",
        ...detailLines,
        "",
        "Ver los detalles actualizados en:",
      ].join("\n")

    case "visit":
      return [
        "Hola, me encantaría mostrarte esta propiedad en persona:",
        "",
        ...detailLines,
        "",
        "¿Qué día y hora te quedan bien para una visita? Me ajusto a tu agenda.",
        "",
        "Mientras tanto puedes ver todas las fotos aquí:",
      ].join("\n")

    case "opportunity":
      return [
        "Hola, te comparto una oportunidad que vale la pena mirar:",
        "",
        ...detailLines,
        "",
        "Si te interesa, escríbeme y te cuento todos los detalles.",
        "",
        "Mira todas las fotos aquí:",
      ].join("\n")

    case "investor":
      return [
        "Hola, te comparto una propiedad interesante como inversión:",
        "",
        ...detailLines,
        "",
        "Si quieres, revisamos juntos los números y coordinamos una visita.",
        "",
        "Toda la información completa aquí:",
      ].join("\n")
  }
}

export default function SharePanel({
  url,
  urlNoContact,
  englishUrl,
  englishUrlNoContact,
  propertyId,
  slug,
  published,
  showContact,
  title,
  type,
  price,
  location,
  area,
  landArea,
  bedrooms,
  bathrooms,
  parking,
  gatedCommunity,
  description,
  isPremium,
  agentBrandColor,
  images,
}: {
  url: string
  urlNoContact: string
  englishUrl?: string
  englishUrlNoContact?: string
  propertyId: string
  slug: string
  published: boolean
  showContact: boolean
  title: string
  type: string
  price: string
  location?: string
  area?: number | null
  landArea?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  parking?: number | null
  gatedCommunity?: boolean
  description?: string | null
  isPremium: boolean
  agentBrandColor: string
  images: string[]
}) {
  const [copied, setCopied] = useState(false)
  const [language, setLanguage] = useState<"es" | "en">("es")
  const [includeContact, setIncludeContact] = useState(showContact)
  const [template, setTemplate] = useState<ShareMessageKind>("intro")

  // Only offer toggles for data the property actually has.
  const infoAvailability: Record<ShareInfo, boolean> = {
    precio: true,
    habitaciones: bedrooms != null,
    banos: bathrooms != null,
    parqueaderos: parking != null,
    area: area != null,
    terreno: landArea != null,
    cerrada: !!gatedCommunity,
    ubicacion: !!location,
    descripcion: !!description,
  }
  const availableInfo = SHARE_INFO_IDS.filter((info) => infoAvailability[info])

  const [include, setInclude] = useState<ShareInfo[]>(availableInfo)

  const ctx = {
    title,
    type,
    location,
    price,
    bedrooms,
    bathrooms,
    area,
    landArea,
    parking,
    gatedCommunity,
    description,
    include,
  }

  const [body, setBody] = useState("")
  const [generating, setGenerating] = useState(false)
  const [typing, setTyping] = useState(false)
  const [previousBody, setPreviousBody] = useState<string | null>(null)
  const [isDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches
  )
  const typingTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
    }
  }, [])

  function typeOut(full: string) {
    if (typingTimer.current !== null) window.clearTimeout(typingTimer.current)
    const text = isDesktop ? stripEmojis(full) : full
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBody(text)
      return
    }
    setTyping(true)
    setBody("")
    let shown = 0
    const step = () => {
      shown = Math.min(text.length, shown + 3)
      setBody(text.slice(0, shown))
      if (shown < text.length) {
        typingTimer.current = window.setTimeout(step, 12)
      } else {
        typingTimer.current = null
        setTyping(false)
      }
    }
    step()
  }

  function toggleInclude(info: ShareInfo) {
    setInclude((prev) =>
      prev.includes(info) ? prev.filter((i) => i !== info) : [...prev, info]
    )
  }

  function handleTemplateChange(kind: ShareMessageKind) {
    setTemplate(kind)
    setPreviousBody(body.trim() ? body : null)
    setBody("")
  }

  async function handleGenerate() {
    if (generating || typing) return
    const current = body

    // Free plan: no AI call, just fill in the static template instantly.
    if (!isPremium) {
      setPreviousBody(current.trim() ? current : null)
      typeOut(buildBody(template, ctx))
      return
    }

    setGenerating(true)
    try {
      const result = await generateShareMessage({ propertyId, kind: template, include })
      if ("error" in result) {
        // Fallback: the static template appears only when the AI call fails.
        setPreviousBody(current.trim() ? current : null)
        typeOut(buildBody(template, ctx))
        toast.error(result.error)
        return
      }
      setPreviousBody(current.trim() ? current : null)
      typeOut(result.message)
    } catch {
      setPreviousBody(current.trim() ? current : null)
      typeOut(buildBody(template, ctx))
      toast.error("No pudimos generar con IA — te dejamos una plantilla base.")
    } finally {
      setGenerating(false)
    }
  }

  function handleUndoGenerate() {
    if (previousBody === null) return
    setBody(previousBody)
    setPreviousBody(null)
  }

  const canShare = body.trim().length > 0 && !typing
  const shareBody = isDesktop ? stripEmojis(body) : body
  const selectedUrl = language === "en" && englishUrl
    ? includeContact ? englishUrl : englishUrlNoContact ?? englishUrl
    : includeContact ? url : urlNoContact
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareBody + "\n" + selectedUrl)}`

  async function handleCopy() {
    await navigator.clipboard.writeText(selectedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleWhatsApp() {
    incrementShares(propertyId).catch(() => {})
  }

  return (
    <div className="bg-white rounded-2xl border border-hairline p-6 space-y-5">

      {/* Message */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-ink uppercase tracking-widest">Mensaje</p>

        {/* Template chips */}
        <div className="space-y-1.5">
          <span className="text-xs text-mute font-medium">Tipo:</span>
          <div className="flex flex-wrap gap-2">
            {SHARE_MESSAGE_KINDS.map((kind) => (
              <button
                key={kind}
                onClick={() => handleTemplateChange(kind)}
                disabled={generating || typing}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none ${
                  template === kind
                    ? "bg-ink text-white"
                    : "bg-canvas-soft text-body hover:bg-surface-pressed hover:text-ink"
                }`}
              >
                {SHARE_MESSAGE_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
        </div>

        {/* Info toggles */}
        <div className="space-y-1.5">
          <span className="text-xs text-mute font-medium">Incluir:</span>
          <div className="flex flex-wrap gap-2">
            {availableInfo.map((info) => (
              <button
                key={info}
                onClick={() => toggleInclude(info)}
                disabled={generating || typing}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none ${
                  include.includes(info)
                    ? "bg-ink text-white"
                    : "bg-canvas-soft text-mute hover:bg-surface-pressed hover:text-ink"
                }`}
              >
                {SHARE_INFO_LABELS[info]}
              </button>
            ))}
          </div>
        </div>

        {/* Editable body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          readOnly={typing || generating}
          placeholder={
            generating
              ? "Generando mensaje…"
              : isPremium
                ? "Elige el tipo de mensaje y pulsa Generar con IA."
                : "Elige el tipo de mensaje y pulsa Usar plantilla."
          }
          className="w-full bg-canvas-softer border border-hairline rounded-xl px-4 py-3 text-sm text-ink placeholder:text-mute resize-none focus:outline-none focus:ring-1 focus:ring-ink/30 transition-colors leading-relaxed"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || typing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-full bg-ink text-white hover:bg-elevated transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {generating ? "Generando…" : isPremium ? "Generar con IA" : "Usar plantilla"}
          </button>
          {previousBody !== null && !generating && !typing && (
            <button
              onClick={handleUndoGenerate}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-body hover:bg-canvas-soft hover:text-ink transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Deshacer
            </button>
          )}
        </div>
        {isPremium ? (
          <p className="text-xs text-mute leading-relaxed -mt-1">
            El enlace de la propiedad se añade automáticamente al final según el botón que uses.
          </p>
        ) : (
          <p className="text-xs text-mute leading-relaxed -mt-1">
            <Link href="/dashboard/upgrade" className="font-semibold text-ink hover:opacity-70 transition-opacity">Activa Pro</Link>
            {" "}para generar mensajes personalizados con IA. El enlace de la propiedad se añade automáticamente al final.
          </p>
        )}
      </div>

      <div className="border-t border-hairline" />

      {!published && (
        <div className="flex items-start gap-2 bg-warning-50 border border-warning-200 rounded-xl px-3.5 py-2.5">
          <EyeOff className="w-3.5 h-3.5 text-warning-600 flex-shrink-0 mt-px" />
          <p className="text-xs text-warning-700 leading-relaxed">
            Reactiva la propiedad para que estos enlaces y el flyer vuelvan a funcionar.
          </p>
        </div>
      )}

      {/* Public link */}
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold text-ink uppercase tracking-widest mb-0.5">Link público</p>
          <p className="text-xs text-mute leading-relaxed">Elige el idioma y si quieres mostrar tus datos de contacto.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setLanguage("es")} className={`rounded-full px-3 py-2 text-xs font-bold transition-colors ${language === "es" ? "bg-ink text-white" : "bg-canvas-soft text-body"}`}>Español</button>
          <button type="button" disabled={!englishUrl} onClick={() => setLanguage("en")} className={`rounded-full px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${language === "en" ? "bg-ink text-white" : "bg-canvas-soft text-body"}`}>English</button>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={includeContact} onChange={(e) => setIncludeContact(e.target.checked)} className="sr-only" />
          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${includeContact ? "bg-ink border-ink" : "bg-white border-hairline-strong"}`}>
            {includeContact && <Check className="w-3.5 h-3.5 text-white" />}
          </span>
          <span className="text-sm font-semibold text-ink">Mostrar mis datos de contacto</span>
        </label>

        {published && includeContact && !showContact && (
          <div className="flex items-start gap-2 bg-canvas-softer border border-hairline rounded-xl px-3.5 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 text-mute flex-shrink-0 mt-px" />
            <p className="text-xs text-mute leading-relaxed">Activa la tarjeta de contacto de esta propiedad para que tus datos aparezcan en el enlace.</p>
          </div>
        )}

        <div className={`flex items-center gap-1.5 bg-canvas-softer border border-hairline rounded-xl px-4 py-2.5 ${!published || (includeContact && !showContact) ? "opacity-40 pointer-events-none" : ""}`}>
          <span className="flex-1 text-sm text-body font-mono truncate min-w-0">{selectedUrl}</span>
          <a href={selectedUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-canvas-soft hover:bg-surface-pressed text-ink transition-colors" title="Ver">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" onClick={handleWhatsApp} className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity ${!canShare ? "opacity-40 pointer-events-none" : ""}`} title="Compartir por WhatsApp">
            <WhatsAppIcon className="w-6 h-6" />
          </a>
          <button onClick={handleCopy} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-canvas-soft hover:bg-surface-pressed text-ink transition-colors" title="Copiar enlace">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="border-t border-hairline" />

      {/* Flyer */}
      <div className="space-y-2.5">
        <div>
          <p className="text-xs font-bold text-ink uppercase tracking-widest mb-0.5">
            Flyer
          </p>
          <p className="text-xs text-mute leading-relaxed">
            Imagen lista para descargar y compartir en WhatsApp o Instagram.
          </p>
        </div>

        <FlyerModal propertyId={propertyId} slug={slug} showContact={showContact} agentBrandColor={agentBrandColor} images={images}>
          <button
            disabled={!published}
            className="flex items-center justify-center gap-2 w-full bg-ink text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-elevated transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <ImageIcon className="w-4 h-4" />
            Generar flyer
          </button>
        </FlyerModal>
      </div>

    </div>
  )
}
