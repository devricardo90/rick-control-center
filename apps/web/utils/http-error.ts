/**
 * Extracts a safe, user-facing message from an unknown thrown error. Only
 * reads the request layer's own `statusMessage` — always one of this
 * app's own sanitized `createError` messages, never a raw Prisma error or
 * stack-trace detail — and falls back to a generic message for anything
 * else, so an unexpected error shape can never leak internal detail.
 *
 * NDERCC-7: minimal project interface.
 */
export function extractSafeErrorMessage(err: unknown, fallback: string): string {
  if (typeof err !== 'object' || err === null || !('statusMessage' in err)) {
    return fallback
  }

  const { statusMessage } = err as { statusMessage: unknown }

  return typeof statusMessage === 'string' && statusMessage.length > 0 ? statusMessage : fallback
}
