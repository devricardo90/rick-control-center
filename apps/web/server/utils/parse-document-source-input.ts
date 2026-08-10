/**
 * Narrows an unknown request body into `{ document, documentType }` — the
 * ONLY fields a document-registration request may contain.
 *
 * Per DEC-RIC-003 the browser must never send a credential and must never
 * choose which host the server talks to. A body carrying a token,
 * credential, service-account JSON, private key, or an API host/base URL
 * is rejected outright (returns `null`, mapped to HTTP 400 by the caller),
 * not silently stripped — unlike an ordinary unrecognized field, these
 * specific names are a strong signal of a client misunderstanding the
 * credential boundary and deserve a hard failure rather than best-effort
 * tolerance.
 *
 * Snapshot-owned fields (`checksum`, `providerVersion`, `contentText`) are
 * rejected for a different reason: they are derived by the server from the
 * document itself and must never be assertable by a client, or the
 * checksum would stop being evidence.
 *
 * `document` is passed through as the operator typed it — resolving it to
 * exactly one file ID is the adapter's job
 * (`resolveGoogleDocumentFileId`), so URL parsing lives in one place.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { DocumentType } from '@rick/database'

export interface RegisterDocumentSourceInput {
  /** A Google Docs URL or a bare Drive file ID, exactly as supplied. */
  document: string
  documentType: DocumentType
}

const FORBIDDEN_BODY_KEYS = [
  // Credential material.
  'token',
  'accessToken',
  'credential',
  'credentials',
  'serviceAccount',
  'serviceAccountJson',
  'privateKey',
  'authorization',
  'secret',
  // Server-chosen network boundary.
  'apiHost',
  'host',
  'apiBaseUrl',
  'baseUrl',
  'origin',
  // Server-derived snapshot evidence.
  'checksum',
  'providerVersion',
  'contentText',
  'revision',
] as const

const DOCUMENT_TYPES: readonly string[] = Object.values(DocumentType)

/** Bounded so a pasted document body cannot be sent as a "URL". */
const MAX_DOCUMENT_REFERENCE_LENGTH = 2048

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function containsForbiddenKey(candidate: Record<string, unknown>): boolean {
  return FORBIDDEN_BODY_KEYS.some(key => key in candidate)
}

function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && DOCUMENT_TYPES.includes(value)
}

export function parseRegisterDocumentSourceInput(raw: unknown): RegisterDocumentSourceInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }

  const candidate = raw as Record<string, unknown>

  if (containsForbiddenKey(candidate)) {
    return null
  }

  const { document, documentType } = candidate

  if (!isNonEmptyString(document) || document.length > MAX_DOCUMENT_REFERENCE_LENGTH) {
    return null
  }
  if (!isDocumentType(documentType)) {
    return null
  }

  return { document: document.trim(), documentType }
}
