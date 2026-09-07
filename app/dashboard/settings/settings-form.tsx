"use client"

import { useActionState, useRef, useState, useEffect } from "react"
import { toast } from "sonner"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ColorInput } from "@/components/ui/color-input"
import { cn } from "@/lib/utils"
import { updateProfile, type ProfileState } from "./actions"
import { sanitizePhoneInput } from "@/lib/phone"

interface Props {
  name: string
  email: string
  image: string | null
  location: string
  bio: string
  bioEn: string
  phone: string
  phoneIsWhatsapp: boolean
  instagram: string
  facebook: string
  tiktok: string
  linkedin: string
  youtube: string
  brandColor: string
  showEnglishProfile: boolean
  englishProfileComplete: boolean
}

export default function SettingsForm({ name, email, image, location, bio, bioEn, phone, phoneIsWhatsapp, instagram, facebook, tiktok, linkedin, youtube, brandColor, showEnglishProfile, englishProfileComplete }: Props) {
  const [state, formAction, isPending] = useActionState<ProfileState, FormData>(updateProfile, {})
  const [avatarUrl, setAvatarUrl] = useState(image ?? "")
  const [uploading, setUploading] = useState(false)
  const [isWhatsapp, setIsWhatsapp] = useState(phoneIsWhatsapp)
  const [phoneValue, setPhoneValue] = useState(() => sanitizePhoneInput(phone))
  const [accentColor, setAccentColor] = useState(brandColor)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.success) toast.success("Perfil actualizado.")
    if (state.error) toast.error(state.error)
  }, [state])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: form })
      const { url } = await res.json()
      setAvatarUrl(url)
    } catch {
      toast.error("No se pudo subir la imagen.")
    } finally {
      setUploading(false)
    }
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="image" value={avatarUrl} />
      <input type="hidden" name="previousImage" value={image ?? ""} />
      <input type="hidden" name="phoneIsWhatsapp" value={isWhatsapp ? "true" : "false"} />
      <input type="hidden" name="brandColor" value={accentColor} />

      {/* Avatar */}
      <div className="flex items-center gap-4 pb-6 border-b border-hairline">
        <div className="relative flex-shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-ink flex items-center justify-center text-white text-xl font-bold">
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white border border-hairline-strong flex items-center justify-center hover:bg-canvas-soft transition-colors disabled:opacity-60"
          >
            <Camera className="w-3 h-3 text-ink" strokeWidth={2} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink truncate">{name}</p>
          <p className="text-xs text-mute truncate">{email}</p>
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs text-body hover:text-ink transition-colors disabled:opacity-60"
            >
              {uploading ? "Subiendo…" : "Cambiar foto"}
            </button>
            {avatarUrl && !uploading && (
              <>
                <span className="text-hairline-strong">·</span>
                <button
                  type="button"
                  onClick={() => setAvatarUrl("")}
                  className="text-xs text-mute hover:text-red-600 transition-colors"
                >
                  Eliminar foto
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-semibold text-ink">
          Nombre completo
        </label>
        <Input id="name" name="name" defaultValue={name} required maxLength={80} className="h-11" />
      </div>

      {showEnglishProfile && (
        <div className="space-y-4 pt-5 border-t border-hairline">
          {!englishProfileComplete && (
            <div className="bg-warning-50 border border-warning-200 rounded-xl px-3 py-2.5">
              <p className="text-xs font-bold text-warning-900">Perfil en inglés incompleto</p>
              <p className="text-xs text-warning-700 mt-0.5">Tienes propiedades disponibles en inglés. Completa estos campos para que la card del asesor también se muestre en inglés.</p>
            </div>
          )}
        </div>
      )}

      {/* Location */}
      <div className="space-y-1.5">
        <label htmlFor="location" className="block text-sm font-semibold text-ink">
          Ciudad de trabajo
          <span className="ml-1.5 text-xs font-normal text-mute">Opcional</span>
        </label>
        <Input
          id="location"
          name="location"
          defaultValue={location}
          placeholder="Ej. Medellín, Bogotá, Cali…"
          maxLength={80}
          className="h-11"
        />
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <label htmlFor="bio" className="block text-sm font-semibold text-ink">
          Descripción breve
          <span className="ml-1.5 text-xs font-normal text-mute">Opcional</span>
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={bio}
          placeholder="Cuéntale a tus clientes un poco sobre ti y tu experiencia…"
          maxLength={300}
          rows={3}
          className="w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink resize-none"
        />
        {showEnglishProfile && (
          <div className="pt-3 mt-3 border-t border-hairline">
            <label htmlFor="bioEn" className="block text-sm font-semibold text-ink">Descripción breve en inglés <span className="ml-1.5 text-xs font-normal text-mute">Opcional</span></label>
            <textarea id="bioEn" name="bioEn" defaultValue={bioEn} placeholder="Tell your clients about yourself and your experience…" maxLength={300} rows={3} className="w-full mt-1.5 rounded-xl border border-hairline bg-white px-3 py-2.5 text-sm text-ink placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink resize-none" />
          </div>
        )}
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="phone" className="block text-sm font-semibold text-ink">
          Teléfono de contacto
          <span className="ml-1.5 text-xs font-normal text-mute">Opcional</span>
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={phoneValue}
          onChange={(e) => setPhoneValue(sanitizePhoneInput(e.target.value))}
          placeholder="Ej. 3001234567"
          maxLength={10}
          className="h-11"
        />
        <p className="text-xs text-mute mt-1.5">
          Solo el número local, sin +57 ni espacios. Ej: 3001234567
        </p>
        <label className="flex items-center gap-2.5 cursor-pointer mt-2 select-none">
          <div className="relative flex-shrink-0">
            <input
              type="checkbox"
              className="sr-only"
              checked={isWhatsapp}
              onChange={(e) => setIsWhatsapp(e.target.checked)}
            />
            <div
              className={cn(
                "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200",
                isWhatsapp ? "bg-ink border-ink" : "bg-white border-hairline-strong hover:border-ink"
              )}
            >
              {isWhatsapp && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
          <span className="text-sm text-body">Este número también es WhatsApp</span>
        </label>
      </div>

      {/* Social networks */}
      <div className="space-y-3 pt-2 border-t border-hairline">
        <p className="text-sm font-semibold text-ink pt-2">Redes sociales <span className="ml-1 text-xs font-normal text-mute">Opcional · solo el usuario, sin @</span></p>
        {([
          { id: "instagram", name: "instagram", label: "Instagram", placeholder: "tu_usuario", value: instagram },
          { id: "tiktok",    name: "tiktok",    label: "TikTok",    placeholder: "tu_usuario", value: tiktok },
          { id: "facebook",  name: "facebook",  label: "Facebook",  placeholder: "usuario o página", value: facebook },
          { id: "linkedin",  name: "linkedin",  label: "LinkedIn",  placeholder: "perfil de LinkedIn", value: linkedin },
          { id: "youtube",   name: "youtube",   label: "YouTube",   placeholder: "canal", value: youtube },
        ] as const).map((field) => (
          <div key={field.id} className="flex items-center gap-3">
            <label htmlFor={field.id} className="w-24 text-xs font-medium text-body flex-shrink-0">{field.label}</label>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-mute font-medium select-none">@</span>
              <Input
                id={field.id}
                name={field.name}
                defaultValue={(field.value ?? "").replace(/^@/, "")}
                placeholder={field.placeholder}
                maxLength={50}
                className="h-9 pl-7 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Brand color */}
      <div className="space-y-1.5 pt-2 border-t border-hairline">
        <label htmlFor="brandColorPicker" className="block text-sm font-semibold text-ink pt-2">
          Color de marca
          <span className="ml-1.5 text-xs font-normal text-mute">Reemplaza el negro en tus flyers descargables</span>
        </label>
        <ColorInput id="brandColorPicker" value={accentColor} onChange={setAccentColor} />
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={isPending || uploading}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  )
}
