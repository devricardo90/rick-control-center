/**
 * Session cookie policy: name and attribute construction. Kept as pure,
 * dependency-free logic — no H3/Nitro imports — so the cookie policy
 * (HttpOnly, SameSite=Lax, Path=/, Secure in production, 24h max age) is
 * directly unit-testable without booting a server.
 *
 * NDERCC-6: single-user authentication.
 */
export const SESSION_COOKIE_NAME = 'rick_session'

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

export interface SessionCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
  maxAge: number
}

export function buildSessionCookieOptions(isProduction: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
