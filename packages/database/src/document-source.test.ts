/**
 * Integration tests for the DocumentSource persistence surface.
 *
 * Runs against a real, disposable local PostgreSQL instance — uniqueness
 * constraints, foreign-key integrity and deterministic ordering are
 * database-enforced behavior a mock cannot prove. No test in this file
 * accesses any external network — DocumentSource here is pure persistence,
 * there is no Google Drive adapter in NDERCC-12.
 *
 * NDERCC-12 / DEC-RIC-002: strategic document source foundation.
 */
import type { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ArchivedProjectReadOnlyError,
  DocumentSourceNotFoundError,
  DuplicateDocumentSourceError,
  InvalidDocumentSourceInputError,
  ProjectNotFoundError,
} from './errors.js'
import {
  createDocumentSource,
  findDocumentSourceForProject,
  listDocumentSourcesForProject,
  markDocumentSourceSyncError,
  markDocumentSourceSyncStale,
  recordDocumentSourceSyncSuccess,
  updateDocumentSourceRegistry,
} from './document-source.js'
import { createProject, transitionProjectLifecycle } from './project.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

const VALID_URL = 'https://drive.google.com/file/d/abc123/view'
const VALID_CHECKSUM = 'a'.repeat(64)

async function createActiveProject(prefix: string, name: string) {
  return createProject(client, { key: uniqueSlug(prefix), name })
}

function baseSourceInput(projectId: string, overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    provider: 'GOOGLE_DRIVE' as const,
    externalFileId: uniqueSlug('file'),
    documentType: 'BACKLOG' as const,
    title: 'Backlog',
    url: VALID_URL,
    ...overrides,
  }
}

describe('createDocumentSource — defaults and document types', () => {
  it('defaults to approvalStatus DRAFT, syncStatus PENDING and lastSyncedAt null', async () => {
    const project = await createActiveProject('proj-ds-defaults', 'Defaults Owner')

    const source = await createDocumentSource(client, baseSourceInput(project.id))

    expect(source.approvalStatus).toBe('DRAFT')
    expect(source.syncStatus).toBe('PENDING')
    expect(source.lastSyncedAt).toBeNull()
    expect(source.checksum).toBeNull()
    expect(source.revision).toBeNull()
  })

  it('persists and round-trips every approved document type', async () => {
    const project = await createActiveProject('proj-ds-types', 'Types Owner')
    const documentTypes = [
      'VISION', 'PRD', 'ARCHITECTURE', 'ROADMAP', 'DESIGN_SYSTEM', 'DATA_MODEL',
      'STATE_MACHINE', 'RISK_ENGINE', 'MVP', 'BACKLOG', 'EXECUTION_CONTRACT_SPEC', 'DEVELOPMENT_PROTOCOL',
    ] as const

    for (const documentType of documentTypes) {
      const source = await createDocumentSource(client, baseSourceInput(project.id, { documentType }))
      expect(source.documentType).toBe(documentType)
    }
  })
})

describe('createDocumentSource — project state', () => {
  it('creates a source for an ACTIVE project', async () => {
    const project = await createActiveProject('proj-ds-active', 'Active Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    expect(source.projectId).toBe(project.id)
  })

  it('creates a source for a PAUSED project', async () => {
    const project = await createActiveProject('proj-ds-paused', 'Paused Owner')
    await transitionProjectLifecycle(client, project.id, 'PAUSE')

    const source = await createDocumentSource(client, baseSourceInput(project.id))
    expect(source.projectId).toBe(project.id)
  })

  it('rejects creation for an ARCHIVED project', async () => {
    const project = await createActiveProject('proj-ds-archived', 'Archived Owner')
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(createDocumentSource(client, baseSourceInput(project.id)))
      .rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })

  it('rejects creation for an unknown project', async () => {
    await expect(
      createDocumentSource(client, baseSourceInput('00000000-0000-0000-0000-000000000000')),
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })
})

describe('createDocumentSource — uniqueness and multiplicity', () => {
  it('rejects a duplicate (project, provider, externalFileId)', async () => {
    const project = await createActiveProject('proj-ds-dup', 'Duplicate Owner')
    const externalFileId = uniqueSlug('shared-file')

    await createDocumentSource(client, baseSourceInput(project.id, { externalFileId }))

    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { externalFileId, title: 'Different title' })),
    ).rejects.toBeInstanceOf(DuplicateDocumentSourceError)
  })

  it('allows the same external file id in different projects', async () => {
    const projectA = await createActiveProject('proj-ds-cross-a', 'A')
    const projectB = await createActiveProject('proj-ds-cross-b', 'B')
    const externalFileId = uniqueSlug('cross-project-file')

    const sourceA = await createDocumentSource(client, baseSourceInput(projectA.id, { externalFileId }))
    const sourceB = await createDocumentSource(client, baseSourceInput(projectB.id, { externalFileId }))

    expect(sourceA.id).not.toBe(sourceB.id)
  })

  it('allows multiple sources of the same document type in one project', async () => {
    const project = await createActiveProject('proj-ds-multi-type', 'Multi Type Owner')

    await createDocumentSource(client, baseSourceInput(project.id, { title: 'Backlog draft A' }))
    await createDocumentSource(client, baseSourceInput(project.id, { title: 'Backlog draft B' }))

    const sources = await listDocumentSourcesForProject(client, project.id)
    expect(sources.filter(s => s.documentType === 'BACKLOG')).toHaveLength(2)
  })
})

