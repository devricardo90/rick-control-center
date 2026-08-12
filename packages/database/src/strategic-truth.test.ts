/**
 * Integrated persistence tests for NDERCC-16 / P0-022.
 *
 * These tests use only project-owned immutable snapshots. They deliberately
 * do not call a provider or accept a credential-shaped input.
 */
import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { createDocumentSource } from './document-source.js'
import { recordDocumentSnapshotSync } from './document-snapshot.js'
import {
  ArchivedProjectReadOnlyError,
  DocumentSourceNotFoundError,
  StrategicTruthSourceNotEligibleError,
} from './errors.js'
import {
  extractStrategicTruth,
  findCurrentDecisionByCode,
  findCurrentRequirementByCode,
  listCurrentDecisionsByProject,
  listCurrentRequirementsByProject,
} from './strategic-truth.js'
import { createProject, transitionProjectLifecycle } from './project.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client: PrismaClient = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

function checksumOf(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
}

async function createFixture(prefix: string) {
  const project = await createProject(client, { key: uniqueSlug(prefix), name: `${prefix} project` })
  const source = await createDocumentSource(client, {
    projectId: project.id,
    provider: 'GOOGLE_DRIVE',
    externalFileId: uniqueSlug(`${prefix}-file`),
    documentType: 'PRD',
    title: `${prefix} strategic source`,
    url: 'https://docs.google.com/document/d/ndercc16/edit',
    approvalStatus: 'APPROVED',
  })
  return { project, source }
}

async function syncSnapshot(
  projectId: string,
  documentSourceId: string,
  contentText: string,
  providerVersion: string,
) {
  return recordDocumentSnapshotSync(client, {
    projectId,
    documentSourceId,
    providerVersion,
    contentText,
    checksum: checksumOf(contentText),
    providerModifiedAt: new Date('2026-08-11T00:00:00.000Z'),
    syncedAt: new Date(),
  })
}

const initialSource = [
  '# Strategic source',
  'REQ-001: [P0] The operator can inspect the project.',
  'NFR-002: Priority: P1 The extraction is deterministic.',
  '',
  '## Constraints',
  '- The extractor must not call external providers.',
  '',
  '## DEC-RIC-004 — Deterministic extraction',
  '- Status: APPROVED',
  '- Decision: Use deterministic parsing only.',
  '- Consequences: Missing truth remains unresolved.',
].join('\n')

describe('strategic truth creation', () => {
  it('persists explicit requirements, synthetic constraints and canonical decisions', async () => {
    const { project, source } = await createFixture('truth-create')
    const synced = await syncSnapshot(project.id, source.id, initialSource, '1')

    const result = await extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: synced.snapshot.id,
    })

    expect(result.committed).toBe(true)
    expect(result.counts).toMatchObject({ created: 4, updated: 0, superseded: 0, reused: 0 })
    expect(result.diagnostics).toEqual([])
    expect(await listCurrentRequirementsByProject(client, project.id)).toHaveLength(3)
    expect(await listCurrentDecisionsByProject(client, project.id)).toHaveLength(1)

    const requirement = await findCurrentRequirementByCode(client, project.id, 'REQ-001')
    expect(requirement).toMatchObject({
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: synced.snapshot.id,
      priority: 'P0',
      type: 'FUNCTIONAL',
      status: 'ACTIVE',
      extractorVersion: 'p0-022-v1',
    })
    expect(requirement?.sourceLocator).toMatchObject({ kind: 'REQUIREMENT' })

    const decision = await findCurrentDecisionByCode(client, project.id, 'DEC-RIC-004')
    expect(decision).toMatchObject({
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: synced.snapshot.id,
      status: 'APPROVED',
      chosenDecision: 'Use deterministic parsing only.',
    })
  })
})

describe('strategic truth idempotency and reconciliation', () => {
  it('is idempotent on an unchanged snapshot and then reconciles a newer valid snapshot', async () => {
    const { project, source } = await createFixture('truth-reconcile')
    const first = await syncSnapshot(project.id, source.id, initialSource, '1')
    const firstRun = await extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: first.snapshot.id,
    })
    const repeat = await extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: first.snapshot.id,
    })
    expect(firstRun.counts.created).toBe(4)
    expect(repeat.committed).toBe(true)
    expect(repeat.counts).toMatchObject({ created: 0, updated: 0, superseded: 0, reused: 4 })

    const newerText = [
      '# Strategic source',
      'REQ-001: [P1] The operator can inspect the project in detail.',
      '',
      '## Constraints',
      '- The extractor must not call external providers.',
    ].join('\n')
    const newer = await syncSnapshot(project.id, source.id, newerText, '2')
    const updated = await extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: newer.snapshot.id,
    })

    expect(updated.committed).toBe(true)
    expect(updated.counts.updated).toBe(2)
    expect(updated.counts.superseded).toBe(1)
    expect(await findCurrentRequirementByCode(client, project.id, 'REQ-001')).toMatchObject({
      priority: 'P1',
      sourceSnapshotId: newer.snapshot.id,
    })
    expect(await findCurrentDecisionByCode(client, project.id, 'DEC-RIC-004')).toMatchObject({
      sourceSnapshotId: first.snapshot.id,
    })
  })
})

