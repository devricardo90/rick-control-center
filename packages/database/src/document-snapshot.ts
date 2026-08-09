/**
 * Typed persistence surface for DocumentSnapshot — the immutable,
 * project-owned content snapshot of one strategic document at one provider
 * version (NDERCC-13 / DEC-RIC-003).
 *
 * Append-only, structurally:
 *
 *   - this module exports create-and-read operations only. There is no
 *     update and no delete function for a snapshot anywhere in the
 *     package's public surface, and the model has no `updatedAt` column —
 *     a snapshot that could be edited after the fact would stop being
 *     evidence of what the document actually said;
 *   - re-synchronizing an unchanged document reuses the existing row
 *     (matched on the `(source, providerVersion, checksum)` unique key)
 *     instead of appending a duplicate, so a sync loop cannot inflate the
 *     history;
 *   - a new provider version, or the same version with different content,
 *     appends a new row and never overwrites the previous one.
 *
 * The checksum is *recomputed here* from the content being stored rather
 * than trusted from the caller, so the database can never hold a row whose
 * `checksum` disagrees with its own `contentText`.
 *
 * This module never calls Google, never sees a credential, and never
 * stores a raw provider response, an HTTP header, or an access token —
 * `contentText` is the only body-content column and it holds canonically
 * normalized text produced by @rick/integrations, nothing else.
 *
 * NDERCC-13 / DEC-RIC-003: Google Drive credential and snapshot boundary.
 */
import { createHash } from 'node:crypto'
import type { DocumentSnapshot, DocumentSource, Prisma, PrismaClient } from '@prisma/client'
import { InvalidDocumentSnapshotInputError } from './errors.js'
import {
  assertNonEmptyTrimmed,
  assertValidChecksum,
  assertValidMetadata,
} from './internal/document-field-validation.js'
import {
  requireExistingProject,
  requireOwnedDocumentSource,
  withMutableProjectTransaction,
} from './internal/mutable-project-transaction.js'

export type { DocumentSnapshot }

/**
 * Every snapshot column except `contentText`. Used for list/summary reads
 * so that rendering a project's document registry never pulls megabytes of
 * document body out of PostgreSQL — and never risks leaking content into a
 * list DTO that was not meant to carry it.
 */
const SNAPSHOT_SUMMARY_SELECT = {
  id: true,
  projectId: true,
  documentSourceId: true,
  providerVersion: true,
  checksum: true,
  providerModifiedAt: true,
  syncedAt: true,
  createdAt: true,
} as const

export type DocumentSnapshotSummary = Prisma.DocumentSnapshotGetPayload<{
  select: typeof SNAPSHOT_SUMMARY_SELECT
}>

/** Newest-first, with `id` as the deterministic tiebreaker for same-millisecond rows. */
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] as const satisfies Prisma.DocumentSnapshotOrderByWithRelationInput[]

export interface RecordDocumentSnapshotSyncInput {
  projectId: string
  documentSourceId: string
  /** Drive `files.version`, proven stable across the export. */
  providerVersion: string
  /** Canonically normalized text (NFC, LF endings, BOM removed). */
  contentText: string
  /** Lowercase SHA-256 hex — verified against `contentText` before the write. */
  checksum: string
  providerModifiedAt: Date | null
  syncedAt: Date
  /** Non-secret provider metadata for the source row; validated by the DEC-RIC-002 scanner. */
  metadataJson?: unknown
}

export interface DocumentSnapshotSyncResult {
  snapshot: DocumentSnapshot
  /** The owning source, with its current synchronization pointer already advanced. */
  source: DocumentSource
  /** `false` when an identical snapshot already existed and was reused idempotently. */
  created: boolean
}

/** Recomputes the digest instead of trusting the caller's. */
function assertChecksumMatchesContent(checksum: string, contentText: string): void {
  const actual = createHash('sha256').update(Buffer.from(contentText, 'utf8')).digest('hex')

  if (actual !== checksum) {
    throw new InvalidDocumentSnapshotInputError('checksum does not match the content it was supplied with')
  }
}

