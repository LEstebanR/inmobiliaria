// Options the agent picks in the flyer modal before generating.
// Shared between the client form and the server renderer.

export const FLYER_TEMPLATE_IDS = [
  "clasica",
  "ficha",
  "fotos",
  "editorial",
  "poster",
  "split",
  "gallery",
  "minimal",
  "brutalist",
  "panorama",
] as const
export type FlyerTemplate = (typeof FLYER_TEMPLATE_IDS)[number]

export const FLYER_TEMPLATE_LABELS: Record<FlyerTemplate, string> = {
  clasica: "Clásica",
  ficha: "Ficha técnica",
  fotos: "Fotos",
  editorial: "Editorial",
  poster: "Póster",
  split: "En dos",
  gallery: "Galería",
  minimal: "Minimal",
  brutalist: "Brutalista",
  panorama: "Panorama",
}

export const FLYER_TEMPLATE_DESCRIPTIONS: Record<FlyerTemplate, string> = {
  clasica: "Equilibrio entre foto, precio y datos",
  ficha: "Información técnica con lectura rápida",
  fotos: "La propiedad como protagonista",
  editorial: "Composición de revista inmobiliaria",
  poster: "Impacto visual para compartir",
  split: "Contraste de imagen y contenido",
  gallery: "Más fotos, menos ruido",
  minimal: "Aire, tipografía y elegancia",
  brutalist: "Geometría fuerte y alto contraste",
  panorama: "Una portada cinematográfica",
}

export const FLYER_TEMPLATE_PHOTO_LIMITS: Record<FlyerTemplate, number> = {
  clasica: 4,
  ficha: 3,
  fotos: 4,
  editorial: 1,
  poster: 1,
  split: 2,
  gallery: 4,
  minimal: 1,
  brutalist: 1,
  panorama: 1,
}

export function flyerPhotoLimit(template: FlyerTemplate): number {
  return FLYER_TEMPLATE_PHOTO_LIMITS[template]
}

export const FLYER_INFO_IDS = ["precio", "caracteristicas", "descripcion", "contacto"] as const
export type FlyerInfo = (typeof FLYER_INFO_IDS)[number]

export const FLYER_HIGHLIGHT_MAX_LENGTH = 80

export const FLYER_INFO_LABELS: Record<FlyerInfo, string> = {
  precio: "Precio",
  caracteristicas: "Características",
  descripcion: "Descripción",
  contacto: "Mis datos de contacto",
}

export type FlyerOptions = {
  template: FlyerTemplate
  highlight?: string
  include: FlyerInfo[]
  accentColor?: string
  photos?: string[]
}

export const DEFAULT_FLYER_OPTIONS: FlyerOptions = {
  template: "clasica",
  include: [...FLYER_INFO_IDS],
}

// Same value as INK in lib/flyer/shared.tsx — duplicated on purpose: that
// module pulls in fs/sharp (server-only) and can't be imported from client
// components like the flyer modal or settings form.
export const DEFAULT_ACCENT_COLOR = "#0a0a0a"
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/
