import { createHash } from "crypto"
import { list, put } from "@vercel/blob"
import { z } from "zod"
import { getSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { generateFlyerJpeg, FLYER_RENDER_VERSION } from "@/lib/flyer"
import {
  FLYER_INFO_IDS,
  FLYER_TEMPLATE_IDS,
  FLYER_HIGHLIGHT_MAX_LENGTH,
  HEX_COLOR_REGEX,
  flyerPhotoLimit,
  type FlyerInfo,
} from "@/lib/flyer-options"

export const runtime = "nodejs"

const QuerySchema = z.object({
  template: z.enum(FLYER_TEMPLATE_IDS).catch("clasica"),
  highlight: z
    .string()
    .trim()
    .max(FLYER_HIGHLIGHT_MAX_LENGTH)
    .optional()
    .catch(undefined),
  include: z
    .string()
    .optional()
    .transform(
      (csv): FlyerInfo[] =>
        (csv?.split(",").filter((v): v is FlyerInfo => (FLYER_INFO_IDS as readonly string[]).includes(v)) ??
          [...FLYER_INFO_IDS])
    ),
  accentColor: z.string().regex(HEX_COLOR_REGEX).optional().catch(undefined),
  photos: z.string().optional().transform((csv) => csv?.split(",").filter(Boolean)),
})

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id } = await params
  const property = await prisma.property.findUnique({
    where: { id, userId: session.user.id },
    include: { user: { select: { name: true, image: true, phone: true, brandColor: true } } },
  })
  if (!property) return new Response("Not found", { status: 404 })

  const url = new URL(req.url)
  const query = QuerySchema.parse(Object.fromEntries(url.searchParams))
  // Never include contact info the agent has hidden for this property, no
  // matter what the client sends — the "contacto" chip is only a UI hint.
  const include = property.showContact
    ? query.include
    : query.include.filter((v) => v !== "contacto")
  const options = {
    template: query.template,
    highlight: query.highlight || undefined,
    include,
    accentColor: query.accentColor || property.user.brandColor,
    photos: query.photos?.filter((url) => property.images.includes(url)).slice(0, flyerPhotoLimit(query.template)),
  }

  // Hash everything that affects the rendered image, not just `options`:
  // agent name/phone (shown in the footer) and the render code version (so a
  // deploy that changes template rendering busts old cached JPEGs even when
  // neither the property nor the options changed).
  const cacheInput = {
    ...options,
    include: [...options.include].sort(),
    agentName: property.user.name,
    agentPhone: property.user.phone,
    renderVersion: FLYER_RENDER_VERSION,
  }
  const optionsHash = createHash("md5").update(JSON.stringify(cacheInput)).digest("hex").slice(0, 8)
  const cacheKey = `flyer/${property.id}-${property.updatedAt.getTime()}-${optionsHash}.jpg`

  const { blobs } = await list({ prefix: cacheKey, limit: 1 }).catch(() => ({ blobs: [] }))
  if (blobs[0]) return Response.redirect(blobs[0].url, 302)

  const jpeg = await generateFlyerJpeg(property, property.user, options)

  await put(cacheKey, jpeg, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  }).catch(() => null)

  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
  })
}
