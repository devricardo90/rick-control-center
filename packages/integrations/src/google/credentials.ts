/**
 * Narrows the `GOOGLE_SERVICE_ACCOUNT_JSON` server-only secret handle into
 * a minimal, typed service-account credential (DEC-RIC-003).
 *
 * Hard rules enforced here:
 *   - the handle is read from the environment only — never from an HTTP
 *     request, a database row, or a caller-supplied string literal in
 *     application code;
 *   - the parsed value is returned in memory to the token provider and
 *     nothing else: it is never persisted, never logged, and never
 *     serialized into an error message;
 *   - `type` must be exactly `service_account`, and `client_email` and
 *     `private_key` must both be present — the three checks DEC-RIC-003
 *     requires before the credential may be used;
 *   - every failure throws with a *structural* reason only (which rule
 *     failed), so no fragment of the secret can escape through an error
 *     message, stack trace, or log line.
 *
 * `toString`/`toJSON` are deliberately overridden on the returned object so
 * that an accidental `console.log(credential)` or `JSON.stringify(credential)`
 * anywhere downstream cannot print the private key.
 *
 * NDERCC-13 / DEC-RIC-003: Google Drive credential and snapshot boundary.
 */
import { GoogleCredentialInvalidError, GoogleCredentialMissingError } from './errors.js'

/** The single approved server-only secret handle (DEC-RIC-003). */
export const GOOGLE_SERVICE_ACCOUNT_ENV_KEY = 'GOOGLE_SERVICE_ACCOUNT_JSON'

const REQUIRED_CREDENTIAL_TYPE = 'service_account'
const REDACTED = '[redacted service-account credential]'

export interface GoogleServiceAccountCredential {
  readonly clientEmail: string
  readonly privateKey: string
  readonly projectId: string | null
}

function parseJsonHandle(raw: string): unknown {
  try {
    return JSON.parse(raw)
  }
  catch {
    // The caught SyntaxError echoes a fragment of the input — it is
    // deliberately discarded rather than wrapped or re-thrown.
    throw new GoogleCredentialInvalidError('the handle is not valid JSON')
  }
}

function requireNonEmptyString(candidate: Record<string, unknown>, key: string): string {
  const value = candidate[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GoogleCredentialInvalidError(`"${key}" is missing or not a non-empty string`)
  }
  return value
}

function readOptionalString(candidate: Record<string, unknown>, key: string): string | null {
  const value = candidate[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Builds the credential with non-enumerable, redacting `toString`/`toJSON`
 * so no accidental serialization of the object can leak the private key.
 */
function sealCredential(credential: GoogleServiceAccountCredential): GoogleServiceAccountCredential {
  return Object.freeze(Object.defineProperties(credential, {
    toString: { value: (): string => REDACTED, enumerable: false },
    toJSON: { value: (): string => REDACTED, enumerable: false },
  }))
}

/**
 * Narrows an `unknown` credential handle (the raw JSON string, or an
 * already-parsed object) into a `GoogleServiceAccountCredential`.
 */
export function parseGoogleServiceAccountCredential(raw: unknown): GoogleServiceAccountCredential {
  const parsed: unknown = typeof raw === 'string' ? parseJsonHandle(raw) : raw

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new GoogleCredentialInvalidError('the handle is not a JSON object')
  }

  const candidate = parsed as Record<string, unknown>

  if (candidate['type'] !== REQUIRED_CREDENTIAL_TYPE) {
    throw new GoogleCredentialInvalidError(`"type" must be exactly "${REQUIRED_CREDENTIAL_TYPE}"`)
  }

  return sealCredential({
    clientEmail: requireNonEmptyString(candidate, 'client_email'),
    privateKey: requireNonEmptyString(candidate, 'private_key'),
    projectId: readOptionalString(candidate, 'project_id'),
  })
}

/**
 * Reads and narrows the credential from a process environment. Throws
 * `GoogleCredentialMissingError` when the handle is absent or blank —
 * distinct from `GoogleCredentialInvalidError`, so "not configured yet" is
 * operationally distinguishable from "configured wrongly".
 */
export function readGoogleServiceAccountCredential(
  env: Readonly<Record<string, string | undefined>>,
): GoogleServiceAccountCredential {
  const handle = env[GOOGLE_SERVICE_ACCOUNT_ENV_KEY]

  if (handle === undefined || handle.trim().length === 0) {
    throw new GoogleCredentialMissingError()
  }

  return parseGoogleServiceAccountCredential(handle)
}
