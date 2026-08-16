import { Prisma } from "@prisma/client"

const RETRYABLE_ERROR_CODES = new Set(["P1001", "P1002", "P1017"])

// Prisma re-throws connection failures as a *new* PrismaClientInitializationError
// without forwarding `errorCode` (`handleRequestError` in @prisma/client/runtime),
// so by the time the error reaches an extension the code is gone and only the
// message survives — match on both.
const RETRYABLE_MESSAGE =
  /can'?t reach database server|was reached but timed out|server has closed the connection/i

export const RETRY_DELAYS_MS = [250, 750]

export function isRetryableConnectionError(error: unknown): boolean {
  const isPrismaConnectionError =
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError
  if (!isPrismaConnectionError) return false

  const code =
    error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : error.code
  return (code ? RETRYABLE_ERROR_CODES.has(code) : false) || RETRYABLE_MESSAGE.test(error.message)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  { delaysMs = RETRY_DELAYS_MS }: { delaysMs?: number[] } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= delaysMs.length || !isRetryableConnectionError(error)) throw error
      await sleep(delaysMs[attempt])
    }
  }
}
