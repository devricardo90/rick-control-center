/**
 * Shared field validators for the strategic-document persistence surface.
 *
 * Extracted verbatim from `src/document-source.ts` (NDERCC-12) with no
 * behavioural change, so that `src/document-snapshot.ts` (NDERCC-13) can
 * apply the *same* checksum and metadata rules rather than re-implementing
 * them slightly differently. Internal to @rick/database — deliberately not
 * re-exported from src/index.ts.
 *
 * The `metadataJson` validator is the security-relevant one: it narrows an
 * `unknown` boundary through a real recursive JSON-value validator (with
 * cycle detection), rejecting every non-JSON-representable runtime value
 * and every credential-, secret-, or document-content-shaped key at every
 * depth.
 *
 * NDERCC-12 / DEC-RIC-002; reused by NDERCC-13 / DEC-RIC-003.
 */
import { InvalidDocumentSourceInputError } from '../errors.js'

const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/

// Substring match on a normalized (lowercased, separator-stripped) key
// catches every case-insensitive spelling of the credential/secret/content
// names DEC-RIC-002 and the NDERCC-12 corrective review list (`token` also
// matches `accessToken`/`refreshToken`; `secret` also matches
// `clientSecret`; `credential` also matches `credentials`; `content` also
// matches `documentContent`; `body` also matches `documentBody`/
// `responseBody`; `response` also matches `rawResponse`/`providerResponse`;
// `headers` also matches `httpHeaders`/`requestHeaders`/`responseHeaders`)
// without needing every literal variant enumerated.
const FORBIDDEN_METADATA_KEY_FRAGMENTS = [
  // Credential / secret material (DEC-RIC-002 invariant 10).
  'token',
  'authorization',
  'cookie',
  'password',
  'secret',
  'credential',
  'apikey',
  // Document content / raw provider transport (DEC-RIC-002 invariant 11 —
  // hardened per NDERCC-12 corrective review comment 11522).
  'content',
  'body',
  'fulltext',
  'rawtext',
  'payload',
  'response',
  'headers',
] as const

function normalizeMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isForbiddenMetadataKey(key: string): boolean {
  const normalized = normalizeMetadataKey(key)
  return FORBIDDEN_METADATA_KEY_FRAGMENTS.some(fragment => normalized.includes(fragment))
}

function isPlainObject(value: object): boolean {
  const proto = Reflect.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isJsonPrimitive(value: unknown): value is null | string | boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
}

function assertFiniteNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw new InvalidDocumentSourceInputError('metadataJson must not contain NaN or Infinity')
  }
}

function assertNoCycle(value: object, ancestors: Set<object>): void {
  if (ancestors.has(value)) {
    throw new InvalidDocumentSourceInputError('metadataJson must not contain a circular reference')
  }
}

function assertSafeJsonArray(value: unknown[], ancestors: Set<object>): void {
  ancestors.add(value)
  for (const item of value) {
    assertSafeJsonValue(item, ancestors)
  }
  ancestors.delete(value)
}

function assertSafeJsonObject(value: object, ancestors: Set<object>): void {
  if (!isPlainObject(value)) {
    throw new InvalidDocumentSourceInputError(
      'metadataJson must contain only plain JSON objects, not class instances such as Date, Map, or Set',
    )
  }

  ancestors.add(value)
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenMetadataKey(key)) {
      throw new InvalidDocumentSourceInputError(`metadataJson must not contain the key "${key}"`)
    }
    assertSafeJsonValue(nested, ancestors)
  }
  ancestors.delete(value)
}

/**
 * Recursively validates that `value` is representable as JSON — `null`,
 * string, boolean, finite number, array of JSON values, or plain object
 * with JSON-value properties — with cycle detection so a self-referencing
 * object throws `InvalidDocumentSourceInputError` instead of overflowing
 * the stack. `undefined`, `bigint`, functions, symbols, `NaN`/`Infinity`,
 * and any object whose prototype isn't `Object.prototype`/`null` (e.g.
 * `Date`, `Map`, `Set`, a class instance) are all rejected deterministically.
 */
function assertSafeJsonValue(value: unknown, ancestors: Set<object>): void {
  if (isJsonPrimitive(value)) {
    return
  }
  if (typeof value === 'number') {
    assertFiniteNumber(value)
    return
  }
  if (typeof value !== 'object') {
    throw new InvalidDocumentSourceInputError(`metadataJson must not contain a ${typeof value} value`)
  }

  assertNoCycle(value, ancestors)

  if (Array.isArray(value)) {
    assertSafeJsonArray(value, ancestors)
    return
  }
  assertSafeJsonObject(value, ancestors)
}

/** Narrows an `unknown` metadata boundary into a safe JSON object, or throws `InvalidDocumentSourceInputError`. */
export function assertValidMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidDocumentSourceInputError('metadataJson must be a JSON object, not an array or primitive')
  }
  assertSafeJsonValue(value, new Set())
  return value as Record<string, unknown>
}

export function assertNonEmptyTrimmed(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new InvalidDocumentSourceInputError(`${field} must not be empty`)
  }
  return trimmed
}

/** Absolute `https:` URL only — rejects `http:`, relative URLs, embedded credentials, and non-http(s) schemes like `javascript:`/`data:`. */
export function assertValidUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  }
  catch {
    throw new InvalidDocumentSourceInputError('url must be an absolute https: URL')
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    throw new InvalidDocumentSourceInputError('url must be an absolute https: URL with no embedded credentials')
  }
  return value
}

export function assertValidChecksum(value: string): string {
  if (!CHECKSUM_PATTERN.test(value)) {
    throw new InvalidDocumentSourceInputError('checksum must be exactly 64 lowercase hexadecimal characters')
  }
  return value
}
