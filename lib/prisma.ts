import { PrismaClient } from "@prisma/client"
import { withConnectionRetry } from "@/lib/prisma-retry"

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

  // Neon's pooler occasionally drops a cold connection under scale-up
  // (Prisma error P1001, "Can't reach database server") — retry a couple
  // times with a short backoff instead of surfacing a 500 for what's usually
  // a few hundred ms blip.
  return client.$extends({
    query: {
      $allOperations: ({ args, query }) => withConnectionRetry(() => query(args)),
    },
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
