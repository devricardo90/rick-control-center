/**
 * Typed persistence surface for DocumentSource — a project-owned strategic
 * document registry entry. This module persists provenance, classification,
 * approval state and synchronization state only; it never imports, stores,
 * or parses document body content, and never calls Google Drive or any
 * other external service.
 *
 * Two hardening properties, corrected after independent review (Jira
 * comment `11522` on NDERCC-12):
 *
 * 1. `metadataJson` is narrowed from `unknown` through a real recursive
 *    JSON-value validator (with cycle detection) before persistence, not
 *    just a shallow object/array check — every non-JSON-representable
 *    runtime value (`Date`, `Map`, `Set`, `bigint`, functions, symbols,
 *    `NaN`/`Infinity`, class instances, cyclic references) is rejected
 *    deterministically, and every key at every depth is rejected when it
 *    is credential-, secret-, or document-content-shaped.
 * 2. Every mutation (`createDocumentSource`, `updateDocumentSourceRegistry`,
 *    `recordDocumentSourceSyncSuccess`, `markDocumentSourceSyncStale`,
 *    `markDocumentSourceSyncError`) runs inside one interactive transaction
 *    that locks the owning project's row (`SELECT ... FOR UPDATE`) before
 *    validating its status, so a concurrent project archival is correctly
 *    serialized against the mutation rather than racing it.
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
// Exported as values, not just types — a future HTTP boundary validates
// request input against this exact enum set, so it can never drift from
// what is actually persisted (same rationale as AutonomyPolicy/BranchPolicy
// in project.ts).
export { DocumentApprovalStatus, DocumentProvider, DocumentSyncStatus, DocumentType } from '@prisma/client'

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
function assertValidMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidDocumentSourceInputError('metadataJson must be a JSON object, not an array or primitive')
  }
  assertSafeJsonValue(value, new Set())
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

interface ProjectLockRow {
  id: string
  status: string
}

function isProjectLockRow(value: unknown): value is ProjectLockRow {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return typeof candidate['id'] === 'string' && typeof candidate['status'] === 'string'
}

function isProjectLockRowArray(value: unknown): value is ProjectLockRow[] {
  return Array.isArray(value) && value.every(isProjectLockRow)
}

/**
 * Locks the project row (`SELECT ... FOR UPDATE`, Prisma-parameterized —
 * never string-concatenated) and validates it exists and is not ARCHIVED,
 * inside the caller's transaction. Must run before any DocumentSource
 * read/write in that same transaction: Postgres's row-level lock means this
 * transaction either fully completes before a concurrent
 * `transitionProjectLifecycle` archival's own `UPDATE` on the same row, or
 * fully waits for it — the two can never interleave, so a mutation can
 * never observe a stale pre-archival status and commit after the project
 * has already been serialized as ARCHIVED.
 */
async function lockMutableProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const raw: unknown = await tx.$queryRaw`SELECT id, status FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`

  if (!isProjectLockRowArray(raw)) {
    throw new Error('Unexpected result shape from project lock query')
  }

  const row = raw[0]
  if (!row) {
    throw new ProjectNotFoundError(projectId)
  }
  if (row.status === 'ARCHIVED') {
    throw new ArchivedProjectReadOnlyError(projectId)
  }
}

/**
 * Shared transactional envelope for every DocumentSource mutation: locks
 * and validates the owning project, then runs `run` inside the same
 * transaction. Every mutation function below goes through this single
 * implementation so all five receive identical archived-project protection.
 */
async function withMutableProjectTransaction<T>(
  client: PrismaClient,
  projectId: string,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await lockMutableProject(tx, projectId)
    return run(tx)
  })
}

/** Loads a source scoped to its owning project, inside a transaction. A source that exists but belongs to a different project is treated identically to "doesn't exist". */
async function requireOwnedDocumentSource(
  tx: Prisma.TransactionClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  const source = await tx.documentSource.findUnique({ where: { id: sourceId } })

  if (!source || source.projectId !== projectId) {
    throw new DocumentSourceNotFoundError(sourceId)
  }

  return source
}

