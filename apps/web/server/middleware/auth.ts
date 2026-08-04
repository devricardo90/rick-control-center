/**
 * Server-side authentication gate, enforced on every request before any
 * page renders or API handler runs. There is no client-side-only guard
 * anywhere in this codebase — a hidden UI element is not authentication.
 *
 * Unauthenticated page requests redirect to /login; unauthenticated
 * protected API requests receive HTTP 401.
 *
 * NDERCC-6: single-user authentication.
 */
import { prisma, validateSession } from '@rick/database'
import { SESSION_COOKIE_NAME } from '../utils/auth-cookie'
import { isPublicPath } from '../utils/public-paths'

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname

  if (isPublicPath(pathname)) {
    return
  }

  const rawToken = getCookie(event, SESSION_COOKIE_NAME)
  const session = rawToken ? await validateSession(prisma, rawToken) : null

  if (session) {
    return
  }

  if (pathname.startsWith('/api/')) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  return sendRedirect(event, '/login', 302)
})
