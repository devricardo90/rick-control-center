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
 * Both properties now live in `src/internal/document-field-validation.ts`
 * and `src/internal/mutable-project-transaction.ts` (extracted unchanged
 * by NDERCC-13) so that the immutable snapshot writer in
 * `src/document-snapshot.ts` enforces the identical rules instead of a
 * near-copy of them.
 *
 * NDERCC-12 / DEC-RIC-002: strategic document source foundation.
 */
import type {
  DocumentApprovalStatus,
  DocumentProvider,
  DocumentSource,
  DocumentType,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import { DuplicateDocumentSourceError } from './errors.js'
import {
  assertNonEmptyTrimmed,
  assertValidChecksum,
  assertValidMetadata,
  assertValidUrl,
} from './internal/document-field-validation.js'
import {
  isUniqueConstraintViolation,
  requireExistingProject,
  requireOwnedDocumentSource,
  withMutableProjectTransaction,
} from './internal/mutable-project-transaction.js'

export type { DocumentSource }
// Exported as values, not just types — a future HTTP boundary validates
// request input against this exact enum set, so it can never drift from
// what is actually persisted (same rationale as AutonomyPolicy/BranchPolicy
// in project.ts).
export { DocumentApprovalStatus, DocumentProvider, DocumentSyncStatus, DocumentType } from '@prisma/client'

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
