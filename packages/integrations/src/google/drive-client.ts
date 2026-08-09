/**
 * Framework-independent, READ-ONLY Google Drive adapter. This is the ONLY
 * file in the repository authorized to call the Drive API, and it may only
 * ever issue these two `GET` requests against the fixed origin below
 * (DEC-RIC-003 §"Google Drive read contract"):
 *
 *   - `GET /drive/v3/files/{fileId}?fields=<strict allowlist>`
 *   - `GET /drive/v3/files/{fileId}/export?mimeType=text/plain`
 *
 * There is no code path here that accepts a caller-supplied host or base
 * URL, and no path that issues any method other than `GET` — so no Drive
 * or Docs write can originate from this adapter.
 *
 * Uses Node's native stable `fetch`; `google-auth-library` is confined to
 * access-token.ts and reaches this module only as an opaque
 * `GoogleAccessTokenProvider`. Both the token provider and `fetch` are
 * injectable, which is how the automated tests exercise every branch
 * without a live credential or a network call.
 *
 * External-error policy (translated to HTTP by
 * apps/web/server/utils/google-error-mapping.ts):
 *   - GoogleValidationError      — malformed file ID; never reaches the network.
 *   - GoogleNotFoundError        — 404: absent, or not shared with the service account.
 *   - GoogleAuthError            — 401, or 403 permission denial, or token minting failure.
 *   - GoogleRateLimitError       — 429.
 *   - GoogleTimeoutError         — aborted by the deterministic timeout below.
 *   - GoogleUpstreamError        — any other non-2xx, or a network failure.
 *   - GoogleMalformedResponseError — 2xx whose body did not narrow.
 *   - GoogleUnsupportedDocumentTypeError — the file is not a native Google Doc.
 *   - GoogleResponseTooLargeError — response exceeded the documented limit.
 *   - GoogleInconsistentSnapshotError — version drifted on all three attempts.
 *
 * No branch ever includes a Google response body, a request header, or the
 * access token in a thrown error.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import type { GoogleAccessTokenProvider } from './access-token.js'
import { isValidGoogleFileId } from './document-identifier.js'
import {
  GoogleAuthError,
  GoogleInconsistentSnapshotError,
  GoogleMalformedResponseError,
  GoogleNotFoundError,
  GoogleRateLimitError,
  GoogleResponseTooLargeError,
  GoogleTimeoutError,
  GoogleUnsupportedDocumentTypeError,
  GoogleUpstreamError,
  GoogleValidationError,
} from './errors.js'
import { computeDocumentChecksum, normalizeGoogleDocumentText } from './normalize-text.js'
import type { GoogleDocumentMetadata, GoogleDocumentSnapshot } from './types.js'

/** Fixed origin. Never composed from configuration or request input. */
const GOOGLE_API_ORIGIN = 'https://www.googleapis.com'

/** The strict metadata allowlist — provenance and consistency fields only. */
export const GOOGLE_METADATA_FIELDS = 'id,name,mimeType,version,modifiedTime,webViewLink'

/** Only native Google Docs can be exported as text. */
export const GOOGLE_DOCUMENT_MIME_TYPE = 'application/vnd.google-apps.document'

const EXPORT_MIME_TYPE = 'text/plain'
const DEFAULT_TIMEOUT_MS = 20000

/** Documented task limits. A strategic document far beyond these is a signal, not a document. */
const DEFAULT_MAX_EXPORT_BYTES = 5 * 1024 * 1024
const MAX_METADATA_BYTES = 64 * 1024

/** DEC-RIC-003: at most three total attempts before failing safely. */
export const MAX_SNAPSHOT_ATTEMPTS = 3

export interface GoogleDriveReaderOptions {
  accessTokenProvider: GoogleAccessTokenProvider
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxExportBytes?: number
}

export interface GoogleDriveReader {
  getGoogleDocumentMetadata: (fileId: string) => Promise<GoogleDocumentMetadata>
  exportGoogleDocumentText: (fileId: string) => Promise<string>
  snapshotGoogleDocument: (fileId: string) => Promise<GoogleDocumentSnapshot>
}

/** Fully resolved reader configuration, threaded explicitly instead of captured in a closure. */
interface ReaderContext {
  accessTokenProvider: GoogleAccessTokenProvider
  fetchImpl: typeof fetch
  timeoutMs: number
  maxExportBytes: number
}

function assertFileId(fileId: string): void {
  if (!isValidGoogleFileId(fileId)) {
    throw new GoogleValidationError('Invalid Google Drive file ID.')
  }
}

function throwForErrorStatus(status: number): never {
  if (status === 404) {
    throw new GoogleNotFoundError()
  }
  if (status === 401) {
    throw new GoogleAuthError()
  }
  if (status === 403) {
    throw new GoogleAuthError('Google denied access to this document.')
  }
  if (status === 429) {
    throw new GoogleRateLimitError()
  }
  throw new GoogleUpstreamError(status)
}

