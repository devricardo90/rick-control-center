/**
 * Deterministic resolution of an operator-supplied Google Docs reference
 * into exactly one Drive file ID.
 *
 * The operator may paste either a bare file ID or a Google Docs / Drive
 * URL. A URL is accepted only when it is an absolute `https:` URL on one
 * of the two fixed Google hosts below and contains exactly one file ID in
 * a recognized position. Anything else — an arbitrary host, a folder link,
 * a search link, embedded credentials, or a URL with two conflicting
 * candidate IDs — is rejected rather than guessed at (DEC-RIC-003:
 * "extract and validate the file ID deterministically").
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { GoogleValidationError } from './errors.js'

/** Drive file IDs are URL-safe base64-ish opaque strings. Bounded to keep a pasted essay from reaching the network. */
const FILE_ID_PATTERN = /^[A-Za-z0-9_-]{16,256}$/

const ALLOWED_HOSTS = new Set(['docs.google.com', 'drive.google.com'])

/** `/document/d/{id}`, `/spreadsheets/d/{id}`, `/file/d/{id}`, `/document/u/0/d/{id}` — the `/d/{id}` segment pair. */
const PATH_ID_PATTERN = /\/d\/([A-Za-z0-9_-]+)/g

// Folder links resolve to a container, not a document — never silently
// treated as a file. `/folders/` (not `/drive/folders/`) is matched so the
// account-scoped `/drive/u/0/folders/{id}` form is caught too.
const FOLDER_PATH_FRAGMENTS = ['/folders/', '/folderview']

export function isValidGoogleFileId(value: string): boolean {
  return FILE_ID_PATTERN.test(value)
}

function assertAllowedUrl(parsed: URL): void {
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    throw new GoogleValidationError('A Google Docs URL must be an absolute https: URL with no embedded credentials.')
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new GoogleValidationError('Only docs.google.com and drive.google.com URLs are accepted.')
  }
  if (FOLDER_PATH_FRAGMENTS.some(fragment => parsed.pathname.includes(fragment))) {
    throw new GoogleValidationError('A Google Drive folder URL is not a document; provide a single document link.')
  }
}

/** Collects every candidate ID in the URL — both `/d/{id}` path segments and an `?id=` query parameter. */
function collectCandidateIds(parsed: URL): Set<string> {
  const candidates = new Set<string>()

  for (const match of parsed.pathname.matchAll(PATH_ID_PATTERN)) {
    const id = match[1]
    if (id !== undefined) {
      candidates.add(id)
    }
  }

  const queryId = parsed.searchParams.get('id')
  if (queryId !== null) {
    candidates.add(queryId)
  }

  return candidates
}

function extractFromUrl(value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  }
  catch {
    throw new GoogleValidationError('Provide a Google Docs URL or a Google Drive file ID.')
  }

  assertAllowedUrl(parsed)

  const candidates = collectCandidateIds(parsed)
  if (candidates.size === 0) {
    throw new GoogleValidationError('No Google Drive file ID could be found in that URL.')
  }
  if (candidates.size > 1) {
    throw new GoogleValidationError('That URL contains more than one file ID; provide a single document link.')
  }

  const [id] = candidates
  if (id === undefined || !isValidGoogleFileId(id)) {
    throw new GoogleValidationError('The file ID in that URL is not a valid Google Drive file ID.')
  }
  return id
}

/**
 * Resolves a bare file ID or a Google Docs/Drive URL to one file ID, or
 * throws `GoogleValidationError`. Never performs a network call.
 */
export function resolveGoogleDocumentFileId(input: string): string {
  const trimmed = input.trim()

  if (trimmed.length === 0) {
    throw new GoogleValidationError('A Google Docs URL or file ID is required.')
  }
  if (isValidGoogleFileId(trimmed)) {
    return trimmed
  }
  return extractFromUrl(trimmed)
}
