/**
 * Database health verification.
 *
 * Sends a lightweight SQL probe and narrows the result from `unknown` before
 * returning a typed outcome. No domain logic — foundation only.
 *
 * NDERCC-4: persistence foundation — sprint 0.
 */
import type { PrismaClient } from '@prisma/client'

export interface DatabaseHealthResult {
  healthy: boolean
  latencyMs: number
  error?: string
}

/**
 * Narrow an unknown $queryRaw result to a non-empty array.
 *
 * Prisma's `$queryRaw` is typed as `Promise<unknown>`.
 * We confirm the result looks like a non-empty array before proceeding.
 */
function isNonEmptyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0
}

/**
 * Verify database connectivity by executing a trivial probe query.
 *
 * @param client - The PrismaClient instance to use.
 * @returns A typed health result indicating whether the DB is reachable.
 */
export async function checkDatabaseHealth(
  client: PrismaClient,
): Promise<DatabaseHealthResult> {
  const start = Date.now()

  try {
    // $queryRaw returns unknown — narrow before use.
    const raw: unknown = await client.$queryRaw`SELECT 1 AS probe`

    if (!isNonEmptyArray(raw)) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: 'Probe query returned an unexpected result shape',
      }
    }

    return {
      healthy: true,
      latencyMs: Date.now() - start,
    }
  }
  catch (err: unknown) {
    const message
      = err instanceof Error ? err.message : 'Unknown database error'

    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: message,
    }
  }
}