/** Rejects an oversized body from the declared `content-length` before it is read into memory. */
function assertDeclaredSizeWithinLimit(response: Response, limitBytes: number): void {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limitBytes) {
    throw new GoogleResponseTooLargeError(limitBytes)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(candidate: Record<string, unknown>, key: string): string | null {
  const value = candidate[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Drive serializes `files.version` (an int64) as a JSON string, but tolerate a number defensively. */
function readVersion(candidate: Record<string, unknown>): string | null {
  const value = candidate['version']
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value)
  }
  return null
}

/** Narrows a raw `files.get` body. Every required field must be present and well-typed, or the response is malformed. */
export function narrowGoogleDocumentMetadata(raw: unknown): GoogleDocumentMetadata {
  if (!isRecord(raw)) {
    throw new GoogleMalformedResponseError()
  }

  const id = readString(raw, 'id')
  const name = readString(raw, 'name')
  const mimeType = readString(raw, 'mimeType')
  const version = readVersion(raw)

  if (id === null || name === null || mimeType === null || version === null) {
    throw new GoogleMalformedResponseError()
  }

  return {
    id,
    name,
    mimeType,
    version,
    modifiedTime: readString(raw, 'modifiedTime'),
    webViewLink: readString(raw, 'webViewLink'),
  }
}

async function request(context: ReaderContext, url: string, accept: string): Promise<Response> {
  const token = await context.accessTokenProvider.getAccessToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), context.timeoutMs)

  try {
    return await context.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: accept },
      signal: controller.signal,
    })
  }
  catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GoogleTimeoutError()
    }
    throw new GoogleUpstreamError(0, 'Unable to reach Google Drive.')
  }
  finally {
    clearTimeout(timer)
  }
}

async function readMetadata(context: ReaderContext, fileId: string): Promise<GoogleDocumentMetadata> {
  assertFileId(fileId)

  const url = `${GOOGLE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(fileId)}`
    + `?fields=${encodeURIComponent(GOOGLE_METADATA_FIELDS)}&supportsAllDrives=true`
  const response = await request(context, url, 'application/json')

  if (!response.ok) {
    throwForErrorStatus(response.status)
  }
  assertDeclaredSizeWithinLimit(response, MAX_METADATA_BYTES)

  let body: unknown
  try {
    body = await response.json()
  }
  catch {
    throw new GoogleMalformedResponseError()
  }

  return narrowGoogleDocumentMetadata(body)
}

async function readExportedText(context: ReaderContext, fileId: string): Promise<string> {
  assertFileId(fileId)

  const url = `${GOOGLE_API_ORIGIN}/drive/v3/files/${encodeURIComponent(fileId)}`
    + `/export?mimeType=${encodeURIComponent(EXPORT_MIME_TYPE)}`
  const response = await request(context, url, EXPORT_MIME_TYPE)

  if (!response.ok) {
    throwForErrorStatus(response.status)
  }
  assertDeclaredSizeWithinLimit(response, context.maxExportBytes)

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > context.maxExportBytes) {
    throw new GoogleResponseTooLargeError(context.maxExportBytes)
  }

  return normalizeGoogleDocumentText(bytes)
}

/** One metadata/export/metadata cycle. Returns `null` when the version drifted mid-export. */
async function attemptSnapshot(
  context: ReaderContext,
  fileId: string,
  attempt: number,
): Promise<GoogleDocumentSnapshot | null> {
  const before = await readMetadata(context, fileId)
  if (before.mimeType !== GOOGLE_DOCUMENT_MIME_TYPE) {
    throw new GoogleUnsupportedDocumentTypeError(before.mimeType)
  }

  const contentText = await readExportedText(context, fileId)
  const after = await readMetadata(context, fileId)

  if (before.id !== after.id || before.version !== after.version) {
    return null
  }

  return {
    metadata: after,
    providerVersion: after.version,
    contentText,
    checksum: computeDocumentChecksum(contentText),
    byteLength: Buffer.byteLength(contentText, 'utf8'),
    attempts: attempt,
  }
}

async function readSnapshot(context: ReaderContext, fileId: string): Promise<GoogleDocumentSnapshot> {
  assertFileId(fileId)

  for (let attempt = 1; attempt <= MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
    const snapshot = await attemptSnapshot(context, fileId, attempt)
    if (snapshot !== null) {
      return snapshot
    }
  }

  throw new GoogleInconsistentSnapshotError(MAX_SNAPSHOT_ATTEMPTS)
}

export function createGoogleDriveReader(options: GoogleDriveReaderOptions): GoogleDriveReader {
  const context: ReaderContext = {
    accessTokenProvider: options.accessTokenProvider,
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxExportBytes: options.maxExportBytes ?? DEFAULT_MAX_EXPORT_BYTES,
  }

  return {
    getGoogleDocumentMetadata: fileId => readMetadata(context, fileId),
    exportGoogleDocumentText: fileId => readExportedText(context, fileId),
    snapshotGoogleDocument: fileId => readSnapshot(context, fileId),
  }
}
