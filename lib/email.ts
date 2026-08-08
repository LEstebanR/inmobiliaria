import { Resend } from "resend"
import { getAppUrl } from "@/lib/urls"
import { SubscriptionConfirmationEmail } from "@/emails/subscription-confirmation"
import { PaymentFailedEmail } from "@/emails/payment-failed"
import { SubscriptionCancelledEmail } from "@/emails/subscription-cancelled"
import { RenewalReminderEmail } from "@/emails/renewal-reminder"
import { ResetPasswordEmail } from "@/emails/reset-password"
import { VerifyEmailEmail } from "@/emails/verify-email"
import { WelcomeEmail } from "@/emails/welcome"

// Instantiated lazily inside each function so the build doesn't require
// RESEND_API_KEY at module-load time (Next.js collects route data during build).
// Must be a verified Resend domain — gmail.com can't be verified, so sending
// from it returns 403.
const FROM = "Conexory <no-reply@conexory.com>"

function resend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function sendWelcome(email: string, name: string) {
  const appUrl = getAppUrl()
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "Bienvenido a Conexory",
    react: WelcomeEmail({ name, appUrl }),
  })
}

export async function sendSubscriptionConfirmation(email: string, name: string) {
  const appUrl = getAppUrl()
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "¡Bienvenido a Conexory Pro!",
    react: SubscriptionConfirmationEmail({ name, appUrl }),
  })
}

export async function sendPaymentFailed(email: string, name: string) {
  const appUrl = getAppUrl()
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "No pudimos cobrar tu plan Pro de Conexory",
    react: PaymentFailedEmail({ name, appUrl }),
  })
}

export async function sendRenewalReminder(
  email: string,
  name: string,
  periodEnd: Date,
  hasPaymentMethod: boolean,
) {
  const appUrl = getAppUrl()
  const date = periodEnd.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
  })
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "Tu plan Pro de Conexory se renueva pronto",
    react: RenewalReminderEmail({ name, date, hasPaymentMethod, appUrl }),
  })
}

export async function sendSubscriptionCancelled(email: string, name: string) {
  const appUrl = getAppUrl()
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "Tu plan Pro de Conexory fue cancelado",
    react: SubscriptionCancelledEmail({ name, appUrl }),
  })
}

export async function sendResetPasswordEmail(email: string, name: string, url: string) {
  const appUrl = getAppUrl()
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "Recupera tu contraseña de Conexory",
    react: ResetPasswordEmail({ name, url, appUrl }),
  })
}

export async function sendVerificationEmail(email: string, name: string, url: string) {
  const appUrl = getAppUrl()
  await resend().emails.send({
    from: FROM,
    to: email,
    subject: "Confirma tu correo de Conexory",
    react: VerifyEmailEmail({ name, url, appUrl }),
  })
}
