/**
 * Unit tests for checkDatabaseHealth.
 *
 * No real database required — PrismaClient is mocked via vi.fn().
 * Tests verify type-narrowing logic and error-handling paths.
 *
 * NDERCC-4: persistence foundation — sprint 0.
 */
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { checkDatabaseHealth } from './health.js'

/** Minimal stub satisfying the PrismaClient shape expected by the function. */
function makeClient(queryRawImpl: () => Promise<unknown>): PrismaClient {
  return {
    $queryRaw: queryRawImpl,
  } as unknown as PrismaClient
}

describe('checkDatabaseHealth', () => {
  it('returns healthy:true when the probe returns a non-empty array', async () => {
    const client = makeClient(vi.fn().mockResolvedValue([{ probe: 1 }]))

    const result = await checkDatabaseHealth(client)

    expect(result.healthy).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('returns healthy:false when the probe returns an empty array', async () => {
    const client = makeClient(vi.fn().mockResolvedValue([]))

    const result = await checkDatabaseHealth(client)

    expect(result.healthy).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns healthy:false when the probe returns a non-array value', async () => {
    const client = makeClient(vi.fn().mockResolvedValue(null))

    const result = await checkDatabaseHealth(client)

    expect(result.healthy).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns healthy:false and captures the error message when the query throws an Error', async () => {
    const client = makeClient(
      vi.fn().mockRejectedValue(new Error('Connection refused')),
    )

    const result = await checkDatabaseHealth(client)

    expect(result.healthy).toBe(false)
    expect(result.error).toBe('Connection refused')
  })

  it('returns healthy:false with a fallback message for non-Error throws', async () => {
    const client = makeClient(vi.fn().mockRejectedValue('string error'))

    const result = await checkDatabaseHealth(client)

    expect(result.healthy).toBe(false)
    expect(result.error).toBe('Unknown database error')
  })
})
