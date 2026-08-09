/**
 * Public HTTP representations of a strategic document source and its
 * immutable snapshots — dedicated, closed allowlist DTOs. The Prisma
 * models are never serialized directly.
 *
 * Two fields are deliberately absent from `PublicDocumentSource`:
 *
 *   - `metadataJson`. It holds only non-secret provider metadata (the
 *     NDERCC-12 scanner guarantees that), but "guaranteed not to contain a
 *     credential today" is a weaker property than "cannot reach a client
 *     at all". Everything the interface actually needs from it is already
 *     projected into explicit fields below.
 *   - the snapshot's `contentText`. Document body content is returned only
 *     by the dedicated single-snapshot endpoint, never in a list — so a
 *     registry listing can never accidentally ship megabytes of strategic
 *     document text to the browser.
 *
 * `checksumPrefix` exists so the interface can show that a checksum
 * changed without rendering 64 characters of hex; the full checksum is
 * still available on the snapshot DTO for verification.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import type { DocumentSnapshot, DocumentSnapshotSummary, DocumentSource } from '@rick/database'

const CHECKSUM_PREFIX_LENGTH = 12

export interface PublicDocumentSnapshotSummary {
  id: string
  documentSourceId: string
  providerVersion: string
  checksum: string
  checksumPrefix: string
  providerModifiedAt: string | null
  syncedAt: string
  createdAt: string
}

export interface PublicDocumentSource {
  id: string
  projectId: string
  provider: DocumentSource['provider']
  externalFileId: string
  documentType: DocumentSource['documentType']
  title: string
  url: string
  revision: string | null
  approvalStatus: DocumentSource['approvalStatus']
  syncStatus: DocumentSource['syncStatus']
  checksum: string | null
  checksumPrefix: string | null
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
  /** Newest immutable snapshot, or `null` when this source has never synchronized. */
  latestSnapshot: PublicDocumentSnapshotSummary | null
}

/** Full snapshot including content — returned only by the single-snapshot endpoint. */
export interface PublicDocumentSnapshot extends PublicDocumentSnapshotSummary {
  projectId: string
  contentText: string
  contentLength: number
}

/**
 * Result of a synchronization. `snapshotCreated: false` means the document
 * was unchanged and the existing immutable snapshot was reused — the
 * observable proof that re-syncing is duplicate-safe.
 */
export interface PublicDocumentSyncResult {
  source: PublicDocumentSource
  snapshotCreated: boolean
}

function toChecksumPrefix(checksum: string): string {
  return checksum.slice(0, CHECKSUM_PREFIX_LENGTH)
}

export function toPublicDocumentSnapshotSummary(
  snapshot: DocumentSnapshotSummary,
): PublicDocumentSnapshotSummary {
  return {
    id: snapshot.id,
    documentSourceId: snapshot.documentSourceId,
    providerVersion: snapshot.providerVersion,
    checksum: snapshot.checksum,
    checksumPrefix: toChecksumPrefix(snapshot.checksum),
    providerModifiedAt: snapshot.providerModifiedAt === null ? null : snapshot.providerModifiedAt.toISOString(),
    syncedAt: snapshot.syncedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
  }
}

export function toPublicDocumentSnapshot(snapshot: DocumentSnapshot): PublicDocumentSnapshot {
  return {
    ...toPublicDocumentSnapshotSummary(snapshot),
    projectId: snapshot.projectId,
    contentText: snapshot.contentText,
    contentLength: Buffer.byteLength(snapshot.contentText, 'utf8'),
  }
}

export function toPublicDocumentSource(
  source: DocumentSource,
  latestSnapshot: DocumentSnapshotSummary | null,
): PublicDocumentSource {
  return {
    id: source.id,
    projectId: source.projectId,
    provider: source.provider,
    externalFileId: source.externalFileId,
    documentType: source.documentType,
    title: source.title,
    url: source.url,
    revision: source.revision,
    approvalStatus: source.approvalStatus,
    syncStatus: source.syncStatus,
    checksum: source.checksum,
    checksumPrefix: source.checksum === null ? null : toChecksumPrefix(source.checksum),
    lastSyncedAt: source.lastSyncedAt === null ? null : source.lastSyncedAt.toISOString(),
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
    latestSnapshot: latestSnapshot === null ? null : toPublicDocumentSnapshotSummary(latestSnapshot),
  }
}
