"use client"

import { WhatsAppIcon } from "@/components/ui/whatsapp-icon"
import { trackPropertyEvent } from "@/lib/track-property-event"
import { toWhatsAppNumber } from "@/lib/phone"

type Props = {
  propertyId: string
  phone: string | null
  phoneIsWhatsapp: boolean
  whatsappMessage: string
  english?: boolean
}

export default function WhatsAppFab({ propertyId, phone, phoneIsWhatsapp, whatsappMessage, english = false }: Props) {
  if (!phone || !phoneIsWhatsapp) return null

  const href = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(whatsappMessage)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackPropertyEvent(propertyId, "whatsapp_click")}
      aria-label={english ? "Contact via WhatsApp" : "Contactar por WhatsApp"}
      className="fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full shadow-lg hover:scale-105 transition-transform"
    >
      <WhatsAppIcon className="w-full h-full" />
    </a>
  )
}
