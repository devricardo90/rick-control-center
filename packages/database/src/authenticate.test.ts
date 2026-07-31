/**
 * Integration tests for Operator, AuthSession, and the login flow, against
 * a real disposable PostgreSQL instance.
 *
 * Unlike Project/IntegrationConnection, Operator is a singleton table — at
 * most one row can ever exist — so these tests cannot use the
 * unique-key-per-test isolation pattern from project.test.ts. They are
 * deliberately kept in a single file: vitest runs tests within one file
 * sequentially by default, which avoids two files racing to upsert the
 * same singleton row (a real hazard here, unlike the unique-keyed Project
 * tests, which are safe under vitest's cross-file parallelism).
 *
 * NDERCC-6: single-user authentication.
 */
import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './auth/password.js'
import { generateSessionToken, hashSessionToken } from './auth/session-token.js'
import {
  createSession,
  revokeAllSessionsForOperator,
  revokeSessionByToken,
  validateSession,
} from './auth-session.js'
import { authenticateOperator } from './authenticate.js'
import { getPrimaryOperator, upsertPrimaryOperator } from './operator.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

async function provisionOperator(username: string, password: string) {
  return upsertPrimaryOperator(client, { username, passwordHash: await hashPassword(password) })
}

describe('Operator persistence', () => {
  it('provisions the operator and exposes no password hash on the safe type', async () => {
    const username = uniqueSlug('operator')
    const operator = await provisionOperator(username, 'a-strong-bootstrap-password')

    expect(operator.username).toBe(username)
    expect(operator.singleton).toBe(true)
    expect(Object.keys(operator)).not.toContain('passwordHash')
  })

  it('is idempotent: re-provisioning updates the same canonical row', async () => {
    const first = await provisionOperator(uniqueSlug('operator'), 'first-password-value')
    const newUsername = uniqueSlug('operator-renamed')
    const second = await provisionOperator(newUsername, 'second-password-value')

    expect(second.id).toBe(first.id)
    expect(second.username).toBe(newUsername)

    const current = await getPrimaryOperator(client)
    expect(current?.id).toBe(first.id)
    expect(current?.username).toBe(newUsername)
  })

  it('rejects a second operator row at the database level', async () => {
    await provisionOperator(uniqueSlug('operator'), 'existing-operator-password')

    await expect(
      client.operator.create({
        data: { singleton: true, username: uniqueSlug('operator-second'), passwordHash: 'irrelevant' },
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    )
  })
})

describe('AuthSession persistence', () => {
  it('creates a session with a hashed digest that does not match the raw token', async () => {
    const operator = await provisionOperator(uniqueSlug('operator'), 'session-owner-password')
    const { rawToken, session } = await createSession(client, operator.id)

    expect(session.operatorId).toBe(operator.id)
    expect(session.revokedAt).toBeNull()
    expect(rawToken).not.toBe(hashSessionToken(rawToken))
  })

  it('validates a freshly created session', async () => {
    const operator = await provisionOperator(uniqueSlug('operator'), 'session-owner-password')
    const { rawToken } = await createSession(client, operator.id)

    const validated = await validateSession(client, rawToken)
    expect(validated?.operatorId).toBe(operator.id)
  })

  it('rejects an unknown or malformed token', async () => {
    expect(await validateSession(client, generateSessionToken())).toBeNull()
    expect(await validateSession(client, 'not-a-real-token')).toBeNull()
  })

  it('rejects an expired session', async () => {
    const operator = await provisionOperator(uniqueSlug('operator'), 'session-owner-password')
    const rawToken = generateSessionToken()
    await client.authSession.create({
      data: {
        operatorId: operator.id,
        tokenDigest: hashSessionToken(rawToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    })

    expect(await validateSession(client, rawToken)).toBeNull()
  })

  it('rejects a revoked session (logout)', async () => {
    const operator = await provisionOperator(uniqueSlug('operator'), 'session-owner-password')
    const { rawToken } = await createSession(client, operator.id)

    await revokeSessionByToken(client, rawToken)

    expect(await validateSession(client, rawToken)).toBeNull()
  })

  it('revokes every session for an operator on password change', async () => {
    const operator = await provisionOperator(uniqueSlug('operator'), 'old-password-value')
    const sessionA = await createSession(client, operator.id)
    const sessionB = await createSession(client, operator.id)

    await revokeAllSessionsForOperator(client, operator.id)

    expect(await validateSession(client, sessionA.rawToken)).toBeNull()
    expect(await validateSession(client, sessionB.rawToken)).toBeNull()
  })
})

describe('authenticateOperator (login flow)', () => {
  it('succeeds with correct credentials and issues a session', async () => {
    const username = uniqueSlug('operator')
    await provisionOperator(username, 'the-correct-password')

    const result = await authenticateOperator(client, { username, password: 'the-correct-password' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(await validateSession(client, result.rawToken)).not.toBeNull()
    }
  })

  it('fails generically with a wrong password, without distinguishing the reason', async () => {
    const username = uniqueSlug('operator')
    await provisionOperator(username, 'the-correct-password')

    const result = await authenticateOperator(client, { username, password: 'the-wrong-password' })

    expect(result).toEqual({ ok: false })
  })

  it('fails generically with an unknown username, in the exact same shape as a wrong password', async () => {
    const result = await authenticateOperator(client, {
      username: uniqueSlug('no-such-operator'),
      password: 'anything',
    })

    expect(result).toEqual({ ok: false })
  })

  it('rejects credentials after the operator password has been changed', async () => {
    const username = uniqueSlug('operator')
    await provisionOperator(username, 'original-password-value')

    const stillOriginal = await authenticateOperator(client, { username, password: 'original-password-value' })
    expect(stillOriginal.ok).toBe(true)

    await provisionOperator(username, 'rotated-password-value')

    const withOldPassword = await authenticateOperator(client, { username, password: 'original-password-value' })
    expect(withOldPassword).toEqual({ ok: false })

    const withNewPassword = await authenticateOperator(client, { username, password: 'rotated-password-value' })
    expect(withNewPassword.ok).toBe(true)
  })

  it('never exposes a password hash through verifyPassword misuse on a safe operator record', async () => {
    const username = uniqueSlug('operator')
    const operator = await provisionOperator(username, 'a-strong-bootstrap-password')

    // `operator` is the SafeOperator type — it structurally cannot carry a
    // passwordHash, so there is nothing for a serializer to leak.
    expect(JSON.stringify(operator)).not.toContain('passwordHash')
    expect(await verifyPassword('$argon2id$fake', 'a-strong-bootstrap-password')).toBe(false)
  })
})
