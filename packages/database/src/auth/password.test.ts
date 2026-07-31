/**
 * Unit tests for Argon2id password hashing.
 *
 * NDERCC-6: single-user authentication.
 */
import { describe, expect, it } from 'vitest'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js'

describe('hashPassword / verifyPassword', () => {
  it('produces an Argon2id PHC-format hash, never the plaintext', async () => {
    const plain = 'a-reasonably-strong-test-password'
    const hashed = await hashPassword(plain)

    expect(hashed.startsWith('$argon2id$')).toBe(true)
    expect(hashed).not.toContain(plain)
  })

  it('produces a different hash for the same password on each call (random salt)', async () => {
    const plain = 'a-reasonably-strong-test-password'
    const [first, second] = await Promise.all([hashPassword(plain), hashPassword(plain)])

    expect(first).not.toBe(second)
  })

  it('verifies a matching password against its own hash', async () => {
    const plain = 'correct horse battery staple'
    const hashed = await hashPassword(plain)

    expect(await verifyPassword(hashed, plain)).toBe(true)
  })

  it('rejects a non-matching password', async () => {
    const hashed = await hashPassword('the-real-password')

    expect(await verifyPassword(hashed, 'a-wrong-password')).toBe(false)
  })

  it('rejects rather than throws for a malformed hash string', async () => {
    await expect(verifyPassword('not-a-real-hash', 'anything')).resolves.toBe(false)
  })

  it('DUMMY_PASSWORD_HASH is a well-formed Argon2id hash that never authenticates a real password', async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(DUMMY_PASSWORD_HASH, 'anything an operator might type')).toBe(false)
  })
})
