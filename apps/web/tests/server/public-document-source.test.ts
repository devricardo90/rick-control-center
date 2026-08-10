/**
 * DTO / redaction tests. These exist to prove that the transport shapes
 * are closed allowlists — a new column on the Prisma model must never
 * reach a client just because it was added to the schema.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import type { DocumentSnapshot, DocumentSnapshotSummary, DocumentSource } from '@rick/database'
import { describe, expect, it } from 'vitest'
import {
  toPublicDocumentSnapshot,
  toPublicDocumentSnapshotSummary,
  toPublicDocumentSource,
} from '../../server/utils/public-document-source'

const CHECKSUM = '58cf355cd37501b23e181b687ee1fe75f5292f5c7e09d0d2c8f82daf8e010cdf'

function documentSource(overrides: Partial<DocumentSource> = {}): DocumentSource {
  return {
    id: 'source-1',
    projectId: 'project-1',
    provider: 'GOOGLE_DRIVE',
    externalFileId: 'file-1',
    documentType: 'PRD',
    title: 'RIC-002 — PRD',
    url: 'https://docs.google.com/document/d/file-1/edit',
    revision: '23',
    approvalStatus: 'APPROVED',
    syncStatus: 'SYNCED',
    checksum: CHECKSUM,
    lastSyncedAt: new Date('2026-08-09T15:00:00.000Z'),
    metadataJson: { provider: 'GOOGLE_DRIVE', title: 'RIC-002 — PRD' },
    createdAt: new Date('2026-08-09T14:00:00.000Z'),
    updatedAt: new Date('2026-08-09T15:00:00.000Z'),
    ...overrides,
  } as DocumentSource
}

function snapshotSummary(overrides: Partial<DocumentSnapshotSummary> = {}): DocumentSnapshotSummary {
  return {
    id: 'snapshot-1',
    projectId: 'project-1',
    documentSourceId: 'source-1',
    providerVersion: '23',
    checksum: CHECKSUM,
    providerModifiedAt: new Date('2026-07-29T19:07:34.313Z'),
    syncedAt: new Date('2026-08-09T15:00:00.000Z'),
    createdAt: new Date('2026-08-09T15:00:00.000Z'),
    ...overrides,
  } as DocumentSnapshotSummary
}

function fullSnapshot(contentText: string): DocumentSnapshot {
  return { ...snapshotSummary(), contentText } as DocumentSnapshot
}

describe('toPublicDocumentSource', () => {
  it('exposes exactly the allowlisted fields', () => {
    const dto = toPublicDocumentSource(documentSource(), snapshotSummary())

    expect(Object.keys(dto).sort()).toEqual([
      'approvalStatus',
      'checksum',
      'checksumPrefix',
      'createdAt',
      'documentType',
      'externalFileId',
      'id',
      'lastSyncedAt',
      'latestSnapshot',
      'projectId',
      'provider',
      'revision',
      'syncStatus',
      'title',
      'updatedAt',
      'url',
    ])
  })

  it('never exposes metadataJson, even though the model carries it', () => {
    const dto = toPublicDocumentSource(documentSource(), null)

    expect('metadataJson' in dto).toBe(false)
    expect(JSON.stringify(dto)).not.toContain('metadataJson')
  })

  it('never exposes document content in the list representation', () => {
    const dto = toPublicDocumentSource(documentSource(), fullSnapshot('CONFIDENTIAL-STRATEGIC-BODY'))

    expect(JSON.stringify(dto)).not.toContain('contentText')
    expect(JSON.stringify(dto)).not.toContain('CONFIDENTIAL-STRATEGIC-BODY')
  })

  it('serializes timestamps as ISO strings and preserves nulls', () => {
    const dto = toPublicDocumentSource(documentSource({ lastSyncedAt: null, revision: null, checksum: null }), null)

    expect(dto.createdAt).toBe('2026-08-09T14:00:00.000Z')
    expect(dto.lastSyncedAt).toBeNull()
    expect(dto.revision).toBeNull()
    expect(dto.checksum).toBeNull()
    expect(dto.checksumPrefix).toBeNull()
    expect(dto.latestSnapshot).toBeNull()
  })

  it('derives a short checksum prefix for display without hiding the full value', () => {
    const dto = toPublicDocumentSource(documentSource(), null)

    expect(dto.checksumPrefix).toBe('58cf355cd375')
    expect(dto.checksum).toBe(CHECKSUM)
  })

  it('projects the latest snapshot summary when one exists', () => {
    const dto = toPublicDocumentSource(documentSource(), snapshotSummary())

    expect(dto.latestSnapshot?.providerVersion).toBe('23')
    expect(dto.latestSnapshot?.providerModifiedAt).toBe('2026-07-29T19:07:34.313Z')
    expect(dto.latestSnapshot?.checksumPrefix).toBe('58cf355cd375')
  })
})

describe('toPublicDocumentSnapshotSummary', () => {
  it('exposes exactly the allowlisted fields and no content', () => {
    const dto = toPublicDocumentSnapshotSummary(snapshotSummary())

    expect(Object.keys(dto).sort()).toEqual([
      'checksum',
      'checksumPrefix',
      'createdAt',
      'documentSourceId',
      'id',
      'providerModifiedAt',
      'providerVersion',
      'syncedAt',
    ])
  })

  it('preserves a null provider modified timestamp', () => {
    expect(toPublicDocumentSnapshotSummary(snapshotSummary({ providerModifiedAt: null })).providerModifiedAt)
      .toBeNull()
  })

  // The sync endpoint hands this function a FULL snapshot row (which is
  // structurally assignable to the summary type). This is the exact path
  // where document content could silently ride along into a response, so
  // it is asserted rather than assumed.
  it('drops contentText when handed a full snapshot row, as the sync response does', () => {
    const dto = toPublicDocumentSnapshotSummary(fullSnapshot('CONFIDENTIAL-STRATEGIC-BODY'))

    expect('contentText' in dto).toBe(false)
    expect(JSON.stringify(dto)).not.toContain('CONFIDENTIAL-STRATEGIC-BODY')
  })
})

describe('toPublicDocumentSnapshot', () => {
  it('is the only DTO that carries document content, and reports its byte length', () => {
    const dto = toPublicDocumentSnapshot(fullSnapshot('Estratégia\n'))

    expect(dto.contentText).toBe('Estratégia\n')
    expect(dto.contentLength).toBe(Buffer.byteLength('Estratégia\n', 'utf8'))
  })

  it('reports byte length, not character count, for multi-byte content', () => {
    const dto = toPublicDocumentSnapshot(fullSnapshot('✅'))

    expect(dto.contentLength).toBe(3)
  })

  it('handles an empty document', () => {
    const dto = toPublicDocumentSnapshot(fullSnapshot(''))

    expect(dto.contentText).toBe('')
    expect(dto.contentLength).toBe(0)
  })
})
