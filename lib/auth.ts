import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { headers } from "next/headers"
import * as Sentry from "@sentry/nextjs"
import { prisma } from "@/lib/prisma"
import { sendResetPasswordEmail, sendVerificationEmail, sendWelcome } from "@/lib/email"

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // On Vercel previews the URL is dynamic: if there's no fixed BETTER_AUTH_URL,
  // derive the base from the current deploy so the origin check doesn't fail.
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),

  trustedOrigins: [
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_BRANCH_URL
      ? [`https://${process.env.VERCEL_BRANCH_URL}`]
      : []),
  ],

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, user.name, url)
    },
  },

  // requireEmailVerification stays off: sign-up keeps autoSignIn so the
  // "under 60 seconds" flow isn't blocked at auth. Verification is enforced
  // one layer up, in app/dashboard/layout.tsx.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, user.name, url)
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // Google sign-ups arrive already verified and get their welcome email from
    // the user.create hook below; email/password sign-ups get it here instead,
    // once they've actually clicked the link — not bundled with the
    // verification email itself.
    afterEmailVerification: async (user) => {
      await sendWelcome(user.email, user.name).catch(() => null)
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      // emailVerified is false by default and we don't enforce verification,
      // so don't block linking when the local account has emailVerified=false.
      requireLocalEmailVerified: false,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,   // 7 days
    updateAge: 60 * 60 * 24,        // refreshes if the session is older than 1 day
    cookieCache: {
      enabled: false,               // disabled: plan changes (isPremium) must reflect immediately
    },
  },

  user: {
    additionalFields: {
      isPremium: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },

  // Google OAuth sign-ups land here already verified, so send the welcome
  // email right away. Email/password sign-ups start unverified — theirs is
  // sent from emailVerification.afterEmailVerification instead, so it
  // doesn't arrive bundled with the verification email. Best-effort: never
  // block account creation on Resend.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (user.emailVerified) {
            await sendWelcome(user.email, user.name).catch(() => null)
          }
        },
      },
    },
  },

  // Must stay last: lets Server Actions set the session cookie via next/headers.
  plugins: [nextCookies()],
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

// better-auth throws instead of resolving to null when it can't reach the
// session store (e.g. a transient DB blip) — treat that the same as "no
// session" so callers redirect to /login instead of the request crashing.
export async function getSession() {
  try {
    return await auth.api.getSession({ headers: await headers() })
  } catch (error) {
    // Degrading to "no session" logs the agent out silently, so keep a trail:
    // a spike here is people being kicked to /login, not people not logged in.
    Sentry.captureException(error, {
      level: "warning",
      tags: { area: "auth", op: "getSession" },
    })
    return null
  }
}