describe('strategic truth invalid candidate safety', () => {
  it('does not change previous truth when a newer snapshot is malformed', async () => {
    const { project, source } = await createFixture('truth-invalid')
    const first = await syncSnapshot(project.id, source.id, initialSource, '1')
    await extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: first.snapshot.id,
    })
    const malformed = await syncSnapshot(project.id, source.id, '## DEC-RIC-004\n- Status: APPROVED', '2')
    const result = await extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: malformed.snapshot.id,
    })

    expect(result.committed).toBe(false)
    expect(result.diagnostics.some(item => item.code === 'AMBIGUOUS_DECISION')).toBe(true)
    expect(await findCurrentRequirementByCode(client, project.id, 'REQ-001')).toMatchObject({
      sourceSnapshotId: first.snapshot.id,
      priority: 'P0',
    })
    expect(await findCurrentDecisionByCode(client, project.id, 'DEC-RIC-004')).toMatchObject({
      sourceSnapshotId: first.snapshot.id,
    })
  })
})

describe('strategic truth source isolation', () => {
  it('rejects cross-source code conflicts without overwriting the original owner', async () => {
    const first = await createFixture('truth-conflict-a')
    const firstSnapshot = await syncSnapshot(first.project.id, first.source.id, initialSource, '1')
    await extractStrategicTruth(client, {
      projectId: first.project.id,
      documentSourceId: first.source.id,
      sourceSnapshotId: firstSnapshot.snapshot.id,
    })

    const secondSource = await createDocumentSource(client, {
      projectId: first.project.id,
      provider: 'GOOGLE_DRIVE',
      externalFileId: uniqueSlug('truth-conflict-b-file'),
      documentType: 'PRD',
      title: 'Second strategic source',
      url: 'https://docs.google.com/document/d/ndercc16-second/edit',
      approvalStatus: 'APPROVED',
    })
    const secondSnapshot = await syncSnapshot(
      first.project.id,
      secondSource.id,
      'REQ-001: [P3] A conflicting source must not overwrite this code.',
      '1',
    )
    const result = await extractStrategicTruth(client, {
      projectId: first.project.id,
      documentSourceId: secondSource.id,
      sourceSnapshotId: secondSnapshot.snapshot.id,
    })

    expect(result.committed).toBe(false)
    expect(result.diagnostics.some(item => item.code === 'SOURCE_CONFLICT')).toBe(true)
    expect(await findCurrentRequirementByCode(client, first.project.id, 'REQ-001')).toMatchObject({
      documentSourceId: first.source.id,
      priority: 'P0',
    })
  })
})

describe('strategic truth project isolation', () => {
  it('preserves a disappeared decision as ambiguous prior truth and isolates projects', async () => {
    const first = await createFixture('truth-isolation-a')
    const initial = await syncSnapshot(first.project.id, first.source.id, initialSource, '1')
    await extractStrategicTruth(client, {
      projectId: first.project.id,
      documentSourceId: first.source.id,
      sourceSnapshotId: initial.snapshot.id,
    })
    const disappeared = await syncSnapshot(
      first.project.id,
      first.source.id,
      'REQ-001: [P0] The operator can inspect the project.',
      '2',
    )
    const result = await extractStrategicTruth(client, {
      projectId: first.project.id,
      documentSourceId: first.source.id,
      sourceSnapshotId: disappeared.snapshot.id,
    })
    expect(result.committed).toBe(true)
    expect(result.diagnostics.some(item => item.code === 'DECISION_DISAPPEARED_AMBIGUITY')).toBe(true)
    expect(await findCurrentDecisionByCode(client, first.project.id, 'DEC-RIC-004')).not.toBeNull()

    const second = await createFixture('truth-isolation-b')
    const secondText = 'REQ-001: [P2] This code is scoped to the second project.'
    const secondSnapshot = await syncSnapshot(second.project.id, second.source.id, secondText, '1')
    await extractStrategicTruth(client, {
      projectId: second.project.id,
      documentSourceId: second.source.id,
      sourceSnapshotId: secondSnapshot.snapshot.id,
    })
    expect(await findCurrentRequirementByCode(client, first.project.id, 'REQ-001')).toMatchObject({ priority: 'P0' })
    expect(await findCurrentRequirementByCode(client, second.project.id, 'REQ-001')).toMatchObject({ priority: 'P2' })
    await expect(extractStrategicTruth(client, {
      projectId: second.project.id,
      documentSourceId: first.source.id,
      sourceSnapshotId: initial.snapshot.id,
    })).rejects.toBeInstanceOf(DocumentSourceNotFoundError)
  })
})

describe('strategic truth lifecycle boundary', () => {
  it('rejects stale and archived extraction inputs', async () => {
    const { project, source } = await createFixture('truth-boundary')
    const first = await syncSnapshot(project.id, source.id, initialSource, '1')
    const second = await syncSnapshot(project.id, source.id, initialSource, '2')
    await expect(extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: first.snapshot.id,
    })).rejects.toBeInstanceOf(StrategicTruthSourceNotEligibleError)
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')
    await expect(extractStrategicTruth(client, {
      projectId: project.id,
      documentSourceId: source.id,
      sourceSnapshotId: second.snapshot.id,
    })).rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })
})
