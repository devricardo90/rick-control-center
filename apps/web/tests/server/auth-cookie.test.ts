import { describe, expect, it } from 'vitest'
import { buildSessionCookieOptions, SESSION_COOKIE_NAME } from '../../server/utils/auth-cookie'

describe('buildSessionCookieOptions', () => {
  it('always sets HttpOnly, SameSite=Lax, and Path=/', () => {
    const options = buildSessionCookieOptions(false)

    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
  })

  it('sets Secure in production', () => {
    expect(buildSessionCookieOptions(true).secure).toBe(true)
  })

  it('does not set Secure outside production', () => {
    expect(buildSessionCookieOptions(false).secure).toBe(false)
  })

  it('sets a 24-hour absolute max age', () => {
    expect(buildSessionCookieOptions(false).maxAge).toBe(24 * 60 * 60)
  })
})

describe('SESSION_COOKIE_NAME', () => {
  it('is a stable, non-empty cookie name', () => {
    expect(SESSION_COOKIE_NAME.length).toBeGreaterThan(0)
  })
})
