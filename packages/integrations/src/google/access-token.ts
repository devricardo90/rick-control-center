/**
 * Mints short-lived Google OAuth access tokens from the server-side
 * service-account credential.
 *
 * This is the ONLY place in the repository authorized to use
 * `google-auth-library` (DEC-RIC-003: exactly one authentication
 * dependency), and it is used for exactly one purpose — exchanging the
 * service-account credential for a `drive.readonly` access token against
 * Google's own official OAuth token endpoint. No user impersonation
 * (`subject`) and no domain-wide delegation is configured, and no
 * caller-supplied host or scope can reach this module.
 *
 * The minted token never leaves the process: it is passed straight to the
 * Drive adapter's `Authorization` header and is never returned to a
 * caller, persisted, or included in an error. Errors thrown here carry a
 * fixed message only — the underlying library error (which can embed the
 * OAuth response body) is deliberately swallowed, not wrapped.
 *
 * NDERCC-13 / DEC-RIC-003: Google Drive credential and snapshot boundary.
 */
import { JWT } from 'google-auth-library'
import type { GoogleServiceAccountCredential } from './credentials.js'
import { GoogleAuthError } from './errors.js'

/** The single approved OAuth scope (DEC-RIC-003). Read-only, by decision. */
export const GOOGLE_DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

export interface GoogleAccessTokenProvider {
  /** Resolves a bearer token valid for {@link GOOGLE_DRIVE_READONLY_SCOPE}. */
  getAccessToken: () => Promise<string>
}

/**
 * Creates a token provider backed by one service-account credential. The
 * underlying `JWT` client caches and refreshes the access token itself, so
 * a single provider should be reused for the lifetime of the process
 * rather than constructed per request.
 */
export function createServiceAccountAccessTokenProvider(
  credential: GoogleServiceAccountCredential,
): GoogleAccessTokenProvider {
  const client = new JWT({
    email: credential.clientEmail,
    key: credential.privateKey,
    scopes: [GOOGLE_DRIVE_READONLY_SCOPE],
  })

  return {
    getAccessToken: async (): Promise<string> => {
      let token: string | null | undefined

      try {
        const response = await client.getAccessToken()
        token = response.token
      }
      catch {
        // Intentionally discarded: google-auth-library errors can embed
        // the OAuth error response and the request that produced it.
        throw new GoogleAuthError('Unable to obtain a Google access token for the service account.')
      }

      if (typeof token !== 'string' || token.length === 0) {
        throw new GoogleAuthError('Google returned no access token for the service account.')
      }

      return token
    },
  }
}
