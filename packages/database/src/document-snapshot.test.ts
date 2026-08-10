/**
 * Integration tests for the immutable DocumentSnapshot persistence
 * surface.
 *
 * Runs against a real, disposable local PostgreSQL instance — append-only
 * behavior, the unique-identity rule, the composite ownership foreign key,
 * `ON DELETE RESTRICT`, and the atomicity of "snapshot + source pointer"
 * are all database-enforced properties a mock cannot prove.
 *
 * No test in this file touches Google or the network: the adapter produces
 * `(providerVersion, contentText, checksum)` and this layer stores them,
 * so the persistence contract is fully testable offline.
 *
 * NDERCC-13 / DEC-RIC-003: Google Drive credential and snapshot boundary.
 */
import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { createDocumentSource } from './document-source.js'
import {
  findLatestDocumentSnapshot,
  listDocumentSnapshotsForSource,
  listLatestDocumentSnapshotsForProject,
  recordDocumentSnapshotSync,
} from './document-snapshot.js'
import {
  ArchivedProjectReadOnlyError,
  DocumentSourceNotFoundError,
  InvalidDocumentSnapshotInputError,
  InvalidDocumentSourceInputError,
  ProjectNotFoundError,
} from './errors.js'
import { createProject, transitionProjectLifecycle } from './project.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client: PrismaClient = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

function checksumOf(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

async function createActiveProject(prefix: string) {
  return createProject(client, { key: uniqueSlug(prefix), name: `${prefix} owner` })
}

async function createSource(projectId: string, documentType: 'PRD' | 'VISION' | 'BACKLOG' = 'PRD') {
  return createDocumentSource(client, {
    projectId,
    provider: 'GOOGLE_DRIVE',
    externalFileId: uniqueSlug('file'),
    documentType,
    title: 'Strategic document',
    url: 'https://docs.google.com/document/d/abc123/edit',
  })
}

function syncInput(projectId: string, documentSourceId: string, overrides: Partial<{
  providerVersion: string
  contentText: string
  checksum: string
  providerModifiedAt: Date | null
  syncedAt: Date
  metadataJson: unknown
}> = {}) {
  const contentText = overrides.contentText ?? 'Approved strategic content.\n'
  return {
    projectId,
    documentSourceId,
    providerVersion: overrides.providerVersion ?? '23',
    contentText,
    checksum: overrides.checksum ?? checksumOf(contentText),
    // `??` would swallow an explicit null, which is exactly the case this
    // helper needs to be able to express.
    providerModifiedAt: overrides.providerModifiedAt === undefined
      ? new Date('2026-07-29T19:07:34.313Z')
      : overrides.providerModifiedAt,
    syncedAt: overrides.syncedAt ?? new Date(),
    ...(overrides.metadataJson !== undefined ? { metadataJson: overrides.metadataJson } : {}),
  }
}

describe('recordDocumentSnapshotSync — successful synchronization', () => {
  it('persists the snapshot and atomically advances the source in one call', async () => {
    const project = await createActiveProject('snap-success')
    const source = await createSource(project.id)
    const syncedAt = new Date()

    const result = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, { syncedAt }))

    expect(result.created).toBe(true)
    expect(result.snapshot.providerVersion).toBe('23')
    expect(result.snapshot.contentText).toBe('Approved strategic content.\n')
    expect(result.snapshot.checksum).toBe(checksumOf('Approved strategic content.\n'))
    expect(result.snapshot.projectId).toBe(project.id)

    expect(result.source.syncStatus).toBe('SYNCED')
    expect(result.source.revision).toBe('23')
    expect(result.source.checksum).toBe(result.snapshot.checksum)
    expect(result.source.lastSyncedAt?.toISOString()).toBe(syncedAt.toISOString())
  })

  it('stores the provider modified timestamp, and accepts null when Drive omitted it', async () => {
    const project = await createActiveProject('snap-modified')
    const withTime = await createSource(project.id, 'PRD')
    const withoutTime = await createSource(project.id, 'VISION')

    const a = await recordDocumentSnapshotSync(client, syncInput(project.id, withTime.id))
    const b = await recordDocumentSnapshotSync(
      client,
      syncInput(project.id, withoutTime.id, { providerModifiedAt: null }),
    )

    expect(a.snapshot.providerModifiedAt?.toISOString()).toBe('2026-07-29T19:07:34.313Z')
    expect(b.snapshot.providerModifiedAt).toBeNull()
  })

  it('writes safe provider metadata onto the source', async () => {
    const project = await createActiveProject('snap-metadata')
    const source = await createSource(project.id)

    const result = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      metadataJson: { provider: 'GOOGLE_DRIVE', title: 'PRD', mimeType: 'application/vnd.google-apps.document' },
    }))

    expect(result.source.metadataJson).toEqual({
      provider: 'GOOGLE_DRIVE',
      title: 'PRD',
      mimeType: 'application/vnd.google-apps.document',
    })
  })

  it('rejects credential-shaped metadata through the shared DEC-RIC-002 scanner', async () => {
    const project = await createActiveProject('snap-meta-secret')
    const source = await createSource(project.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      metadataJson: { nested: { accessToken: 'leaked' } },
    }))).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('leaves no snapshot behind when metadata validation rejects the write', async () => {
    const project = await createActiveProject('snap-meta-atomic')
    const source = await createSource(project.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      metadataJson: { authorization: 'Bearer x' },
    }))).rejects.toThrow()

    expect(await findLatestDocumentSnapshot(client, project.id, source.id)).toBeNull()
  })
})