/** Read-only existence check — does NOT reject an archived project; reads remain allowed for archived projects. */
async function requireExistingProject(client: PrismaClient, projectId: string): Promise<void> {
  const project = await client.project.findUnique({ where: { id: projectId }, select: { id: true } })

  if (!project) {
    throw new ProjectNotFoundError(projectId)
  }
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
 * Register a new document source. Rejects an unknown or archived project
 * (locked and validated atomically with the insert), validates every field
 * per DEC-RIC-002, and translates a duplicate
 * `(projectId, provider, externalFileId)` into `DuplicateDocumentSourceError`
 * rather than a raw Prisma constraint error.
 */
export async function createDocumentSource(
  client: PrismaClient,
  input: CreateDocumentSourceInput,
): Promise<DocumentSource> {
  const externalFileId = assertNonEmptyTrimmed(input.externalFileId, 'externalFileId')
  const title = assertNonEmptyTrimmed(input.title, 'title')
  const url = assertValidUrl(input.url)
  const revision = input.revision !== undefined ? assertNonEmptyTrimmed(input.revision, 'revision') : undefined
  const checksum = input.checksum !== undefined ? assertValidChecksum(input.checksum) : undefined
  const metadataJson = input.metadataJson !== undefined ? assertValidMetadata(input.metadataJson) : undefined

  try {
    return await withMutableProjectTransaction(client, input.projectId, tx => tx.documentSource.create({
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
    }))
  }
  catch (err: unknown) {
    if (isUniqueConstraintViolation(err)) {
      throw new DuplicateDocumentSourceError(input.projectId, input.provider, externalFileId)
    }
    throw err
  }
}

/** Finds one document source scoped to its owning project. Rejects an unknown project; returns `null` (not an error) when the source doesn't exist or belongs to a different project. Reads are allowed for archived projects. */
export async function findDocumentSourceForProject(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource | null> {
  await requireExistingProject(client, projectId)

  const source = await client.documentSource.findUnique({ where: { id: sourceId } })

  if (!source || source.projectId !== projectId) {
    return null
  }

  return source
}

/** Lists a project's document sources in deterministic order: documentType, then title, then createdAt, then id. Rejects an unknown project; returns `[]` for an existing project with no sources. Reads are allowed for archived projects. */
export async function listDocumentSourcesForProject(
  client: PrismaClient,
  projectId: string,
): Promise<DocumentSource[]> {
  await requireExistingProject(client, projectId)

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

/** Updates registry/approval fields without touching provenance identifiers or synchronization state. Rejects mutation of an archived project, atomically with the update. */
export async function updateDocumentSourceRegistry(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
  input: UpdateDocumentSourceRegistryInput,
): Promise<DocumentSource> {
  const title = input.title !== undefined ? assertNonEmptyTrimmed(input.title, 'title') : undefined
  const url = input.url !== undefined ? assertValidUrl(input.url) : undefined
  const revision = input.revision !== undefined && input.revision !== null
    ? assertNonEmptyTrimmed(input.revision, 'revision')
    : input.revision

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    await requireOwnedDocumentSource(tx, projectId, sourceId)

    return tx.documentSource.update({
      where: { id: sourceId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(url !== undefined ? { url } : {}),
        ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
        ...(input.approvalStatus !== undefined ? { approvalStatus: input.approvalStatus } : {}),
        ...(revision !== undefined ? { revision } : {}),
      },
    })
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
 * in a single update. Rejects mutation of an archived project, atomically
 * with the update.
 */
export async function recordDocumentSourceSyncSuccess(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
  input: RecordDocumentSourceSyncSuccessInput,
): Promise<DocumentSource> {
  const revision = input.revision !== undefined ? assertNonEmptyTrimmed(input.revision, 'revision') : undefined
  const checksum = input.checksum !== undefined ? assertValidChecksum(input.checksum) : undefined
  const metadataJson = input.metadataJson !== undefined ? assertValidMetadata(input.metadataJson) : undefined

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    await requireOwnedDocumentSource(tx, projectId, sourceId)

    return tx.documentSource.update({
      where: { id: sourceId },
      data: {
        ...(revision !== undefined ? { revision } : {}),
        ...(checksum !== undefined ? { checksum } : {}),
        ...(metadataJson !== undefined ? { metadataJson: metadataJson as Prisma.InputJsonValue } : {}),
        syncStatus: 'SYNCED',
        lastSyncedAt: input.syncedAt,
      },
    })
  })
}

/** Marks a source STALE, atomically with the archived-project check. Preserves `revision`, `checksum`, `metadataJson` and `lastSyncedAt` exactly as they were — only `syncStatus` changes. */
export async function markDocumentSourceSyncStale(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    await requireOwnedDocumentSource(tx, projectId, sourceId)
    return tx.documentSource.update({ where: { id: sourceId }, data: { syncStatus: 'STALE' } })
  })
}

/** Marks a source ERROR after a failed synchronization attempt, atomically with the archived-project check. Preserves `revision`, `checksum`, `metadataJson` and `lastSyncedAt` — `lastSyncedAt` reflects only the last *successful* sync. */
export async function markDocumentSourceSyncError(
  client: PrismaClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    await requireOwnedDocumentSource(tx, projectId, sourceId)
    return tx.documentSource.update({ where: { id: sourceId }, data: { syncStatus: 'ERROR' } })
  })
}