describe('createDocumentSource — field validation', () => {
  it('rejects an empty externalFileId', async () => {
    const project = await createActiveProject('proj-ds-empty-file', 'Owner')
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { externalFileId: '   ' })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('rejects an empty title', async () => {
    const project = await createActiveProject('proj-ds-empty-title', 'Owner')
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { title: '' })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it.each([
    ['http:', 'http://drive.google.com/file/d/abc/view'],
    ['relative', '/file/d/abc/view'],
    ['embedded credentials', 'https://user:pass@drive.google.com/file/d/abc/view'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/plain;base64,abc'],
  ])('rejects an unsafe url (%s)', async (_label, url) => {
    const project = await createActiveProject('proj-ds-bad-url', 'Owner')
    await expect(createDocumentSource(client, baseSourceInput(project.id, { url })))
      .rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('accepts a valid absolute https url', async () => {
    const project = await createActiveProject('proj-ds-good-url', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id, { url: VALID_URL }))
    expect(source.url).toBe(VALID_URL)
  })

  it('rejects a malformed checksum and accepts a valid one', async () => {
    const project = await createActiveProject('proj-ds-checksum', 'Owner')

    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { checksum: 'not-a-checksum' })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { checksum: 'ABCDEF'.repeat(10) + 'abcd' })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)

    const source = await createDocumentSource(client, baseSourceInput(project.id, { checksum: VALID_CHECKSUM }))
    expect(source.checksum).toBe(VALID_CHECKSUM)
  })

  it('trims and stores a valid revision, and rejects an empty one', async () => {
    const project = await createActiveProject('proj-ds-revision', 'Owner')

    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { revision: '   ' })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)

    const source = await createDocumentSource(client, baseSourceInput(project.id, { revision: '  v1  ' }))
    expect(source.revision).toBe('v1')
  })
})

describe('createDocumentSource — metadata safety', () => {
  it('rejects an array or primitive metadataJson', async () => {
    const project = await createActiveProject('proj-ds-meta-shape', 'Owner')

    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson: ['not', 'an', 'object'] })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson: 'a string' })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('accepts a plain metadata object with no credential-shaped keys', async () => {
    const project = await createActiveProject('proj-ds-meta-ok', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id, {
      metadataJson: { mimeType: 'application/vnd.google-apps.document', owners: ['someone@example.com'] },
    }))
    expect(source.metadataJson).toEqual({ mimeType: 'application/vnd.google-apps.document', owners: ['someone@example.com'] })
  })

  it('accepts a legitimate array and a deeply nested legitimate JSON object', async () => {
    const project = await createActiveProject('proj-ds-meta-deep-ok', 'Owner')
    const metadataJson = {
      mimeType: 'application/vnd.google-apps.document',
      owners: ['a@example.com', 'b@example.com'],
      revisionInfo: {
        publishedAt: '2026-08-06T00:00:00.000Z',
        author: { name: 'Someone', id: '12345' },
        tags: ['strategic', { label: 'reviewed', count: 3 }],
      },
    }
    const source = await createDocumentSource(client, baseSourceInput(project.id, { metadataJson }))
    expect(source.metadataJson).toEqual(metadataJson)
  })

  it.each([
    ['token'],
    ['accessToken'],
    ['refreshToken'],
    ['Authorization'],
    ['cookie'],
    ['password'],
    ['secret'],
    ['clientSecret'],
    ['credential'],
    ['credentials'],
    ['apiKey'],
  ])('rejects metadata containing a top-level %s key', async (key) => {
    const project = await createActiveProject('proj-ds-meta-secret', 'Owner')
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson: { [key]: 'x' } })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('recursively rejects a nested credential-shaped key', async () => {
    const project = await createActiveProject('proj-ds-meta-nested', 'Owner')
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, {
        metadataJson: { owner: { name: 'someone', apiKey: 'x' } },
      })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })
})