describe('recordDocumentSnapshotSync — checksum integrity', () => {
  it('rejects a checksum that does not match the content it is stored with', async () => {
    const project = await createActiveProject('snap-checksum-mismatch')
    const source = await createSource(project.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      contentText: 'real content',
      checksum: checksumOf('different content'),
    }))).rejects.toBeInstanceOf(InvalidDocumentSnapshotInputError)
  })

  it('rejects a malformed checksum before it reaches the database', async () => {
    const project = await createActiveProject('snap-checksum-shape')
    const source = await createSource(project.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id, { checksum: 'A'.repeat(64) })))
      .rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id, { checksum: 'abc' })))
      .rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('rejects an empty provider version', async () => {
    const project = await createActiveProject('snap-version-empty')
    const source = await createSource(project.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id, { providerVersion: '   ' })))
      .rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('accepts an empty document — an empty export is valid content, not an error', async () => {
    const project = await createActiveProject('snap-empty-doc')
    const source = await createSource(project.id)

    const result = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, { contentText: '' }))

    expect(result.snapshot.contentText).toBe('')
    expect(result.snapshot.checksum).toBe(checksumOf(''))
  })
})

describe('recordDocumentSnapshotSync — append-only and idempotency', () => {
  it('reuses the existing snapshot when the same version and content are re-synced', async () => {
    const project = await createActiveProject('snap-idempotent')
    const source = await createSource(project.id)

    const first = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))
    const second = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.snapshot.id).toBe(first.snapshot.id)
    expect(await listDocumentSnapshotsForSource(client, project.id, source.id)).toHaveLength(1)
  })

  it('still advances lastSyncedAt on a duplicate-safe re-sync', async () => {
    const project = await createActiveProject('snap-idempotent-time')
    const source = await createSource(project.id)
    const later = new Date(Date.now() + 60_000)

    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))
    const second = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, { syncedAt: later }))

    expect(second.created).toBe(false)
    expect(second.source.lastSyncedAt?.toISOString()).toBe(later.toISOString())
  })
})

