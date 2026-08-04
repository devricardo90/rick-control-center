/**
 * Unit tests for session token generation and digesting.
 *
 * NDERCC-6: single-user authentication.
 */
import { describe, expect, it } from 'vitest'
import { generateSessionToken, hashSessionToken } from './session-token.js'

describe('generateSessionToken', () => {
  it('generates a URL-safe token with sufficient entropy', () => {
    const token = generateSessionToken()

    expect(token.length).toBeGreaterThanOrEqual(32)
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true)
  })

  it('generates a different token on each call', () => {
    const a = generateSessionToken()
    const b = generateSessionToken()

    expect(a).not.toBe(b)
  })
})

describe('hashSessionToken', () => {
  it('produces a deterministic 64-character hex SHA-256 digest', () => {
    const token = generateSessionToken()
    const digest = hashSessionToken(token)

    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(hashSessionToken(token)).toBe(digest)
  })

  it('produces different digests for different tokens', () => {
    const digestA = hashSessionToken(generateSessionToken())
    const digestB = hashSessionToken(generateSessionToken())

    expect(digestA).not.toBe(digestB)
  })

  it('never reproduces the raw token inside its own digest', () => {
    const token = generateSessionToken()
    const digest = hashSessionToken(token)

    expect(digest).not.toContain(token)
  })
})
