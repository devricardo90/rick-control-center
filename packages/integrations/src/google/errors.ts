/**
 * Typed Google Drive adapter errors. None of these ever carries the
 * service-account credential, its private key, a JWT assertion, an OAuth
 * access token, an `Authorization` header, a raw Google response body, or
 * document content — only what a caller needs in order to decide how to
 * respond (NDERCC-13 / DEC-RIC-003).
 *
 * Every message below is a fixed literal or built from values the caller
 * itself supplied; no branch interpolates provider output.
 */

/** `GOOGLE_SERVICE_ACCOUNT_JSON` is not present in the server environment. */
export class GoogleCredentialMissingError extends Error {
  constructor(message = 'GOOGLE_SERVICE_ACCOUNT_JSON is required for Google Drive access but is not configured.') {
    super(message)
    this.name = 'GoogleCredentialMissingError'
  }
}

/**
 * The credential handle is present but is not a usable service-account
 * credential. `reason` names the failing structural rule only — it never
 * echoes any part of the credential value.
 */
export class GoogleCredentialInvalidError extends Error {
  constructor(reason: string) {
    super(`GOOGLE_SERVICE_ACCOUNT_JSON is not a valid service-account credential: ${reason}`)
    this.name = 'GoogleCredentialInvalidError'
  }
}

/** Malformed file ID or Google Docs URL — rejected before any network call. */
export class GoogleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoogleValidationError'
  }
}

/**
 * Mirrors Google's own deliberate ambiguity: Drive returns 404 both for a
 * file that does not exist and for one that exists but was never shared
 * with the service-account principal. This error does not claim to know
 * which case applies.
 */
export class GoogleNotFoundError extends Error {
  constructor(message = 'Google document not found or not shared with the service account.') {
    super(message)
    this.name = 'GoogleNotFoundError'
  }
}

/** Token minting failed, Drive responded 401, or Drive responded 403 (permission denied). */
export class GoogleAuthError extends Error {
  constructor(message = 'Google rejected the request (authentication or permission failure).') {
    super(message)
    this.name = 'GoogleAuthError'
  }
}

/** Drive responded 429. */
export class GoogleRateLimitError extends Error {
  constructor(message = 'Google Drive rate limit exceeded.') {
    super(message)
    this.name = 'GoogleRateLimitError'
  }
}

/** The request was aborted by the adapter's deterministic timeout. */
export class GoogleTimeoutError extends Error {
  constructor(message = 'Google Drive request timed out.') {
    super(message)
    this.name = 'GoogleTimeoutError'
  }
}

/** Network failure reaching Google, or a Google-side 5xx / unrecognized status. */
export class GoogleUpstreamError extends Error {
  constructor(public readonly status: number, message = 'Google Drive upstream failure.') {
    super(message)
    this.name = 'GoogleUpstreamError'
  }
}

/** Google responded 2xx but the body did not narrow into the expected shape. */
export class GoogleMalformedResponseError extends Error {
  constructor(message = 'Google returned an unexpected response shape.') {
    super(message)
    this.name = 'GoogleMalformedResponseError'
  }
}

/** The requested file is not a native Google Doc, so it cannot be exported as text. */
export class GoogleUnsupportedDocumentTypeError extends Error {
  constructor(public readonly mimeType: string) {
    super(`Only native Google Docs can be snapshotted; received MIME type: ${mimeType}`)
    this.name = 'GoogleUnsupportedDocumentTypeError'
  }
}

/** A response exceeded the adapter's documented size limit and was refused. */
export class GoogleResponseTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`Google response exceeded the ${limitBytes}-byte limit for this operation.`)
    this.name = 'GoogleResponseTooLargeError'
  }
}

/**
 * The provider version changed during every snapshot attempt, so no
 * export could be paired with a stable version. Deterministic and
 * transient: the caller must preserve the previous valid snapshot.
 */
export class GoogleInconsistentSnapshotError extends Error {
  constructor(public readonly attempts: number) {
    super(`The Google document changed during each of ${attempts} snapshot attempts; no consistent snapshot was taken.`)
    this.name = 'GoogleInconsistentSnapshotError'
  }
}