describe('recordDocumentSnapshotSync — new versions append rather than overwrite', () => {
  it('appends a new immutable snapshot when the provider version advances', async () => {
    const project = await createActiveProject('snap-new-version')
    const source = await createSource(project.id)

    const first = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '23',
      contentText: 'v23 content',
    }))
    const second = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '24',
      contentText: 'v24 content',
    }))

    expect(second.created).toBe(true)
    expect(second.snapshot.id).not.toBe(first.snapshot.id)

    const history = await listDocumentSnapshotsForSource(client, project.id, source.id)
    expect(history).toHaveLength(2)
    expect(history[0]?.providerVersion).toBe('24')
    expect(history[1]?.providerVersion).toBe('23')
  })

  it('never mutates a previously stored snapshot when a newer one is appended', async () => {
    const project = await createActiveProject('snap-immutable')
    const source = await createSource(project.id)

    const first = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '1',
      contentText: 'original text',
    }))
    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '2',
      contentText: 'replacement text',
    }))

    const reloaded = await client.documentSnapshot.findUnique({ where: { id: first.snapshot.id } })

    expect(reloaded?.contentText).toBe('original text')
    expect(reloaded?.checksum).toBe(checksumOf('original text'))
    expect(reloaded?.createdAt.toISOString()).toBe(first.snapshot.createdAt.toISOString())
  })

  it('appends a distinct snapshot when content changes but the version number is reused', async () => {
    const project = await createActiveProject('snap-same-version')
    const source = await createSource(project.id)

    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '7',
      contentText: 'first',
    }))
    const second = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '7',
      contentText: 'second',
    }))

    expect(second.created).toBe(true)
    expect(await listDocumentSnapshotsForSource(client, project.id, source.id)).toHaveLength(2)
  })
})

describe('recordDocumentSnapshotSync — project lifecycle and isolation', () => {
  it('allows synchronization for a PAUSED project', async () => {
    const project = await createActiveProject('snap-paused')
    const source = await createSource(project.id)
    await transitionProjectLifecycle(client, project.id, 'PAUSE')

    const result = await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))

    expect(result.created).toBe(true)
  })

  it('rejects synchronization for an ARCHIVED project', async () => {
    const project = await createActiveProject('snap-archived')
    const source = await createSource(project.id)
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, source.id)))
      .rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })

  it('rejects an unknown project', async () => {
    const project = await createActiveProject('snap-unknown-project')
    const source = await createSource(project.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(UNKNOWN_UUID, source.id)))
      .rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('rejects an unknown source', async () => {
    const project = await createActiveProject('snap-unknown-source')

    await expect(recordDocumentSnapshotSync(client, syncInput(project.id, UNKNOWN_UUID)))
      .rejects.toBeInstanceOf(DocumentSourceNotFoundError)
  })

  it('treats a source owned by a different project as not found rather than syncing it', async () => {
    const owner = await createActiveProject('snap-owner')
    const intruder = await createActiveProject('snap-intruder')
    const source = await createSource(owner.id)

    await expect(recordDocumentSnapshotSync(client, syncInput(intruder.id, source.id)))
      .rejects.toBeInstanceOf(DocumentSourceNotFoundError)
  })

  it('rejects a cross-project snapshot row at the database level, not only in application code', async () => {
    const owner = await createActiveProject('snap-fk-owner')
    const intruder = await createActiveProject('snap-fk-intruder')
    const source = await createSource(owner.id)

    // Bypasses the typed surface deliberately: this proves the composite
    // foreign key blocks a mismatched (source, project) pair even when the
    // application-level check is skipped entirely.
    await expect(client.documentSnapshot.create({
      data: {
        projectId: intruder.id,
        documentSourceId: source.id,
        providerVersion: '1',
        contentText: 'smuggled',
        checksum: checksumOf('smuggled'),
        providerModifiedAt: null,
        syncedAt: new Date(),
      },
    })).rejects.toThrow()
  })
})

