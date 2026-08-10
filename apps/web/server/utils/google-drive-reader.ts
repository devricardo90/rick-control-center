/**
 * Server-only construction of the Google Drive reader.
 *
 * This module is the single place where the `GOOGLE_SERVICE_ACCOUNT_JSON`
 * handle is read (DEC-RIC-003). Everything about that read is deliberate:
 *
 *   - it happens in `server/utils/`, which Nitro never bundles into the
 *     browser, so the handle cannot reach client code;
 *   - the parsed credential stays inside the token provider closure — it
 *     is never returned to a route handler, never attached to a response,
 *     never written to the database, and never logged;
 *   - the reader is memoized for the process lifetime so the underlying
 *     `JWT` client can cache and refresh one access token, instead of
 *     minting a fresh one on every request;
 *   - a missing or malformed handle surfaces as the adapter's typed
 *     credential errors, which `google-error-mapping.ts` turns into a
 *     503 with a fixed message — never into a message that quotes the
 *     handle.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import {
  createGoogleDriveReader,
  createServiceAccountAccessTokenProvider,
  readGoogleServiceAccountCredential,
  type GoogleDriveReader,
} from '@rick/integrations'

let cachedReader: GoogleDriveReader | null = null

/**
 * Returns the process-wide Drive reader, constructing it on first use.
 * Throws `GoogleCredentialMissingError` / `GoogleCredentialInvalidError`
 * when the handle is absent or unusable.
 */
export function getGoogleDriveReader(): GoogleDriveReader {
  if (cachedReader === null) {
    const credential = readGoogleServiceAccountCredential(process.env)
    cachedReader = createGoogleDriveReader({
      accessTokenProvider: createServiceAccountAccessTokenProvider(credential),
    })
  }

  return cachedReader
}
