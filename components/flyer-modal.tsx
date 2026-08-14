"use client"

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ReactNode } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { AlertCircle, ArrowLeft, Check, Download, ImageIcon, Loader2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColorInput } from "@/components/ui/color-input"
import { updateBrandColor } from "@/app/dashboard/settings/actions"
import {
  DEFAULT_FLYER_OPTIONS,
  FLYER_HIGHLIGHT_MAX_LENGTH,
  FLYER_INFO_IDS,
  FLYER_INFO_LABELS,
  FLYER_TEMPLATE_DESCRIPTIONS,
  FLYER_TEMPLATE_IDS,
  FLYER_TEMPLATE_LABELS,
  flyerPhotoLimit,
  type FlyerInfo,
  type FlyerTemplate,
} from "@/lib/flyer-options"

function TemplatePreview({ template, image, accentColor, exactPreview }: { template: FlyerTemplate; image?: string; accentColor: string; exactPreview?: string | null }) {
  if (exactPreview) {
    return <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-[#252525]"><img src={exactPreview} alt={`Vista previa de ${FLYER_TEMPLATE_LABELS[template]}`} className="h-full w-full object-cover" /></div>
  }
  const dark = template === "editorial" || template === "split" || template === "poster"
  const imageClass = "absolute inset-0 h-full w-full object-cover"
  return (
    <div className={`relative aspect-[4/5] overflow-hidden rounded-[14px] ${dark ? "bg-[#161616]" : "bg-[#f0f0ed]"}`}>
      {image ? <><span className="sr-only">Vista previa de la plantilla</span><img src={image} alt="" className={imageClass} /></> : <div className="absolute inset-0 bg-[linear-gradient(135deg,#d8d8d4,#fafaf8)]" />}
      {template === "poster" && <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />}
      {template === "editorial" && <div className="absolute inset-x-0 top-0 h-[46%] bg-black/60" />}
      {template === "split" && <div className="absolute inset-y-0 right-0 w-[40%]" style={{ backgroundColor: accentColor }} />}
      {template === "gallery" && <div className="absolute bottom-2 right-2 top-[35%] w-[27%] space-y-1"><i className="block h-1/3 rounded bg-white/70" /><i className="block h-1/3 rounded bg-white/50" /><i className="block h-1/3 rounded bg-white/30" /></div>}
      {template === "brutalist" && <div className="absolute inset-2 border-[3px] border-black" />}
      {template === "panorama" && <div className="absolute inset-x-0 bottom-0 h-[47%] bg-[#f3f3f1]" />}
      {template === "minimal" && <div className="absolute inset-x-0 bottom-0 h-[46%] bg-[#fafaf8]" />}
      <div className={`absolute inset-x-3 bottom-3 ${dark ? "text-white" : "text-ink"}`}>
        <div className={`mb-1 h-1 w-6 ${dark ? "bg-white" : "bg-ink"}`} style={template === "poster" ? { backgroundColor: accentColor } : undefined} />
        <div className="h-2.5 w-[72%] rounded-sm bg-current opacity-90" />
        <div className="mt-1 h-1.5 w-[46%] rounded-sm bg-current opacity-45" />
      </div>
      {template === "minimal" && <div className="absolute left-3 top-3 h-2 w-12 rounded bg-ink/80" />}
      {template === "brutalist" && <div className="absolute left-4 top-4 h-3 w-16 bg-black" />}
    </div>
  )
}

function photoLimitLabel(template: FlyerTemplate) {
  const limit = flyerPhotoLimit(template)
  return `${limit} ${limit === 1 ? "foto" : "fotos"}`
}

export default function FlyerModal({
  propertyId,
  slug,
  showContact,
  agentBrandColor,
  images,
  children,
}: {
  propertyId: string
  slug: string
  showContact: boolean
  agentBrandColor: string
  images: string[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"options" | "preview">("options")
  const [template, setTemplate] = useState<FlyerTemplate>(DEFAULT_FLYER_OPTIONS.template)
  const [highlight, setHighlight] = useState("")
  const [include, setInclude] = useState<FlyerInfo[]>(() => showContact ? DEFAULT_FLYER_OPTIONS.include : DEFAULT_FLYER_OPTIONS.include.filter((i) => i !== "contacto"))
  const [accentColor, setAccentColor] = useState(agentBrandColor)
  const [selectedImages, setSelectedImages] = useState<string[]>(images.slice(0, flyerPhotoLimit(DEFAULT_FLYER_OPTIONS.template)))
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const mobilePreviewRef = useRef<HTMLDivElement>(null)

  function toggleInclude(info: FlyerInfo) {
    if (info === "contacto" && !showContact) return
    setPreviewUrl(null)
    setPreviewError(false)
    setInclude((prev) => prev.includes(info) ? prev.filter((i) => i !== info) : [...prev, info])
  }

  function toggleImage(url: string) {
    setPreviewUrl(null)
    setPreviewError(false)
    setSelectedImages((prev) => prev.includes(url) ? (prev.length === 1 ? prev : prev.filter((item) => item !== url)) : prev.length >= flyerPhotoLimit(template) ? prev : [...prev, url])
  }

  function selectTemplate(nextTemplate: FlyerTemplate) {
    setPreviewUrl(null)
    setPreviewError(false)
    setTemplate(nextTemplate)
    setSelectedImages((prev) => {
      const limit = flyerPhotoLimit(nextTemplate)
      const nextImages = images.filter((url) => !prev.includes(url))
      return [...prev, ...nextImages].slice(0, limit)
    })
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(() => {
        const preview = mobilePreviewRef.current?.querySelector(".mt-5")
        preview?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 50)
    }
  }

  function buildFlyerParams() {
    const params = new URLSearchParams({ template, include: include.join(","), accentColor, photos: selectedImages.join(",") })
    if (highlight.trim()) params.set("highlight", highlight.trim().slice(0, FLYER_HIGHLIGHT_MAX_LENGTH))
    return params
  }

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      fetch(`/api/properties/${propertyId}/flyer.jpg?${buildFlyerParams()}`, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error("preview request failed")
          return res.blob()
        })
        .then((blob) => {
          if (controller.signal.aborted) return
          setPreviewUrl(URL.createObjectURL(blob))
          setPreviewError(false)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return
          if (!controller.signal.aborted) setPreviewError(true)
        })
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  // buildFlyerParams intentionally follows the option state used in the URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, propertyId, template, include, accentColor, highlight, selectedImages])

  async function generate() {
    setStep("preview")
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/properties/${propertyId}/flyer.jpg?${buildFlyerParams()}`)
      if (!res.ok) throw new Error("flyer request failed")
      const blob = await res.blob()
      setImageUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
      if (accentColor !== agentBrandColor) updateBrandColor(accentColor)
    } catch { setError(true) } finally { setLoading(false) }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) { setStep("options"); setImageUrl(null); setPreviewUrl(null); setPreviewError(false) }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed inset-0 z-50 flex h-full w-full flex-col overflow-y-auto bg-white p-5 animate-fade-up sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[94vh] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-black tracking-tight text-ink">Diseña tu flyer</Dialog.Title>
              <Dialog.Description className="mt-1 max-w-xl text-sm leading-relaxed text-body">
                {step === "options" ? "Elige una composición pensada para mostrar tu propiedad con criterio, no una plantilla genérica." : "Revisa el resultado y descarga una imagen lista para compartir."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="rounded-full p-2 text-mute transition-colors hover:bg-canvas-soft hover:text-ink" aria-label="Cerrar"><X className="h-5 w-5" /></button></Dialog.Close>
          </div>

          {step === "options" ? (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 flex flex-col space-y-7">
                <section ref={mobilePreviewRef} className="order-3">
                  <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-ink">03 / Composición</p><p className="mt-1 text-sm text-body">10 direcciones visuales, una sola descarga.</p></div><span className="text-xs font-semibold text-mute">{FLYER_TEMPLATE_IDS.indexOf(template) + 1} de {FLYER_TEMPLATE_IDS.length}</span></div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    {FLYER_TEMPLATE_IDS.map((id) => <button key={id} type="button" onClick={() => selectTemplate(id)} aria-pressed={template === id} className={`group text-left transition-transform hover:-translate-y-0.5 ${template === id ? "-translate-y-0.5" : ""}`}><div className={`rounded-2xl p-1 transition-colors ${template === id ? "bg-ink" : "bg-canvas-soft group-hover:bg-surface-pressed"}`}><TemplatePreview template={id} image={images[0]} accentColor={accentColor} exactPreview={template === id ? previewUrl : null} /></div><div className="px-1 pt-2"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-ink">{FLYER_TEMPLATE_LABELS[id]}</p><span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-mute">{photoLimitLabel(id)}</span></div><p className="mt-0.5 text-[11px] leading-snug text-mute">{FLYER_TEMPLATE_DESCRIPTIONS[id]}</p></div></button>)}
                  </div>
                  <div className="mt-5 rounded-2xl bg-[#171717] p-4 text-white lg:hidden"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Vista exacta</p><p className="mt-1 text-sm font-bold">Así quedará tu flyer</p></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-white/60">Actualizada</span></div><div className="mx-auto max-w-[220px] overflow-hidden rounded-xl bg-[#252525]">{!previewUrl && !previewError ? <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 text-white/50"><Loader2 className="h-5 w-5 animate-spin" /><span className="px-3 text-center text-[11px]">Actualizando vista previa…</span></div> : previewError ? <div className="flex aspect-[4/5] items-center justify-center px-5 text-center text-[11px] text-white/55">No pudimos actualizar la vista previa.</div> : previewUrl ? <img src={previewUrl} alt={`Vista previa de ${FLYER_TEMPLATE_LABELS[template]}`} className="aspect-[4/5] w-full object-contain" /> : null}</div><div className="mt-4"><label htmlFor="flyer-highlight-mobile" className="text-xs font-bold text-white/75">Una frase para destacar <span className="font-normal text-white/40">(opcional)</span></label><input id="flyer-highlight-mobile" type="text" value={highlight} onChange={(e) => { setPreviewUrl(null); setPreviewError(false); setHighlight(e.target.value) }} maxLength={FLYER_HIGHLIGHT_MAX_LENGTH} placeholder="Vista a la ciudad, recién remodelado…" className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/35" /><p className="mt-1 text-right text-[10px] text-white/40">{highlight.length}/{FLYER_HIGHLIGHT_MAX_LENGTH}</p></div></div>
                </section>
                <div className="order-3 lg:hidden"><Button className="w-full" onClick={generate} disabled={!previewUrl}><Sparkles className="h-4 w-4" />Generar flyer</Button></div>

                <section className="order-2 border-t border-hairline pt-6">
                  <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-ink">02 / Fotos</p><p className="mt-1 text-sm text-body">Elige hasta {flyerPhotoLimit(template)} {flyerPhotoLimit(template) === 1 ? "foto" : "fotos"} para {FLYER_TEMPLATE_LABELS[template].toLowerCase()}. El orden define cómo aparecen.</p></div><span className="shrink-0 rounded-full bg-canvas-soft px-2.5 py-1 text-xs font-bold text-body">{selectedImages.length}/{flyerPhotoLimit(template)}</span></div>
                  {images.length > 0 ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{images.map((url, index) => { const selected = selectedImages.includes(url); const limitReached = selectedImages.length >= flyerPhotoLimit(template); return <button key={url} type="button" onClick={() => toggleImage(url)} aria-pressed={selected} aria-disabled={!selected && limitReached} className={`relative aspect-square overflow-hidden rounded-xl border-2 transition-all ${selected ? "border-ink ring-2 ring-ink/10" : limitReached ? "cursor-not-allowed border-transparent opacity-35" : "border-transparent opacity-55 hover:opacity-100"}`}><img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />{selected && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"><Check className="h-3 w-3" /></span>}<span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{selectedImages.indexOf(url) + 1 || ""}</span></button> })}</div> : <div className="rounded-2xl bg-canvas-soft p-4 text-sm text-body">Esta propiedad no tiene fotos. Usaremos una composición tipográfica.</div>}
                </section>

                <section className="order-1 grid gap-5 border-t border-hairline pt-6 sm:grid-cols-2">
                  <div><p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-ink">01 / Información</p><div className="flex flex-wrap gap-2">{FLYER_INFO_IDS.map((id) => { const disabled = id === "contacto" && !showContact; return <button key={id} type="button" onClick={() => toggleInclude(id)} disabled={disabled} className={`rounded-full px-3 py-2 text-xs font-bold transition-colors ${disabled ? "cursor-not-allowed bg-canvas-soft text-mute opacity-50" : include.includes(id) ? "bg-ink text-white" : "bg-canvas-soft text-body hover:bg-surface-pressed hover:text-ink"}`}>{include.includes(id) && <Check className="mr-1 inline h-3 w-3" />}{FLYER_INFO_LABELS[id]}</button> })}</div></div>
                  <div><p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-ink">01 / Dirección de color</p><ColorInput value={accentColor} onChange={(value) => { setPreviewUrl(null); setPreviewError(false); setAccentColor(value) }} /></div>
                </section>
                {!showContact && <div className="order-1 flex items-start gap-2 rounded-xl border border-hairline bg-canvas-softer px-3.5 py-2.5 text-xs leading-relaxed text-mute"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />Activa “Enlace con tus datos” en esta propiedad para añadir tu teléfono.</div>}
              </div>

              <aside className="hidden flex-col gap-5 rounded-2xl bg-[#171717] p-5 text-white lg:sticky lg:top-0 lg:flex lg:self-start"><div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">Vista exacta</p><p className="mt-2 text-lg font-black tracking-tight">{FLYER_TEMPLATE_LABELS[template]}</p><p className="mt-1 text-xs leading-relaxed text-white/55">Esta imagen se genera con las mismas opciones y fotos que usarás al descargar.</p></div><div className="relative overflow-hidden rounded-xl bg-[#252525]">{!previewUrl && !previewError ? <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 text-white/50"><Loader2 className="h-6 w-6 animate-spin" /><span className="text-xs">Actualizando vista previa…</span></div> : previewError ? <div className="flex aspect-[4/5] items-center justify-center px-6 text-center text-xs text-white/55">No pudimos actualizar la vista previa. Revisa la conexión e inténtalo de nuevo.</div> : previewUrl ? <img src={previewUrl} alt={`Vista previa de ${FLYER_TEMPLATE_LABELS[template]}`} className="aspect-[4/5] w-full object-contain" /> : null}</div><div><label htmlFor="flyer-highlight" className="text-xs font-bold text-white/75">Una frase para destacar <span className="font-normal text-white/40">(opcional)</span></label><input id="flyer-highlight" type="text" value={highlight} onChange={(e) => { setPreviewUrl(null); setPreviewError(false); setHighlight(e.target.value) }} maxLength={FLYER_HIGHLIGHT_MAX_LENGTH} placeholder="Vista a la ciudad, recién remodelado…" className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3.5 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/35" /><p className="mt-1 text-right text-[10px] text-white/40">{highlight.length}/{FLYER_HIGHLIGHT_MAX_LENGTH}</p></div><Button className="mt-auto w-full bg-white text-ink hover:bg-white/90" onClick={generate} disabled={!previewUrl}><Sparkles className="h-4 w-4" />Generar flyer</Button></aside>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-xl"><div className="flex aspect-[4/5] max-h-[65vh] items-center justify-center overflow-hidden rounded-2xl bg-canvas-softer">{loading ? <div className="flex flex-col items-center gap-3 text-center text-mute"><Loader2 className="h-7 w-7 animate-spin" /><p className="text-sm font-medium">Componiendo tu flyer…</p></div> : error ? <div className="flex flex-col items-center gap-3 px-8 text-center"><AlertCircle className="h-7 w-7 text-mute" /><p className="text-sm text-body">No pudimos generar el flyer. Inténtalo de nuevo.</p><Button variant="secondary" size="sm" onClick={generate}>Reintentar</Button></div> : imageUrl ? <img src={imageUrl} alt="Flyer generado de la propiedad" className="h-full w-full object-contain" /> : null}</div><div className="mt-5 flex gap-3"><Button variant="secondary" size="icon" className="h-11 w-11 shrink-0" onClick={() => setStep("options")} disabled={loading} title="Cambiar diseño"><ArrowLeft className="h-4 w-4" /></Button>{imageUrl && !loading ? <Button asChild className="flex-1"><a href={imageUrl} download={`flyer-${slug}.jpg`}><Download className="h-4 w-4" />Descargar JPG</a></Button> : <Button className="flex-1" disabled><ImageIcon className="h-4 w-4" />Generando…</Button>}</div></div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
