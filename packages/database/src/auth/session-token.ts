/**
 * Opaque session token generation and digesting.
 *
 * The raw token is a cryptographically random value returned to the client
 * only via an HttpOnly cookie; PostgreSQL stores only its SHA-256 digest.
 * Uses Node's built-in `node:crypto` — no custom cryptography.
 *
 * NDERCC-6: single-user authentication.
 */
import { createHash, randomBytes } from 'node:crypto'

const SESSION_TOKEN_BYTES = 32

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}