/**
 * Persists one immutable snapshot and advances its source's current
 * synchronization state **in a single transaction**.
 *
 * Both halves commit together or neither does. That is what makes a failed
 * synchronization safe: if anything throws before commit — validation, the
 * snapshot insert, or the source update — PostgreSQL rolls the whole
 * transaction back and the previous valid snapshot, revision, checksum,
 * metadata and `lastSyncedAt` all survive untouched. The caller then marks
 * the source ERROR through the separate NDERCC-12 path, which by design
 * changes `syncStatus` and nothing else.
 */
export async function recordDocumentSnapshotSync(
  client: PrismaClient,
  input: RecordDocumentSnapshotSyncInput,
): Promise<DocumentSnapshotSyncResult> {
  const providerVersion = assertNonEmptyTrimmed(input.providerVersion, 'providerVersion')
  const checksum = assertValidChecksum(input.checksum)
  const metadataJson = input.metadataJson !== undefined ? assertValidMetadata(input.metadataJson) : undefined

  assertChecksumMatchesContent(checksum, input.contentText)

  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    const source = await requireOwnedDocumentSource(tx, input.projectId, input.documentSourceId)

    const existing = await tx.documentSnapshot.findUnique({
      where: {
        documentSourceId_providerVersion_checksum: {
          documentSourceId: source.id,
          providerVersion,
          checksum,
        },
      },
    })

    const snapshot = existing ?? await tx.documentSnapshot.create({
      data: {
        projectId: input.projectId,
        documentSourceId: source.id,
        providerVersion,
        contentText: input.contentText,
        checksum,
        providerModifiedAt: input.providerModifiedAt,
        syncedAt: input.syncedAt,
      },
    })

    const updatedSource = await tx.documentSource.update({
      where: { id: source.id },
      data: {
        revision: providerVersion,
        checksum,
        ...(metadataJson !== undefined ? { metadataJson: metadataJson as Prisma.InputJsonValue } : {}),
        syncStatus: 'SYNCED',
        lastSyncedAt: input.syncedAt,
      },
    })

    return { snapshot, source: updatedSource, created: existing === null }
  })
}

/**
 * The newest snapshot for one source, scoped to its owning project.
 * Returns `null` when the source has never synchronized, does not exist,
 * or belongs to a different project — the three cases are deliberately
 * indistinguishable to the caller, so a cross-project probe cannot confirm
 * that another project's source exists. Reads are allowed for archived
 * projects.
 */
export async function findLatestDocumentSnapshot(
  client: PrismaClient,
  projectId: string,
  documentSourceId: string,
): Promise<DocumentSnapshot | null> {
  await requireExistingProject(client, projectId)

  return client.documentSnapshot.findFirst({
    where: { projectId, documentSourceId },
    orderBy: [...NEWEST_FIRST],
  })
}

/**
 * The newest snapshot of every source in the project, as summaries
 * (without `contentText`). One row per source; sources that have never
 * synchronized simply do not appear.
 */
export async function listLatestDocumentSnapshotsForProject(
  client: PrismaClient,
  projectId: string,
): Promise<DocumentSnapshotSummary[]> {
  await requireExistingProject(client, projectId)

  return client.documentSnapshot.findMany({
    where: { projectId },
    select: SNAPSHOT_SUMMARY_SELECT,
    distinct: ['documentSourceId'],
    orderBy: [{ documentSourceId: 'asc' }, ...NEWEST_FIRST],
  })
}

/**
 * The full snapshot history for one source, newest first, as summaries.
 * Used to prove append-only behavior and to show how many immutable
 * revisions have been captured.
 */
export async function listDocumentSnapshotsForSource(
  client: PrismaClient,
  projectId: string,
  documentSourceId: string,
): Promise<DocumentSnapshotSummary[]> {
  await requireExistingProject(client, projectId)

  return client.documentSnapshot.findMany({
    where: { projectId, documentSourceId },
    select: SNAPSHOT_SUMMARY_SELECT,
    orderBy: [...NEWEST_FIRST],
  })
}
