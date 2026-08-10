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
 * The returned object is hardened against accidental disclosure through
 * every ordinary way a JavaScript value gets printed or copied. See
 * `sealCredential` below for the specific mechanisms and why overriding
 * `toString`/`toJSON` alone was not enough (NDERCC-13 corrective review,
 * finding 1).
 *
 * NDERCC-13 / DEC-RIC-003: Google Drive credential and snapshot boundary.
 */
import { GoogleCredentialInvalidError, GoogleCredentialMissingError } from './errors.js'

/** The single approved server-only secret handle (DEC-RIC-003). */
export const GOOGLE_SERVICE_ACCOUNT_ENV_KEY = 'GOOGLE_SERVICE_ACCOUNT_JSON'

const REQUIRED_CREDENTIAL_TYPE = 'service_account'
const REDACTED = '[redacted service-account credential]'

/**
 * Node's `util.inspect` hook, referenced through the global symbol registry
 * so this module does not need to import `node:util` (and so the behaviour
 * survives multiple `util` realms). `console.log` formats objects with
 * `util.inspect`, so defining this is what actually protects a stray
 * `console.log(credential)`.
 */
const NODE_INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom')

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

interface CredentialFields {
  clientEmail: string
  privateKey: string
  projectId: string | null
}

/**
 * Builds a credential whose private key cannot escape through ordinary
 * JavaScript disclosure paths, while remaining directly readable in-process
 * as `credential.privateKey` for the token provider.
 *
 * Overriding `toString`/`toJSON` alone was insufficient (corrective review
 * finding 1): neither hook is consulted by `util.inspect`, which is what
 * `console.log`, `console.error`, an unhandled-rejection dump, and most
 * logging libraries actually use to format an object. `console.log(cred)`
 * would therefore have printed the key verbatim.
 *
 * Three independent mechanisms now close that:
 *
 *   1. `privateKey` is a NON-ENUMERABLE own property. That removes it from
 *      `util.inspect`'s default output, `JSON.stringify`, `Object.keys`,
 *      `Object.entries`, object spread `{ ...cred }`, and `for...in` — the
 *      paths by which a secret normally travels into a log line or an
 *      outbound payload. It stays readable via direct property access,
 *      which is the only access the token provider needs.
 *   2. A `nodejs.util.inspect.custom` hook returns a fixed redaction
 *      string, so the object prints as `[redacted service-account
 *      credential]` rather than as a field dump. This also covers
 *      `util.inspect(cred, { showHidden: true })`, which would otherwise
 *      reveal non-enumerable properties.
 *   3. `toString`/`toJSON` remain, covering string coercion and explicit
 *      JSON serialization.
 *
 * The object is then frozen, so none of these guards can be removed by a
 * later caller.
 */
function sealCredential(fields: CredentialFields): GoogleServiceAccountCredential {
  const credential = { clientEmail: fields.clientEmail, projectId: fields.projectId }

  Object.defineProperties(credential, {
    privateKey: { value: fields.privateKey, enumerable: false, writable: false, configurable: false },
    toString: { value: (): string => REDACTED, enumerable: false },
    toJSON: { value: (): string => REDACTED, enumerable: false },
    [NODE_INSPECT_CUSTOM]: { value: (): string => REDACTED, enumerable: false },
  })

  return Object.freeze(credential) as GoogleServiceAccountCredential
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
