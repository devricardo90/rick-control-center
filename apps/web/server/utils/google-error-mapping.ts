/**
 * Single, centralized translation from typed Google Drive adapter errors
 * to HTTP responses — used by every document route so the policy is
 * documented once and applied identically everywhere (NDERCC-13).
 *
 * Documented policy:
 *   - 400 (GoogleValidationError): malformed Google Docs URL or file ID.
 *     Never reached the network.
 *   - 409 (GoogleInconsistentSnapshotError): the document was being edited
 *     during all three read attempts, so no consistent snapshot could be
 *     taken. A conflict, not a failure: the previous valid snapshot is
 *     intact and retrying later is the correct action.
 *   - 415 (GoogleUnsupportedDocumentTypeError): the file exists but is not
 *     a native Google Doc, so it cannot be exported as text.
 *   - 422 (GoogleNotFoundError): the document doesn't exist or was never
 *     shared with the service account. Drive returns 404 for both cases
 *     deliberately, to avoid leaking private-file existence — we mirror
 *     that honestly rather than guessing which one applies.
 *   - 502 (GoogleMalformedResponseError, GoogleResponseTooLargeError):
 *     Google responded, but not with something we could accept. Distinct
 *     from 503 because *a* response was received.
 *   - 503 (everything else adapter-side — auth, permission, rate limit,
 *     timeout, network/upstream failure, missing or invalid credential):
 *     Google, or our ability to reach/authenticate to it, is not usable
 *     for this request right now.
 *   - 500: anything unexpected and local; never a raw Prisma error, stack
 *     trace, or SQL.
 *
 * No branch here ever includes a Google response body, a request header,
 * the service-account credential, or an access token in the thrown error's
 * message. In particular, the credential errors are mapped to the same
 * generic 503 text as a network failure: whether the operator has
 * configured `GOOGLE_SERVICE_ACCOUNT_JSON` correctly is server-side
 * operational detail, not something an HTTP client is told.
 */
import {
  GoogleAuthError,
  GoogleCredentialInvalidError,
  GoogleCredentialMissingError,
  GoogleInconsistentSnapshotError,
  GoogleMalformedResponseError,
  GoogleNotFoundError,
  GoogleRateLimitError,
  GoogleResponseTooLargeError,
  GoogleTimeoutError,
  GoogleUnsupportedDocumentTypeError,
  GoogleUpstreamError,
  GoogleValidationError,
} from '@rick/integrations'

function isGoogleUnavailableError(err: unknown): boolean {
  return (
    err instanceof GoogleAuthError
    || err instanceof GoogleRateLimitError
    || err instanceof GoogleTimeoutError
    || err instanceof GoogleUpstreamError
    || err instanceof GoogleCredentialMissingError
    || err instanceof GoogleCredentialInvalidError
  )
}

function isGoogleUnacceptableResponseError(err: unknown): boolean {
  return err instanceof GoogleMalformedResponseError || err instanceof GoogleResponseTooLargeError
}

export function throwForGoogleAdapterError(err: unknown): never {
  if (err instanceof GoogleValidationError) {
    throw createError({ statusCode: 400, statusMessage: 'Provide a valid Google Docs URL or file ID.' })
  }
  if (err instanceof GoogleInconsistentSnapshotError) {
    throw createError({
      statusCode: 409,
      statusMessage: 'The document changed while it was being read. The previous snapshot was kept — try again.',
    })
  }
  if (err instanceof GoogleUnsupportedDocumentTypeError) {
    throw createError({ statusCode: 415, statusMessage: 'Only native Google Docs can be registered and snapshotted.' })
  }
  if (err instanceof GoogleNotFoundError) {
    throw createError({
      statusCode: 422,
      statusMessage: 'This document does not exist or is not shared with the RICK service account.',
    })
  }
  if (isGoogleUnacceptableResponseError(err)) {
    throw createError({ statusCode: 502, statusMessage: 'Google returned a response this application cannot accept.' })
  }
  if (isGoogleUnavailableError(err)) {
    throw createError({ statusCode: 503, statusMessage: 'Google Drive is temporarily unavailable. Please try again later.' })
  }
  console.error('Unexpected error reading the Google document.', err)
  throw createError({ statusCode: 500, statusMessage: 'Unable to read the Google document.' })
}
