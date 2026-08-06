/**
 * Typed persistence surface for DocumentSource — a project-owned strategic
 * document registry entry. This module persists provenance, classification,
 * approval state and synchronization state only; it never imports, stores,
 * or parses document body content, and never calls Google Drive or any
 * other external service.
 *
 * `metadataJson` is treated as an `unknown` boundary and narrowed here
 * before persistence: it must be a plain JSON object, and it is recursively
 * rejected when any key (at any depth) is credential- or secret-shaped.
 *
 * NDERCC-12 / DEC-RIC-002: strategic document source foundation.
 */
import { Prisma } from '@prisma/client'
import type {
  DocumentApprovalStatus,
  DocumentProvider,
  DocumentSource,
  DocumentType,
  PrismaClient,
} from '@prisma/client'
import {
  ArchivedProjectReadOnlyError,
  DocumentSourceNotFoundError,
  DuplicateDocumentSourceError,
  InvalidDocumentSourceInputError,
  ProjectNotFoundError,
} from './errors.js'

export type { DocumentSource }
// Exported as values, not just types — the future NDERCC-13 HTTP boundary
// validates request input against this exact enum set, so it can never
// drift from what is actually persisted (same rationale as
// AutonomyPolicy/BranchPolicy in project.ts).
export { DocumentApprovalStatus, DocumentProvider, DocumentSyncStatus, DocumentType } from '@prisma/client'

const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/

// Substring match on a normalized (lowercased, separator-stripped) key
// catches every case-insensitive spelling of the credential/secret names
// DEC-RIC-002 lists (`token` also matches `accessToken`/`refreshToken`;
// `secret` also matches `clientSecret`; `credential` also matches
// `credentials`) without needing every literal variant enumerated.
const FORBIDDEN_METADATA_KEY_FRAGMENTS = [
  'token',
  'authorization',
  'cookie',
  'password',
  'secret',
  'credential',
  'apikey',
] as const

function normalizeMetadataKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function containsForbiddenMetadataKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenMetadataKey)
  }
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalized = normalizeMetadataKey(key)
    return FORBIDDEN_METADATA_KEY_FRAGMENTS.some(fragment => normalized.includes(fragment))
      || containsForbiddenMetadataKey(nested)
  })
}

/** Narrows an `unknown` metadata boundary into a safe JSON object, or throws `InvalidDocumentSourceInputError`. */
function assertValidMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidDocumentSourceInputError('metadataJson must be a JSON object, not an array or primitive')
  }
  if (containsForbiddenMetadataKey(value)) {
    throw new InvalidDocumentSourceInputError('metadataJson must not contain credential- or secret-shaped keys')
  }
  return value as Record<string, unknown>
}

function assertNonEmptyTrimmed(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new InvalidDocumentSourceInputError(`${field} must not be empty`)
  }
  return trimmed
}

