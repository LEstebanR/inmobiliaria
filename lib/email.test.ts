import { describe, test, expect, mock, beforeEach } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ReactElement } from "react"

const mockSend = mock((...args: [unknown]) => {
  void args
  return Promise.resolve({ data: { id: "email-1" }, error: null })
})

class FakeResend {
  emails = { send: mockSend }
}

mock.module("resend", () => ({ Resend: FakeResend }))

const {
  sendWelcome,
  sendSubscriptionConfirmation,
  sendPaymentFailed,
  sendRenewalReminder,
  sendSubscriptionCancelled,
  sendResetPasswordEmail,
  sendVerificationEmail,
} = await import("./email")

beforeEach(() => {
  mockSend.mockClear()
})

function lastCall(): { from: string; to: string; subject: string; react?: unknown; html?: string; replyTo?: string } {
  return mockSend.mock.calls[0][0] as ReturnType<typeof lastCall>
}

describe("sendWelcome", () => {
  test("sends from the verified domain with the right subject and recipient", async () => {
    await sendWelcome("agent@example.com", "Luis Ramirez")
    const call = lastCall()
    expect(call.from).toBe("Conexory <no-reply@conexory.com>")
    expect(call.to).toBe("agent@example.com")
    expect(call.subject).toBe("Bienvenido a Conexory")
    expect(call.react).toBeDefined()
  })

  test("renders a greeting with the recipient's first name and the dashboard link", async () => {
    await sendWelcome("agent@example.com", "Luis Ramirez")
    const html = renderToStaticMarkup(lastCall().react as ReactElement)
    expect(html).toContain("Hola, Luis")
    expect(html).toContain("/dashboard/properties/new")
  })
})

describe("sendSubscriptionConfirmation", () => {
  test("sends the Pro welcome subject", async () => {
    await sendSubscriptionConfirmation("agent@example.com", "Luis")
    expect(lastCall().subject).toBe("¡Bienvenido a Conexory Pro!")
  })
})

describe("sendPaymentFailed", () => {
  test("sends the payment-failed subject", async () => {
    await sendPaymentFailed("agent@example.com", "Luis")
    expect(lastCall().subject).toBe("No pudimos cobrar tu plan Pro de Conexory")
  })
})

describe("sendRenewalReminder", () => {
  test("sends the renewal reminder with a rendered date", async () => {
    await sendRenewalReminder("agent@example.com", "Luis", new Date("2026-08-15"), true)
    const call = lastCall()
    expect(call.subject).toBe("Tu plan Pro de Conexory se renueva pronto")
    expect(call.react).toBeDefined()
  })

  test("mentions the saved payment method when there is one", async () => {
    await sendRenewalReminder("agent@example.com", "Luis", new Date("2026-08-15"), true)
    const html = renderToStaticMarkup(lastCall().react as ReactElement)
    expect(html).toContain("con el")
    expect(html).toContain("método de pago que tienes registrado")
  })

  test("asks the user to add a payment method when there isn't one", async () => {
    await sendRenewalReminder("agent@example.com", "Luis", new Date("2026-08-15"), false)
    const html = renderToStaticMarkup(lastCall().react as ReactElement)
    expect(html).toContain("no tenemos un método de")
  })
})

describe("sendSubscriptionCancelled", () => {
  test("sends the cancellation subject", async () => {
    await sendSubscriptionCancelled("agent@example.com", "Luis")
    expect(lastCall().subject).toBe("Tu plan Pro de Conexory fue cancelado")
  })
})

describe("sendResetPasswordEmail", () => {
  test("sends the reset-password subject with the reset url", async () => {
    await sendResetPasswordEmail("agent@example.com", "Luis", "https://conexory.com/reset-password?token=abc")
    expect(lastCall().subject).toBe("Recupera tu contraseña de Conexory")
  })
})

describe("sendVerificationEmail", () => {
  test("sends the verification subject with the verify url", async () => {
    await sendVerificationEmail("agent@example.com", "Luis", "https://conexory.com/verify?token=abc")
    expect(lastCall().subject).toBe("Confirma tu correo de Conexory")
  })
})