describe('document snapshot reads', () => {
  it('returns the newest snapshot for a source', async () => {
    const project = await createActiveProject('snap-latest')
    const source = await createSource(project.id)

    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '1',
      contentText: 'older',
    }))
    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
      providerVersion: '2',
      contentText: 'newer',
    }))

    const latest = await findLatestDocumentSnapshot(client, project.id, source.id)

    expect(latest?.providerVersion).toBe('2')
    expect(latest?.contentText).toBe('newer')
  })

  it('returns null for a source that has never synchronized', async () => {
    const project = await createActiveProject('snap-never')
    const source = await createSource(project.id)

    expect(await findLatestDocumentSnapshot(client, project.id, source.id)).toBeNull()
  })

  it('returns null for a source owned by a different project, without revealing that it exists', async () => {
    const owner = await createActiveProject('snap-read-owner')
    const intruder = await createActiveProject('snap-read-intruder')
    const source = await createSource(owner.id)
    await recordDocumentSnapshotSync(client, syncInput(owner.id, source.id))

    expect(await findLatestDocumentSnapshot(client, intruder.id, source.id)).toBeNull()
    expect(await findLatestDocumentSnapshot(client, intruder.id, UNKNOWN_UUID)).toBeNull()
  })

  it('rejects reads for an unknown project', async () => {
    await expect(findLatestDocumentSnapshot(client, UNKNOWN_UUID, UNKNOWN_UUID))
      .rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('allows reads for an archived project', async () => {
    const project = await createActiveProject('snap-read-archived')
    const source = await createSource(project.id)
    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    expect((await findLatestDocumentSnapshot(client, project.id, source.id))?.providerVersion).toBe('23')
  })
})

describe('document snapshot list reads', () => {
  it('lists exactly one newest snapshot per source, excluding document content', async () => {
    const project = await createActiveProject('snap-list-latest')
    const first = await createSource(project.id, 'PRD')
    const second = await createSource(project.id, 'VISION')
    const neverSynced = await createSource(project.id, 'BACKLOG')

    await recordDocumentSnapshotSync(client, syncInput(project.id, first.id, { providerVersion: '1', contentText: 'a' }))
    await recordDocumentSnapshotSync(client, syncInput(project.id, first.id, { providerVersion: '2', contentText: 'b' }))
    await recordDocumentSnapshotSync(client, syncInput(project.id, second.id, { providerVersion: '9', contentText: 'c' }))

    const latest = await listLatestDocumentSnapshotsForProject(client, project.id)
    const bySource = new Map(latest.map(snapshot => [snapshot.documentSourceId, snapshot]))

    expect(latest).toHaveLength(2)
    expect(bySource.get(first.id)?.providerVersion).toBe('2')
    expect(bySource.get(second.id)?.providerVersion).toBe('9')
    expect(bySource.has(neverSynced.id)).toBe(false)
    expect(Object.keys(latest[0] ?? {})).not.toContain('contentText')
  })

  it('lists a source history newest-first without document content', async () => {
    const project = await createActiveProject('snap-history')
    const source = await createSource(project.id)

    for (const version of ['1', '2', '3']) {
      await recordDocumentSnapshotSync(client, syncInput(project.id, source.id, {
        providerVersion: version,
        contentText: `content ${version}`,
      }))
    }

    const history = await listDocumentSnapshotsForSource(client, project.id, source.id)

    expect(history.map(snapshot => snapshot.providerVersion)).toEqual(['3', '2', '1'])
    expect(Object.keys(history[0] ?? {})).not.toContain('contentText')
  })
})

describe('snapshot provenance is never silently destroyed', () => {
  it('refuses to delete a source that has snapshots', async () => {
    const project = await createActiveProject('snap-restrict-source')
    const source = await createSource(project.id)
    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))

    await expect(client.documentSource.delete({ where: { id: source.id } })).rejects.toThrow()
  })

  it('refuses to delete a project that has snapshots', async () => {
    const project = await createActiveProject('snap-restrict-project')
    const source = await createSource(project.id)
    await recordDocumentSnapshotSync(client, syncInput(project.id, source.id))

    await expect(client.project.delete({ where: { id: project.id } })).rejects.toThrow()
  })
})
