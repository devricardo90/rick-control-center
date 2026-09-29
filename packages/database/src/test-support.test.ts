/**
 * P0-042 isolated database guard tests (RIC-SPEC-NDERCC-39-001 §9/§15).
 *
 * The guard's rejection behaviour is pure string/URL logic and always runs.
 * The one test that actually constructs a client against the isolated
 * instance is skipped unless the process's own `DATABASE_URL` already points
 * at it — exactly the condition the SDD's `databaseUrlStrategy` describes —
 * so a plain `pnpm test` against the shared development database (this
 * repository's default `.env`) skips it instead of failing on an instance
 * that is not guaranteed to be running.
 */
import { describe, expect, it } from 'vitest'
import {
  createP042TestClient,
  isIsolatedP042DatabaseUrl,
  P042_ISOLATED_DATABASE_TARGET,
  requireIsolatedP042DatabaseUrl,
} from './test-support.js'

const ISOLATED_URL = 'postgresql://rick_p042_test:secret@127.0.0.1:5456/rick_p042_test?schema=public'

describe('P0-042 isolated database guard: always-on rejection matrix', () => {
  it.each([
    ['the shared development target', 'postgresql://rick:secret@127.0.0.1:5455/rick_dev?schema=public'],
    ['rick_dev by name on any port', 'postgresql://rick_p042_test:secret@127.0.0.1:5456/rick_dev?schema=public'],
    ['localhost instead of 127.0.0.1', 'postgresql://rick_p042_test:secret@localhost:5456/rick_p042_test?schema=public'],
    ['the wrong port', 'postgresql://rick_p042_test:secret@127.0.0.1:5455/rick_p042_test?schema=public'],
    ['the wrong schema', 'postgresql://rick_p042_test:secret@127.0.0.1:5456/rick_p042_test?schema=other'],
    ['no schema parameter at all', 'postgresql://rick_p042_test:secret@127.0.0.1:5456/rick_p042_test'],
    ['a malformed URL', 'not-a-url'],
  ])('rejects %s', (_label, url) => {
    expect(isIsolatedP042DatabaseUrl(url)).toBe(false)
    expect(() => requireIsolatedP042DatabaseUrl(url)).toThrow()
  })

  it('accepts exactly the isolated target', () => {
    expect(isIsolatedP042DatabaseUrl(ISOLATED_URL)).toBe(true)
    expect(requireIsolatedP042DatabaseUrl(ISOLATED_URL)).toBe(ISOLATED_URL)
  })

  it('never echoes the credential in a rejection message', () => {
    const url = 'postgresql://rick:super-secret-value@127.0.0.1:5455/rick_dev?schema=public'
    try {
      requireIsolatedP042DatabaseUrl(url)
      throw new Error('expected requireIsolatedP042DatabaseUrl to throw')
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toContain('super-secret-value')
    }
  })

  it('states the exact canonical target in its constants', () => {
    expect(P042_ISOLATED_DATABASE_TARGET).toEqual({
      host: '127.0.0.1',
      port: '5456',
      database: 'rick_p042_test',
      schema: 'public',
    })
  })
})

const targetsIsolatedInstance = isIsolatedP042DatabaseUrl(process.env['DATABASE_URL'] ?? '')

describe.skipIf(!targetsIsolatedInstance)('P0-042 isolated database guard: live connection (requires DATABASE_URL to be the isolated target)', () => {
  it('constructs a client and confirms the live connection identity', async () => {
    const client = createP042TestClient()
    try {
      const rows = await client.$queryRaw<{ current_database: string, current_user: string, server_port: number }[]>`
        SELECT current_database(), current_user, inet_server_port()::int AS server_port
      `
      expect(rows[0]?.current_database).toBe('rick_p042_test')
      expect(rows[0]?.current_user).toBe('rick_p042_test')
      expect(rows[0]?.server_port).toBe(5432)
    }
    finally {
      await client.$disconnect()
    }
  })
})