describe('createDocumentSource — metadata content/body/payload boundary (NDERCC-12 corrective, comment 11522)', () => {
  it.each([
    ['content', { content: 'full document body' }],
    ['body', { body: 'full document body' }],
    ['headers', { headers: { etag: 'x' } }],
    ['rawResponse', { rawResponse: { id: '123' } }],
    ['payload', { payload: { document: '...' } }],
    ['nested documentContent', { nested: { documentContent: '...' } }],
  ])('rejects metadata shaped like a document body or raw provider transport (%s)', async (_label, metadataJson) => {
    const project = await createActiveProject('proj-ds-meta-content', 'Owner')
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('rejects every content/body/payload/response/headers variant listed in the corrective review', async () => {
    const project = await createActiveProject('proj-ds-meta-content-variants', 'Owner')
    const variants = [
      'documentContent', 'documentBody', 'fullText', 'rawText',
      'rawPayload', 'response', 'providerResponse', 'responseBody',
      'httpHeaders', 'requestHeaders', 'responseHeaders',
    ]

    for (const key of variants) {
      await expect(
        createDocumentSource(client, baseSourceInput(project.id, { metadataJson: { [key]: 'x' } })),
      ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
    }
  })
})

describe('createDocumentSource — metadata non-JSON runtime value rejection (NDERCC-12 corrective, comment 11522)', () => {
  class CustomThing {
    label = 'x'
  }

  it.each([
    ['Date instance', { when: new Date() }],
    ['Map instance', { lookup: new Map([['a', 1]]) }],
    ['Set instance', { tags: new Set(['a', 'b']) }],
    ['bigint', { big: BigInt(1) }],
    ['function', { fn: () => 'x' }],
    ['symbol', { sym: Symbol('x') }],
    ['nested undefined', { nested: { value: undefined } }],
    ['NaN', { value: Number.NaN }],
    ['Infinity', { value: Number.POSITIVE_INFINITY }],
    ['negative Infinity', { value: Number.NEGATIVE_INFINITY }],
    ['class instance', { thing: new CustomThing() }],
    ['object with custom prototype', { thing: Object.create({ inherited: true }) as Record<string, unknown> }],
  ])('rejects metadata containing a %s', async (_label, metadataJson) => {
    const project = await createActiveProject('proj-ds-meta-nonjson', 'Owner')
    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('rejects a cyclic metadata object without stack overflow', async () => {
    const project = await createActiveProject('proj-ds-meta-cycle', 'Owner')
    const cyclic: Record<string, unknown> = { name: 'cycle' }
    cyclic['self'] = cyclic

    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson: cyclic })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('rejects a cycle introduced deeper in the structure (not just at the root)', async () => {
    const project = await createActiveProject('proj-ds-meta-cycle-deep', 'Owner')
    const inner: Record<string, unknown> = { label: 'inner' }
    const outer: Record<string, unknown> = { inner }
    inner['backToOuter'] = outer

    await expect(
      createDocumentSource(client, baseSourceInput(project.id, { metadataJson: outer })),
    ).rejects.toBeInstanceOf(InvalidDocumentSourceInputError)
  })

  it('does not falsely flag a repeated (non-cyclic) shared reference', async () => {
    const project = await createActiveProject('proj-ds-meta-shared-ref', 'Owner')
    const shared = { label: 'shared but not cyclic' }
    const metadataJson = { a: shared, b: shared }

    const source = await createDocumentSource(client, baseSourceInput(project.id, { metadataJson }))
    expect(source.metadataJson).toEqual({ a: shared, b: shared })
  })
})

describe('findDocumentSourceForProject and listDocumentSourcesForProject', () => {
  it('finds a source scoped to its owning project and returns null across projects', async () => {
    const projectA = await createActiveProject('proj-ds-find-a', 'A')
    const projectB = await createActiveProject('proj-ds-find-b', 'B')
    const source = await createDocumentSource(client, baseSourceInput(projectA.id))

    expect((await findDocumentSourceForProject(client, projectA.id, source.id))?.id).toBe(source.id)
    expect(await findDocumentSourceForProject(client, projectB.id, source.id)).toBeNull()
    expect(await findDocumentSourceForProject(client, projectA.id, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('lists only sources owned by the requested project', async () => {
    const projectA = await createActiveProject('proj-ds-list-a', 'A')
    const projectB = await createActiveProject('proj-ds-list-b', 'B')
    await createDocumentSource(client, baseSourceInput(projectA.id))
    await createDocumentSource(client, baseSourceInput(projectB.id))

    const sourcesForA = await listDocumentSourcesForProject(client, projectA.id)
    expect(sourcesForA).toHaveLength(1)
    expect(sourcesForA[0]?.projectId).toBe(projectA.id)
  })

  it('rejects find and list for an unknown project (NDERCC-12 corrective, comment 11522)', async () => {
    const unknownProjectId = '00000000-0000-0000-0000-000000000000'

    await expect(findDocumentSourceForProject(client, unknownProjectId, unknownProjectId))
      .rejects.toBeInstanceOf(ProjectNotFoundError)
    await expect(listDocumentSourcesForProject(client, unknownProjectId))
      .rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('returns [] for an existing project with no sources', async () => {
    const project = await createActiveProject('proj-ds-list-empty', 'Empty Owner')
    expect(await listDocumentSourcesForProject(client, project.id)).toEqual([])
  })

  it('allows find and list reads for an archived project', async () => {
    const project = await createActiveProject('proj-ds-read-archived', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    expect((await findDocumentSourceForProject(client, project.id, source.id))?.id).toBe(source.id)
    expect(await listDocumentSourcesForProject(client, project.id)).toHaveLength(1)
  })

  it('orders results by documentType, then title, then createdAt, then id', async () => {
    const project = await createActiveProject('proj-ds-order', 'Order Owner')

    await createDocumentSource(client, baseSourceInput(project.id, { documentType: 'ROADMAP', title: 'B Roadmap' }))
    await createDocumentSource(client, baseSourceInput(project.id, { documentType: 'ROADMAP', title: 'A Roadmap' }))
    await createDocumentSource(client, baseSourceInput(project.id, { documentType: 'ARCHITECTURE', title: 'Z Architecture' }))

    const sources = await listDocumentSourcesForProject(client, project.id)
    const shape = sources.map(s => [s.documentType, s.title])

    expect(shape).toEqual([
      ['ARCHITECTURE', 'Z Architecture'],
      ['ROADMAP', 'A Roadmap'],
      ['ROADMAP', 'B Roadmap'],
    ])
  })
})

describe('updateDocumentSourceRegistry', () => {
  it('updates title, url, documentType and approvalStatus without changing provenance identifiers', async () => {
    const project = await createActiveProject('proj-ds-update', 'Update Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))

    const updated = await updateDocumentSourceRegistry(client, project.id, source.id, {
      title: 'Renamed',
      url: 'https://drive.google.com/file/d/renamed/view',
      documentType: 'PRD',
      approvalStatus: 'APPROVED',
    })

    expect(updated.id).toBe(source.id)
    expect(updated.projectId).toBe(source.projectId)
    expect(updated.provider).toBe(source.provider)
    expect(updated.externalFileId).toBe(source.externalFileId)
    expect(updated.title).toBe('Renamed')
    expect(updated.documentType).toBe('PRD')
    expect(updated.approvalStatus).toBe('APPROVED')
  })

  it('sets and explicitly clears revision', async () => {
    const project = await createActiveProject('proj-ds-update-revision', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id, { revision: 'v1' }))

    const cleared = await updateDocumentSourceRegistry(client, project.id, source.id, { revision: null })
    expect(cleared.revision).toBeNull()

    const restored = await updateDocumentSourceRegistry(client, project.id, source.id, { revision: 'v2' })
    expect(restored.revision).toBe('v2')
  })

  it('rejects update for an archived project and for an unknown source', async () => {
    const project = await createActiveProject('proj-ds-update-archived', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(updateDocumentSourceRegistry(client, project.id, source.id, { title: 'X' }))
      .rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })

  it('rejects update for a source that belongs to a different project (isolation)', async () => {
    const projectA = await createActiveProject('proj-ds-update-iso-a', 'A')
    const projectB = await createActiveProject('proj-ds-update-iso-b', 'B')
    const source = await createDocumentSource(client, baseSourceInput(projectA.id))

    await expect(updateDocumentSourceRegistry(client, projectB.id, source.id, { title: 'X' }))
      .rejects.toBeInstanceOf(DocumentSourceNotFoundError)
  })
})

describe('recordDocumentSourceSyncSuccess', () => {
  it('atomically advances revision, checksum, metadata, lastSyncedAt and sets SYNCED', async () => {
    const project = await createActiveProject('proj-ds-sync-success', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    const syncedAt = new Date('2026-01-01T00:00:00.000Z')

    const synced = await recordDocumentSourceSyncSuccess(client, project.id, source.id, {
      revision: 'rev-1',
      checksum: VALID_CHECKSUM,
      metadataJson: { mimeType: 'application/vnd.google-apps.document' },
      syncedAt,
    })

    expect(synced.syncStatus).toBe('SYNCED')
    expect(synced.revision).toBe('rev-1')
    expect(synced.checksum).toBe(VALID_CHECKSUM)
    expect(synced.metadataJson).toEqual({ mimeType: 'application/vnd.google-apps.document' })
    expect(synced.lastSyncedAt?.getTime()).toBe(syncedAt.getTime())
  })

  it('rejects sync success for an archived project', async () => {
    const project = await createActiveProject('proj-ds-sync-archived', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(
      recordDocumentSourceSyncSuccess(client, project.id, source.id, { syncedAt: new Date() }),
    ).rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })
})

describe('markDocumentSourceSyncStale and markDocumentSourceSyncError', () => {
  it('STALE preserves the last synchronized values', async () => {
    const project = await createActiveProject('proj-ds-stale', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    const syncedAt = new Date('2026-01-01T00:00:00.000Z')
    const synced = await recordDocumentSourceSyncSuccess(client, project.id, source.id, {
      revision: 'rev-1',
      checksum: VALID_CHECKSUM,
      syncedAt,
    })

    const stale = await markDocumentSourceSyncStale(client, project.id, source.id)

    expect(stale.syncStatus).toBe('STALE')
    expect(stale.revision).toBe(synced.revision)
    expect(stale.checksum).toBe(synced.checksum)
    expect(stale.lastSyncedAt?.getTime()).toBe(syncedAt.getTime())
  })

  it('ERROR preserves revision, checksum, metadata and lastSyncedAt from the last successful sync', async () => {
    const project = await createActiveProject('proj-ds-error', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    const syncedAt = new Date('2026-01-01T00:00:00.000Z')
    await recordDocumentSourceSyncSuccess(client, project.id, source.id, {
      revision: 'rev-1',
      checksum: VALID_CHECKSUM,
      metadataJson: { mimeType: 'application/vnd.google-apps.document' },
      syncedAt,
    })

    const errored = await markDocumentSourceSyncError(client, project.id, source.id)

    expect(errored.syncStatus).toBe('ERROR')
    expect(errored.revision).toBe('rev-1')
    expect(errored.checksum).toBe(VALID_CHECKSUM)
    expect(errored.metadataJson).toEqual({ mimeType: 'application/vnd.google-apps.document' })
    expect(errored.lastSyncedAt?.getTime()).toBe(syncedAt.getTime())
  })

  it('rejects stale/error marking for an archived project and for an unknown source', async () => {
    const project = await createActiveProject('proj-ds-sync-state-archived', 'Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(markDocumentSourceSyncStale(client, project.id, source.id))
      .rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
    await expect(markDocumentSourceSyncError(client, project.id, source.id))
      .rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)

    const otherProject = await createActiveProject('proj-ds-sync-state-missing', 'Owner')
    await expect(
      markDocumentSourceSyncStale(client, otherProject.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(DocumentSourceNotFoundError)
  })
})

describe('typed errors do not leak raw Prisma or SQL details', () => {
  it('DuplicateDocumentSourceError and DocumentSourceNotFoundError messages contain no Prisma/SQL text', async () => {
    const project = await createActiveProject('proj-ds-error-shape', 'Owner')
    const externalFileId = uniqueSlug('dup-file')
    await createDocumentSource(client, baseSourceInput(project.id, { externalFileId }))

    try {
      await createDocumentSource(client, baseSourceInput(project.id, { externalFileId }))
      expect.unreachable('expected DuplicateDocumentSourceError to be thrown')
    }
    catch (err: unknown) {
      expect(err).toBeInstanceOf(DuplicateDocumentSourceError)
      const message = (err as Error).message
      expect(message).not.toMatch(/prisma/i)
      expect(message).not.toMatch(/SELECT|INSERT|UPDATE|constraint/i)
    }
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Deterministically races a concurrent project archival (which locks the
 * project row first and holds it) against a `mutate` operation issued on a
 * second, independent PrismaClient connection. Proves the archival and the
 * mutation cannot interleave: `mutate` either completes before the archive
 * transaction's `SELECT ... FOR UPDATE` runs, or blocks until the archive
 * commits and then observes ARCHIVED. This helper only exercises the
 * second path (archive locks first), which is what NDERCC-12 corrective
 * review comment `11522` requires a regression test for.
 *
 * Returns the error `mutate` rejected with (or `undefined` if it resolved).
 */
async function raceArchiveAgainstMutation(
  projectId: string,
  mutate: (raceClient: PrismaClient) => Promise<unknown>,
): Promise<unknown> {
  const archiverClient = createTestClient()
  const mutatorClient = createTestClient()

  try {
    let signalLockAcquired: () => void = () => {}
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve
    })
    let signalReleaseArchive: () => void = () => {}
    const releaseGate = new Promise<void>((resolve) => {
      signalReleaseArchive = resolve
    })

    const archiveTx = archiverClient.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id, status FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`
      signalLockAcquired()
      await releaseGate
      return tx.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED', archivedAt: new Date() } })
    })

    await lockAcquired
    const mutationPromise = mutate(mutatorClient)
    // Attach a handler synchronously so Node doesn't report a transient
    // "unhandledRejection" while this promise sits unawaited during the
    // sleep/lock-release below — the real assertion happens further down,
    // via the try/await on this same promise.
    mutationPromise.catch(() => {})
    await sleep(50)
    signalReleaseArchive()
    await archiveTx

    let caughtError: unknown
    try {
      await mutationPromise
    }
    catch (err: unknown) {
      caughtError = err
    }
    return caughtError
  }
  finally {
    await archiverClient.$disconnect()
    await mutatorClient.$disconnect()
  }
}

describe('concurrent archival vs mutation (NDERCC-12 corrective, comment 11522)', () => {
  it('an archive that locks the project row first blocks and wins against a concurrent create', async () => {
    const project = await createActiveProject('proj-ds-race-create', 'Race Owner')

    const error = await raceArchiveAgainstMutation(
      project.id,
      raceClient => createDocumentSource(raceClient, baseSourceInput(project.id)),
    )

    expect(error).toBeInstanceOf(ArchivedProjectReadOnlyError)
    expect(await listDocumentSourcesForProject(client, project.id)).toHaveLength(0)
  })

  it('an archive that locks the project row first blocks and wins against a concurrent registry update', async () => {
    const project = await createActiveProject('proj-ds-race-update', 'Race Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))

    const error = await raceArchiveAgainstMutation(
      project.id,
      raceClient => updateDocumentSourceRegistry(raceClient, project.id, source.id, { title: 'Should not apply' }),
    )

    expect(error).toBeInstanceOf(ArchivedProjectReadOnlyError)
    const reloaded = await findDocumentSourceForProject(client, project.id, source.id)
    expect(reloaded?.title).toBe(source.title)
  })

  it('an archive that locks the project row first blocks and wins against a concurrent sync success', async () => {
    const project = await createActiveProject('proj-ds-race-sync', 'Race Owner')
    const source = await createDocumentSource(client, baseSourceInput(project.id))

    const error = await raceArchiveAgainstMutation(
      project.id,
      raceClient => recordDocumentSourceSyncSuccess(raceClient, project.id, source.id, { syncedAt: new Date() }),
    )

    expect(error).toBeInstanceOf(ArchivedProjectReadOnlyError)
    const reloaded = await findDocumentSourceForProject(client, project.id, source.id)
    expect(reloaded?.syncStatus).toBe('PENDING')
    expect(reloaded?.lastSyncedAt).toBeNull()
  })
})
