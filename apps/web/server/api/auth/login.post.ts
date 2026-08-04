/**
 * POST /api/auth/login
 *
 * Verifies operator credentials and, on success, issues a session via an
 * HttpOnly cookie. Invalid credentials always produce the same generic 401
 * — this endpoint never reveals whether the submitted username exists.
 *
 * NDERCC-6: single-user authentication.
 */
import { authenticateOperator, prisma } from '@rick/database'
import { buildSessionCookieOptions, SESSION_COOKIE_NAME } from '../../utils/auth-cookie'
import { parseLoginCredentials } from '../../utils/parse-login-credentials'

export default defineEventHandler(async (event) => {
  const rawBody: unknown = await readBody(event)
  const credentials = parseLoginCredentials(rawBody)

  if (!credentials) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const result = await authenticateOperator(prisma, credentials)

  if (!result.ok) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid username or password.' })
  }

  setCookie(
    event,
    SESSION_COOKIE_NAME,
    result.rawToken,
    buildSessionCookieOptions(process.env['NODE_ENV'] === 'production'),
  )

  return { ok: true }
})
