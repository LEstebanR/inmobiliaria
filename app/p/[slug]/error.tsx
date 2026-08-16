"use client"

import Link from "next/link"
import Image from "next/image"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function PropertyError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-canvas-softer flex flex-col">
      <header className="bg-white border-b border-hairline px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <div className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center shadow-sm">
            <Image src="/mark-white.png" alt="Conexory" width={18} height={18} className="w-4.5 h-4.5" />
          </div>
          <span className="text-sm font-black text-ink tracking-tight">Conexory</span>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-canvas-soft flex items-center justify-center mb-6">
          <AlertTriangle className="w-9 h-9 text-mute" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-black text-ink tracking-tight mb-3">
          No pudimos cargar esta propiedad
        </h1>
        <p className="text-body text-sm leading-relaxed max-w-xs mb-8">
          Tuvimos un problema para mostrarla, pero el enlace es válido. Intenta de nuevo en unos segundos.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center bg-ink hover:bg-elevated text-white text-sm font-bold px-6 py-3 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Intentar de nuevo
        </button>
        {error.digest && (
          <p className="text-[11px] text-mute mt-6 font-mono">Código: {error.digest}</p>
        )}
      </main>

      <footer className="border-t border-hairline bg-white py-5 px-4 text-center">
        <p className="text-xs text-mute">
          Publicado con{" "}
          <Link href="/" className="text-ink font-semibold hover:underline">
            Conexory
          </Link>
        </p>
      </footer>
    </div>
  )
}
