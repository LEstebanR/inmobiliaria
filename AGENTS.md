# Conexory — Guide for AI agents

## Critical warning: Next.js 16

This app uses **Next.js 16.2.6** — a version with breaking changes relative to 15.x. Before writing any code related to routing, metadata, headers or caching, read the relevant guide in `node_modules/next/dist/docs/`. Do not assume the behavior of earlier versions.

Key changes already present in this project:
- `headers()`, `cookies()`, `params` and `searchParams` are **Promises** — always use `await`
- Turbopack is the default bundler in dev (`next dev` with no flags)

---

## What this project is

**Conexory** (`conexory.com`) is a SaaS for real estate agents in Colombia. It lets agents create property listings, get a unique link per property, and share it via WhatsApp with a rich preview (OG image). The agent doesn't need to know anything about technology — full flow in under 60 seconds.

**Target market:** independent real estate agents in Colombia.
**Business model:** Freemium — Free (3 properties), Pro ($99,999 COP/month, 50 properties) and Custom (by contact). Plan limit details in the "Plans and limits" section. **A working payment gateway is part of the MVP.**

---

## Full stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.2.6 |
| UI | React | 19.2.4 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 4 |
| Components | Radix UI + Lucide React | — |
| Auth | better-auth | 1.6.13 |
| ORM | Prisma | 5 |
| Database | PostgreSQL (Neon serverless) | — |
| Storage | Vercel Blob | 2.4.0 |
| Blog | Markdown with gray-matter + marked | — |
| Notifications | Sonner (toasts) | 2.0.7 |
| Package manager | Bun | — |
| Deploy | Vercel | — |

---

## Project structure

```
app/
  page.tsx                          # Public landing (redirects to /dashboard if there's a session)
  layout.tsx                        # Root layout with global metadata
  globals.css                       # CSS variables, brand-* tokens, reset
  blog/
    page.tsx                        # Post listing
    [slug]/page.tsx                 # Individual post
  contacto/page.tsx
  cookies/page.tsx
  precios/page.tsx                  # Free and Pro plans
  privacy/page.tsx
  terms/page.tsx
  login/page.tsx
  register/page.tsx
  p/[slug]/page.tsx                 # Public property view (no login)
  dashboard/
    layout.tsx                      # Layout with sidebar
    page.tsx                        # Agent's property listing + stats
    properties/
      new/
        page.tsx                    # New property form (Client Component)
        actions.ts                  # Server Action: createProperty
        image-upload.tsx            # Upload to Vercel Blob
      [id]/
        page.tsx                    # Property detail in dashboard
        actions.ts                  # Server Action: deleteProperty, togglePublished
        edit/
          page.tsx
          edit-form.tsx
          actions.ts                # Server Action: updateProperty
        property-actions.tsx        # Action buttons (Client Component)
        share-panel.tsx             # WhatsApp share panel
  api/
    auth/[...all]/route.ts          # better-auth handler
    upload/route.ts                 # Vercel Blob handler
components/
  dashboard/sidebar.tsx
  features.tsx
  footer.tsx
  hero.tsx
  how-it-works.tsx
  image-upload.tsx                  # Reusable photo upload component
  legal-layout.tsx
  navbar.tsx
  property-carousel.tsx
  property-preview.tsx
  signup-cta.tsx
  stats.tsx
  ui/
    badge.tsx
    button.tsx
    input.tsx
lib/
  auth.ts                           # better-auth configuration (server)
  auth-client.ts                    # better-auth client (browser)
  blog.ts                           # Utilities to read Markdown posts
  prisma.ts                         # PrismaClient singleton
  utils.ts                          # cn() and helpers
content/blog/                       # Markdown posts (frontmatter: title, date, description, slug)
prisma/schema.prisma                # Database schema
```

---

## Database (Prisma schema)

### Main models

**`User`** — real estate agent
- `id`, `name`, `email` (unique), `emailVerified` (default false), `image?`
- Relation: `properties Property[]`

**`Property`** — property listing
- `id`, `userId`, `title`, `slug` (unique), `type`, `price` (Decimal 15,2)
- `city`, `neighborhood?`, `area?` (Float), `bedrooms?`, `bathrooms?`, `parking?`
- `description?`, `images` (String[]), `shares` (Int default 0)
- `published` (Bool default true), `createdAt`, `updatedAt`

**Auth tables:** `Session`, `Account`, `Verification` (required by better-auth)

### Valid property types

`apartment` | `house` | `office` | `commercial` | `lot` | `warehouse`

### Prisma conventions

- Always use `prisma` from `lib/prisma.ts` (singleton with `globalThis`)
- Price is stored as `Decimal` — call `.toNumber()` for JS operations
- `onDelete: Cascade` on all `User` relations

### Migrations

The database is under **Prisma Migrations** control (with a baselined `0_init` migration). For any schema change, generate a migration (`bunx prisma migrate dev`) and commit it — **never use `prisma db push`**, it would break the history.

