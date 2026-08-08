import Link from "next/link"
import Image from "next/image"
import { Mail } from "lucide-react"

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
function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.96-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
      <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" fill="white" />
    </svg>
  )
}

const socialLinks = [
  { label: "Instagram", href: "https://www.instagram.com/conexory/", Icon: InstagramIcon },
  { label: "Facebook", href: "https://www.facebook.com/conexory", Icon: FacebookIcon },
  { label: "YouTube", href: "https://www.youtube.com/@Conexory", Icon: YouTubeIcon },
]

const links = {
  Producto: [
    { label: "Funciones", href: "/#features" },
    { label: "Precios", href: "/precios" },
    { label: "Propiedades", href: "/propiedades" },
    { label: "Blog", href: "/blog" },
  ],
  Legal: [
    { label: "Términos de uso", href: "/terms" },
    { label: "Privacidad", href: "/privacy" },
    { label: "Cookies", href: "/cookies" },
    { label: "Contacto", href: "/contacto" },
  ],
}

export default function Footer() {
  return (
    <footer className="bg-ink">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="md:col-span-2 space-y-5">
            <Link href="/" className="flex items-center gap-2.5 w-fit">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                <Image
                  src="/mark-black.png"
                  alt="Conexory"
                  width={20}
                  height={20}
                  className="w-5 h-5"
                />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Conexory
              </span>
            </Link>
            <p className="text-mute text-sm leading-relaxed max-w-xs">
              La forma más rápida de crear y compartir propiedades en Colombia.
              Construido por agentes, para agentes.
            </p>
            <div className="flex items-center gap-2">
              <a
                href="mailto:Conexory@gmail.com"
                aria-label="Email"
                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-mute hover:text-white hover:bg-white/10 transition-colors"
              >
                <Mail className="w-4 h-4" />
              </a>
              {socialLinks.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-mute hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-white mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-mute hover:text-white transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-mute">
            © 2026 Conexory · Hecho en Colombia
          </p>
          <p className="text-xs text-white/30">
            En proceso de registro · Colombia
          </p>
        </div>
      </div>
    </footer>
  )
}