/** Absolute `https:` URL only — rejects `http:`, relative URLs, embedded credentials, and non-http(s) schemes like `javascript:`/`data:`. */
function assertValidUrl(value: string): string {
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

function assertValidChecksum(value: string): string {
  if (!CHECKSUM_PATTERN.test(value)) {
    throw new InvalidDocumentSourceInputError('checksum must be exactly 64 lowercase hexadecimal characters')
  }
  return value
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

async function requireMutableProject(client: PrismaClient, projectId: string): Promise<void> {
  const project = await client.project.findUnique({ where: { id: projectId } })

  if (!project) {
    throw new ProjectNotFoundError(projectId)
  }
  if (project.status === 'ARCHIVED') {
    throw new ArchivedProjectReadOnlyError(projectId)
  }
}

/** Loads a source scoped to its owning project. A source that exists but belongs to a different project is treated identically to "doesn't exist". */
async function requireOwnedDocumentSource(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  const source = await client.documentSource.findUnique({ where: { id: sourceId } })

  if (!source || source.projectId !== projectId) {
    throw new DocumentSourceNotFoundError(sourceId)
  }

  return source
}

export interface CreateDocumentSourceInput {
  projectId: string
  provider: DocumentProvider
  externalFileId: string
  documentType: DocumentType
  title: string
  url: string
  revision?: string
  checksum?: string
  approvalStatus?: DocumentApprovalStatus
  metadataJson?: unknown
}

/**
 * Register a new document source. Rejects an unknown or archived project,
 * validates every field per DEC-RIC-002, and translates a duplicate
 * `(projectId, provider, externalFileId)` into `DuplicateDocumentSourceError`
 * rather than a raw Prisma constraint error.
 */
export async function createDocumentSource(
  client: PrismaClient,
  input: CreateDocumentSourceInput,
): Promise<DocumentSource> {
  await requireMutableProject(client, input.projectId)

  const externalFileId = assertNonEmptyTrimmed(input.externalFileId, 'externalFileId')
  const title = assertNonEmptyTrimmed(input.title, 'title')
  const url = assertValidUrl(input.url)
  const revision = input.revision !== undefined ? assertNonEmptyTrimmed(input.revision, 'revision') : undefined
  const checksum = input.checksum !== undefined ? assertValidChecksum(input.checksum) : undefined
  const metadataJson = input.metadataJson !== undefined ? assertValidMetadata(input.metadataJson) : undefined

  try {
    return await client.documentSource.create({
      data: {
        projectId: input.projectId,
        provider: input.provider,
        externalFileId,
        documentType: input.documentType,
        title,
        url,
        ...(revision !== undefined ? { revision } : {}),
        ...(checksum !== undefined ? { checksum } : {}),
        ...(input.approvalStatus !== undefined ? { approvalStatus: input.approvalStatus } : {}),
        ...(metadataJson !== undefined ? { metadataJson: metadataJson as Prisma.InputJsonValue } : {}),
      },
    })
  }
  catch (err: unknown) {
    if (isUniqueConstraintViolation(err)) {
      throw new DuplicateDocumentSourceError(input.projectId, input.provider, externalFileId)
    }
    throw err
  }
}

/** Finds one document source scoped to its owning project. Returns `null` (not an error) when it doesn't exist or belongs to a different project. */
export async function findDocumentSourceForProject(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource | null> {
  const source = await client.documentSource.findUnique({ where: { id: sourceId } })

  if (!source || source.projectId !== projectId) {
    return null
  }

  return source
}

/** Lists a project's document sources in deterministic order: documentType, then title, then createdAt, then id. */
export async function listDocumentSourcesForProject(
  client: PrismaClient,
  projectId: string,
): Promise<DocumentSource[]> {
  return client.documentSource.findMany({
    where: { projectId },
    orderBy: [
      { documentType: 'asc' },
      { title: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  })
}

/**
 * Mutable registry fields — `projectId`, `provider` and `externalFileId`
 * are immutable after creation and cannot be changed through this
 * function. `revision: null` explicitly clears it; `undefined` leaves the
 * existing value untouched.
 */
export interface UpdateDocumentSourceRegistryInput {
  title?: string
  url?: string
  documentType?: DocumentType
  approvalStatus?: DocumentApprovalStatus
  revision?: string | null
}

/** Updates registry/approval fields without touching provenance identifiers or synchronization state. Rejects mutation of an archived project. */
export async function updateDocumentSourceRegistry(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
  input: UpdateDocumentSourceRegistryInput,
): Promise<DocumentSource> {
  await requireMutableProject(client, projectId)
  await requireOwnedDocumentSource(client, projectId, sourceId)

  const title = input.title !== undefined ? assertNonEmptyTrimmed(input.title, 'title') : undefined
  const url = input.url !== undefined ? assertValidUrl(input.url) : undefined
  const revision = input.revision !== undefined && input.revision !== null
    ? assertNonEmptyTrimmed(input.revision, 'revision')
    : input.revision

  return client.documentSource.update({
    where: { id: sourceId },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(url !== undefined ? { url } : {}),
      ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
      ...(input.approvalStatus !== undefined ? { approvalStatus: input.approvalStatus } : {}),
      ...(revision !== undefined ? { revision } : {}),
    },
  })
}

export interface RecordDocumentSourceSyncSuccessInput {
  revision?: string
  checksum?: string
  metadataJson?: unknown
  syncedAt: Date
}

/**
 * Records a successful synchronization atomically: `revision`, `checksum`,
 * `metadataJson`, `syncStatus = SYNCED` and `lastSyncedAt` advance together
 * in a single update. Rejects mutation of an archived project.
 */
export async function recordDocumentSourceSyncSuccess(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
  input: RecordDocumentSourceSyncSuccessInput,
): Promise<DocumentSource> {
  await requireMutableProject(client, projectId)
  await requireOwnedDocumentSource(client, projectId, sourceId)

  const revision = input.revision !== undefined ? assertNonEmptyTrimmed(input.revision, 'revision') : undefined
  const checksum = input.checksum !== undefined ? assertValidChecksum(input.checksum) : undefined
  const metadataJson = input.metadataJson !== undefined ? assertValidMetadata(input.metadataJson) : undefined

  return client.documentSource.update({
    where: { id: sourceId },
    data: {
      ...(revision !== undefined ? { revision } : {}),
      ...(checksum !== undefined ? { checksum } : {}),
      ...(metadataJson !== undefined ? { metadataJson: metadataJson as Prisma.InputJsonValue } : {}),
      syncStatus: 'SYNCED',
      lastSyncedAt: input.syncedAt,
    },
  })
}

/** Marks a source STALE. Preserves `revision`, `checksum`, `metadataJson` and `lastSyncedAt` exactly as they were — only `syncStatus` changes. */
export async function markDocumentSourceSyncStale(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  await requireMutableProject(client, projectId)
  await requireOwnedDocumentSource(client, projectId, sourceId)

  return client.documentSource.update({
    where: { id: sourceId },
    data: { syncStatus: 'STALE' },
  })
}

/** Marks a source ERROR after a failed synchronization attempt. Preserves `revision`, `checksum`, `metadataJson` and `lastSyncedAt` — `lastSyncedAt` reflects only the last *successful* sync. */
export async function markDocumentSourceSyncError(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  await requireMutableProject(client, projectId)
  await requireOwnedDocumentSource(client, projectId, sourceId)

  return client.documentSource.update({
    where: { id: sourceId },
    data: { syncStatus: 'ERROR' },
  })
}