- `prisma migrate deploy` runs automatically on every Vercel build (it's in the `build` script), so pending migrations get applied on their own on every deploy.
- That's why Vercel's *Preview/Development* environments point at a separate **dev database** (not production): so a preview deploy applies the migration to dev, never to prod. Only *Production* uses the real database. When touching `DATABASE_URL`/`DIRECT_URL` in Vercel, respect that scoping.

---

## Authentication (better-auth)

- **Methods:** email/password + Google OAuth
- **Account linking enabled** — a user can have email and Google linked
- **Session:** expires in 7 days, refreshes if older than 1 day, cookie cached for 5 min
- **Get the session in a Server Component:**
  ```ts
  const session = await auth.api.getSession({ headers: await headers() })
  ```
- **Protect routes:** redirect to `/login` if there's no session, to `/dashboard` if there already is one
- `emailVerified` exists in the schema but **is not currently validated**
- **Email/password goes through Server Actions**, not client-side calls: `app/login/actions.ts` and `app/register/actions.ts` call `auth.api.signInEmail`/`signUpEmail`, validate with Zod, and map `APIError` (`better-auth/api`). The forms use `useActionState` + `<form action>` so submission works via progressive enhancement (Enter submits without depending on hydration). **Google OAuth is client-side** (`signIn.social`, redirect flow).
- **`nextCookies()` is the last plugin in `lib/auth.ts`** — it's what lets Server Actions write the session cookie via `next/headers`. Don't reorder or remove it.

---

## Patterns and conventions

### Server Actions

- Every write route has its `actions.ts` in the same folder as the page
- Actions are `async function`s exported with `"use server"`
- Currently **no Zod validation** — don't replicate this pattern in new code, all new code must validate with Zod

### Components

- **Server Components** by default — only use `"use client"` when strictly necessary (interactivity, hooks, browser events)
- The new/edit property form is a Client Component because of local state complexity
- Atomic UI components in `components/ui/` — prefer extending these before creating new ones

### Styling (Tailwind CSS 4) — monochrome design system (Uber)

The system is **monochrome white/black/grays**, inspired by Uber (see `DESIGN.md` at the root). **There's no second accent color**: black is the only conversion color.

- **Semantic tokens** (defined in `globals.css` via `@theme`): `ink` (#000, text and CTAs), `body` (#5e5e5e, secondary text), `mute` (#afafaf, placeholders/fine print), `canvas` (#fff), `canvas-soft` (#efefef, chips/soft surfaces), `canvas-softer` (#f3f3f3), `surface-pressed`, `hairline`/`hairline-strong` (borders), `elevated` (#282828, hover on black). Use them as `bg-ink`, `text-body`, `border-hairline`, etc.
- **`brand-50…950` is now a neutral gray ramp** anchored on black (`brand-950` = #000). It exists so legacy code degrades to grays; new code should prefer the semantic tokens.
- **Primary CTAs/actions are always black** (`bg-ink`; the `default` `Button` already is). Signature shape: **pill** (`rounded-full`) on every interactive element. Cards in `rounded-2xl`.
- **Do not introduce accent colors** (green, blue, etc.). WhatsApp green (`#25D366`) is only allowed in a real product context (contact button in the app/public view), **never in the landing/marketing pages** — there, WhatsApp buttons are black.
- Warning/limit states use the `warning-*` token (an amber scale in `@theme`) for the **surface/notice**, not for the button. Don't hardcode `amber-*`, `blue-*`, `violet-*` or colors outside the palette.
- **Marketing animations**: `animate-fade-up`/`animate-fade-in` (entrance) and `animate-marquee`; the `components/reveal.tsx` component applies fade-up on entering the viewport (respects `prefers-reduced-motion`).
- **Don't use `tailwind.config.js`** — Tailwind 4 config lives in the CSS via `@theme`
- Composition utility classes: use `cn()` from `lib/utils.ts` (clsx + tailwind-merge)

### Property images

- Uploaded to **Vercel Blob** via `POST /api/upload`
- Stored as an array of URLs in `Property.images`
- Photo limit **per plan**: 10 (Free) / 20 (Pro). Lives in `lib/plans.ts` and is enforced server-side in the actions; the uploader (`components/image-upload.tsx`) receives `maxImages` as a prop.

### Plans and limits

- Three plans: **Free** (3 active properties, 10 photos/property), **Pro** (50 properties, 20 photos/property), **Custom** (teams/agencies, by contact, no limit).
- The only plan flag is `User.isPremium` (boolean), exposed in the session — server-side via `getSession`, client-side via `useSession` (auth-client uses `inferAdditionalFields` to type it). There's no flag for "Custom": it's managed by contact.
- Limits live in `lib/plans.ts` (`propertyLimit()` / `photoLimit()`) — **single source of truth**. Never hardcode the numbers (3/50, 10/20); derive them from there both in UI and enforcement.
- Real enforcement happens in the server actions, gated on `isPremium`. Zod validation uses the **absolute ceiling** (Pro limit); the per-plan limit is applied by the action.

### Blog

- Posts in `content/blog/*.md` with frontmatter: `title`, `date`, `slug`, `description`
- Reading functions in `lib/blog.ts`
- Rendered with `marked` (HTML from Markdown)

### Comments

- **Avoid comments.** Prefer self-explanatory code (clear names, small functions). Only comment what the code can't express: the *why* behind a non-obvious decision, not the *what*.
- Code comments are **in English**, even though the UI and user-facing strings are in Spanish.

### URLs and domain

- The canonical public URL is resolved with `getAppUrl()` (`lib/urls.ts`): `APP_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `localhost`. Use it for every absolute link (public link `/p/[slug]`, `metadataBase`/OG, sitemap, robots). **Never hardcode the URL or read `NEXT_PUBLIC_APP_URL`.**
- **Auth is different:** better-auth's `baseURL`/origin check needs the **current deploy's host**, not the canonical one — client-side `window.location.origin`, server-side it's derived from `VERCEL_URL` (+ `trustedOrigins` so previews pass the origin check). Don't use `getAppUrl()` for auth.
- URL env vars can come through **empty** (`""`) in some Vercel scopes; when deriving, treat `""` as absent (use `||`, not `??`).

---

## Environment variables

See `.env.example` for the full list. The critical ones:

| Variable | Use |
|---|---|
| `DATABASE_URL` | Pooled connection to Neon (for Prisma in edge/serverless) |
| `DIRECT_URL` | Direct connection to Neon (for migrations) |
| `BETTER_AUTH_SECRET` | Session signing |
| `BETTER_AUTH_URL` | Optional — auth base; derived from the request / `VERCEL_URL` if missing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (the SDK reads it on its own) |
| `GOOGLE_AI_API_KEY` | Google AI Studio (Gemini Flash, free tier) to improve the WhatsApp message with AI; if missing, the action returns a friendly error |

> The app's public URL is **not** configured via env var: it's derived at runtime with `getAppUrl()` from the variables Vercel injects (`VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`). `APP_URL` is only used as an override for a custom domain.

---

## Development commands

```bash
bun dev          # Start the dev server
bun build        # prisma generate + prisma migrate deploy + next build
bun lint         # ESLint
bunx prisma migrate dev   # New migration
bunx prisma studio        # Database GUI
```

---

## Work tracking: Linear + GitHub Issues

The project lives with **two tracking systems**: Linear (older issues, historically managed there) and **GitHub Issues** (new issues created by Luis, since Linear's free plan hit its cap). Pending Linear issues keep living there — they aren't migrated retroactively. Every new issue Luis manages goes to GitHub; his partner can keep using Linear if that's more comfortable for him. To create a well-formed GitHub issue, use the `/create-gh-issue` skill (template in `.github/ISSUE_TEMPLATE/tarea.md`).

## Git conventions

### Branch names

The format depends on where the issue driving the change lives:

```
{type}/LES-{number}-{short-description}     # issue lives in Linear
{type}/{short-description}                  # issue lives in GitHub (no number)
```

| Part | Valid values |
|---|---|
| `type` | `feat` · `fix` · `refactor` · `chore` · `docs` |
| `LES-{number}` | Linear issue ID, only if the issue lives there |
| `short-description` | kebab-case, max 5 words, in English |

**Correct examples:**
```
feat/LES-149-plan-pro-subscriptions
fix/LES-155-zod-validation-actions
chore/migrate-mercadopago
refactor/listing-type-field
```

The `.github/workflows/branch-name.yml` workflow validates this format on every PR and fails if it isn't met.

### Pull Requests

**Title:** `{type}: short description in imperative mood` (add `(LES-{number})` only if the issue is in Linear)

```
feat(LES-149): add Pro plan subscription flow with Wompi
chore: migrate recurring billing to Mercado Pago
```

**Description:** use the template in `.github/pull_request_template.md`. Always include:
- What the PR does (1-3 sentences)
- Related issue — Linear link (`Closes:`) or `Closes #{number}` if the issue is on GitHub (auto-closes it on merge)
- Steps to test it
- Build, types and migrations checklist

---

## What NOT to do

- Don't use `tailwind.config.js` — config goes in `globals.css`
- Don't create Server Actions without validating input (use Zod)
- Don't forget `await` on `headers()`, `cookies()` and `params`/`searchParams` (they're Promises in Next.js 16)
- Don't hardcode `"En venta"` ("For sale") — properties can be for rent or for sale/rent
- Don't expose `userId` on public routes — the public view `/p/[slug]` must not leak agent data
- Don't read `NEXT_PUBLIC_APP_URL` or hardcode the app's URL — use `getAppUrl()` from `lib/urls.ts`
- Don't write comments unless they clarify something non-obvious; when needed, in English
