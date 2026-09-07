"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react"
import { cn } from "@/lib/utils"

export default function PublicGallery({
  images,
  title,
  english = false,
  className,
}: {
  images: string[]
  title: string
  english?: boolean
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const total = images.length

  const go = useCallback(
    (dir: number) => setIndex((i) => (i + dir + total) % total),
    [total]
  )

  useEffect(() => {
    if (!lightbox) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false)
      else if (e.key === "ArrowLeft") go(-1)
      else if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [lightbox, go])

  if (total === 0) return null

  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.targetTouches[0].clientX)
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return
    const delta = touchStartX - e.changedTouches[0].clientX
    if (Math.abs(delta) > 40) go(delta > 0 ? 1 : -1)
    setTouchStartX(null)
  }

  return (
    <>
      {/* Main stage */}
      <div className={cn("relative overflow-hidden bg-canvas-soft select-none group", className)}>
        <div
          className="relative aspect-[4/3] sm:aspect-[16/10]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {images.map((url, i) => (
            <div
              key={url}
              className={cn(
                "absolute inset-0 transition-opacity duration-300",
                i === index ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            >
              <button
                type="button"
                onClick={() => setLightbox(true)}
                aria-label="Ampliar imágenes"
                className="relative block w-full h-full cursor-zoom-in"
              >
                <Image
                  fill
                  src={url}
                  alt=""
                  aria-hidden
                  priority={i === 0}
                  className="object-cover scale-110 blur-2xl opacity-50"
                  sizes="(max-width: 768px) 100vw, 768px"
                />
                <Image
                  fill
                  src={url}
                  alt={i === 0 ? title : ""}
                  priority={i === 0}
                  className="object-contain"
                  draggable={false}
                  sizes="(max-width: 768px) 100vw, 768px"
                />
              </button>
            </div>
          ))}
        </div>

        {/* Expand hint */}
        <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full">
          <Expand className="w-3.5 h-3.5" strokeWidth={2.5} />
          {english ? "View photos" : "Ver fotos"}
        </div>

        {/* Counter */}
        {total > 1 && (
          <div className="pointer-events-none absolute top-3 right-3 bg-black/55 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {index + 1} / {total}
          </div>
        )}

        {/* Arrows — always visible so navigation is obvious on desktop */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={english ? "Previous" : "Anterior"}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={english ? "Next" : "Siguiente"}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-3">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={english ? `Go to image ${i + 1}` : `Ir a imagen ${i + 1}`}
              className={cn(
                "rounded-full transition-all duration-200",
                i === index
                  ? "w-4 h-1.5 bg-ink"
                  : "w-1.5 h-1.5 bg-ink/25 hover:bg-ink/50"
              )}
            />
          ))}
        </div>
      )}

      {/* Lightbox — portaled to <body> so a transformed ancestor (Reveal)
          can't trap `position: fixed`; otherwise it wouldn't be full screen
          and backdrop-blur wouldn't blur the page. */}
      {lightbox && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full h-full sm:w-[90vw] sm:h-[90vh]"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Image
              key={images[index]}
              fill
              src={images[index]}
              alt={title}
              className="object-contain drop-shadow-2xl"
              sizes="100vw"
              priority
            />
          </div>

          <span className="absolute top-4 left-4 text-sm font-bold text-white tabular-nums bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label={english ? "Close" : "Cerrar"}
            className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-colors"
          >
            <X className="w-6 h-6 text-white" strokeWidth={2} />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={english ? "Previous" : "Anterior"}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-white" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={english ? "Next" : "Siguiente"}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-white" strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
