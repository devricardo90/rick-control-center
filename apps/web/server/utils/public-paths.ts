/**
 * Classifies a request path as public (no authentication required) or
 * protected. Pure and dependency-free so the exact allowlist is directly
 * unit-testable without booting a server.
 *
 * No health/connectivity endpoint exists yet in apps/web, so none is listed
 * here — one will be added to this allowlist if and when one is built.
 *
 * NDERCC-6: single-user authentication.
 */
const PUBLIC_EXACT_PATHS = new Set<string>([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/favicon.ico',
  '/robots.txt',
])

const PUBLIC_PATH_PREFIXES = ['/_nuxt/', '/__nuxt_'] as const

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.has(pathname)) {
    return true
  }

  return PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
}
