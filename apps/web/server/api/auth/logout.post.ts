/**
 * POST /api/auth/logout
 *
 * Revokes the current session, if any, and clears the cookie. Logging out
 * when there is no active session is not an error.
 *
 * NDERCC-6: single-user authentication.
 */
import { prisma, revokeSessionByToken } from '@rick/database'
import { SESSION_COOKIE_NAME } from '../../utils/auth-cookie'

export default defineEventHandler(async (event) => {
  const rawToken = getCookie(event, SESSION_COOKIE_NAME)

  if (rawToken) {
    await revokeSessionByToken(prisma, rawToken)
  }

  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' })

  return { ok: true }
})
