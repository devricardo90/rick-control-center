import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  composeNextWorkResolverState,
  resolveNextWorkFromPersistedState,
} from './next-work-resolver-state.js'
import { createTestClient, uniqueSlug } from './test-support.js'
import {
  addTaskDependency,
  createDocumentSource,
  createEpic,
  createProject,
  createSprint,
  createTask,
  recordDocumentSnapshotSync,
  transitionEpicStatus,
  transitionSprintStatus,
  transitionTaskStatus,
} from './index.js'

let client: PrismaClient

beforeAll(() => {
  client = createTestClient()
})

afterAll(async () => {
  await client.$disconnect()
})

async function seedActiveBacklog(prefix: string): Promise<{
  readonly projectId: string
  readonly sprintId: string
  readonly epicId: string
  readonly taskId: string
}> {
  const project = await createProject(client, {
    key: uniqueSlug(prefix).toUpperCase(),
    name: `${prefix} project`,
  })
  const sprint = await createSprint(client, {
    projectId: project.id,
    code: uniqueSlug('spr'),
    title: 'Active sprint',
    sequence: 0,
  })
  await transitionSprintStatus(client, project.id, sprint.id, 'ACTIVE')
  const epic = await createEpic(client, {
    projectId: project.id,
    sprintId: sprint.id,
    code: uniqueSlug('epi'),
    title: 'Active epic',
    sequence: 0,
  })
  await transitionEpicStatus(client, project.id, epic.id, 'ACTIVE')
  const task = await createTask(client, {
    projectId: project.id,
    sprintId: sprint.id,
    epicId: epic.id,
    code: uniqueSlug('tsk'),
    type: 'TASK',
    title: 'Candidate task',
    priority: 'P1',
    sequence: 0,
    acceptanceCriteria: ['Resolver selects this task'],
  })
  return { projectId: project.id, sprintId: sprint.id, epicId: epic.id, taskId: task.id }
}

async function seedSafeStrategicTruth(projectId: string): Promise<{
  readonly requirementId: string
  readonly decisionId: string
  readonly sourceId: string
  readonly snapshotId: string
}> {
  const source = await createDocumentSource(client, {
    projectId,
    provider: 'GOOGLE_DRIVE',
    externalFileId: uniqueSlug('file'),
    documentType: 'PRD',
    title: 'Approved strategy',
    url: 'https://docs.google.com/document/d/local-test',
    approvalStatus: 'APPROVED',
  })
  const contentText = 'REQ-1: Resolver behavior'
  const checksum = createHash('sha256').update(contentText).digest('hex')
  const synced = await recordDocumentSnapshotSync(client, {
    projectId,
    documentSourceId: source.id,
    providerVersion: '1',
    contentText,
    checksum,
    providerModifiedAt: null,
    syncedAt: new Date(),
  })
  const requirement = await client.requirement.create({
    data: {
      projectId,
      code: uniqueSlug('req').toUpperCase(),
      title: 'Resolver behavior',
      description: 'Resolver behavior',
      type: 'FUNCTIONAL',
      priority: 'P0',
      status: 'ACTIVE',
      documentSourceId: source.id,
      sourceSnapshotId: synced.snapshot.id,
      extractorVersion: 'p0-022-v1',
      sourceLocatorJson: { kind: 'REQUIREMENT', sectionKey: 'requirements', lineStart: 1, lineEnd: 1, ordinal: 1 },
    },
  })
  const decision = await client.decision.create({
    data: {
      projectId,
      code: uniqueSlug('dec').toUpperCase(),
      title: 'Approved behavior',
      chosenDecision: 'Use deterministic selection',
      status: 'APPROVED',
      documentSourceId: source.id,
      sourceSnapshotId: synced.snapshot.id,
      extractorVersion: 'p0-022-v1',
      sourceLocatorJson: { kind: 'DECISION', sectionKey: 'decisions', lineStart: 1, lineEnd: 1, ordinal: 1 },
    },
  })
  return { requirementId: requirement.id, decisionId: decision.id, sourceId: source.id, snapshotId: synced.snapshot.id }
}

function contextFor(
  taskId: string,
  truth?: Readonly<{ requirementId: string, decisionId: string, sourceId: string }>,
) {
  return {
    taskId,
    applicabilityEstablished: true,
    requirementIds: truth ? [truth.requirementId] : [],
    decisionIds: truth ? [truth.decisionId] : [],
    sourceIds: truth ? [truth.sourceId] : [],
  }
}

describe('persisted next-work resolver composition', () => {
  it('composes existing strategic/backlog persistence into a selected result', async () => {
    const backlog = await seedActiveBacklog('compose')
    const truth = await seedSafeStrategicTruth(backlog.projectId)
    const state = await composeNextWorkResolverState(client, {
      projectId: backlog.projectId,
      strategicContexts: [contextFor(backlog.taskId, truth)],
    })
    expect(state).toMatchObject({
      project: { id: backlog.projectId, status: 'ACTIVE' },
      sprints: [{ id: backlog.sprintId, status: 'ACTIVE' }],
      epics: [{ id: backlog.epicId, status: 'ACTIVE' }],
      tasks: [{ id: backlog.taskId, status: 'TODO' }],
      requirements: [{ id: truth.requirementId, projectId: backlog.projectId }],
      decisions: [{ id: truth.decisionId, projectId: backlog.projectId }],
      strategicSources: [{
        id: truth.sourceId,
        currentSnapshotId: truth.snapshotId,
        approvalStatus: 'APPROVED',
        syncStatus: 'SYNCED',
      }],
    })
    await expect(resolveNextWorkFromPersistedState(client, {
      projectId: backlog.projectId,
      strategicContexts: [contextFor(backlog.taskId, truth)],
    })).resolves.toMatchObject({
      kind: 'SELECTED',
      task: { id: backlog.taskId },
      epic: { id: backlog.epicId },
    })
  })
})

describe('persisted dependency composition', () => {
  it('composes a persisted cross-Sprint DONE prerequisite', async () => {
    const backlog = await seedActiveBacklog('dependency')
    const earlierSprint = await createSprint(client, {
      projectId: backlog.projectId,
      code: uniqueSlug('pre-spr'),
      title: 'Prerequisite sprint',
      sequence: 1,
    })
    const prerequisite = await createTask(client, {
      projectId: backlog.projectId,
      sprintId: earlierSprint.id,
      code: uniqueSlug('pre-task'),
      type: 'TASK',
      title: 'Prerequisite',
      priority: 'P0',
      sequence: 0,
      acceptanceCriteria: ['Completed'],
    })
    await transitionTaskStatus(client, backlog.projectId, prerequisite.id, 'IN_PROGRESS')
    await transitionTaskStatus(client, backlog.projectId, prerequisite.id, 'IN_REVIEW')
    await transitionTaskStatus(client, backlog.projectId, prerequisite.id, 'DONE')
    await addTaskDependency(client, backlog.projectId, {
      taskId: backlog.taskId,
      dependsOnTaskId: prerequisite.id,
    })
    const result = await resolveNextWorkFromPersistedState(client, {
      projectId: backlog.projectId,
      strategicContexts: [contextFor(backlog.taskId)],
    })
    expect(result).toMatchObject({
      kind: 'SELECTED',
      prerequisites: {
        count: 1,
        satisfiedCount: 1,
        items: [{ id: prerequisite.id, status: 'DONE' }],
      },
    })
  })
})

describe('persisted strategic isolation and currency', () => {
  it('isolates Project A from Project B and does not leak foreign context', async () => {
    const owner = await seedActiveBacklog('owner')
    const foreign = await seedActiveBacklog('foreign')
    const foreignTruth = await seedSafeStrategicTruth(foreign.projectId)
    const result = await resolveNextWorkFromPersistedState(client, {
      projectId: owner.projectId,
      strategicContexts: [contextFor(owner.taskId, foreignTruth)],
    })
    expect(result).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      reasons: ['STRATEGIC_TRUTH_UNSAFE', 'NO_ELIGIBLE_WORK'],
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(foreign.projectId)
    expect(serialized).not.toContain(foreignTruth.requirementId)
    expect(serialized).not.toContain(foreignTruth.decisionId)
    expect(serialized).not.toContain(foreignTruth.sourceId)
  })

  it('rejects provenance that is no longer current', async () => {
    const backlog = await seedActiveBacklog('current')
    const truth = await seedSafeStrategicTruth(backlog.projectId)
    const contentText = 'REQ-1: New current content'
    const checksum = createHash('sha256').update(contentText).digest('hex')
    await recordDocumentSnapshotSync(client, {
      projectId: backlog.projectId,
      documentSourceId: truth.sourceId,
      providerVersion: '2',
      contentText,
      checksum,
      providerModifiedAt: null,
      syncedAt: new Date(),
    })
    await expect(resolveNextWorkFromPersistedState(client, {
      projectId: backlog.projectId,
      strategicContexts: [contextFor(backlog.taskId, truth)],
    })).resolves.toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      reasons: ['STRATEGIC_TRUTH_UNSAFE', 'NO_ELIGIBLE_WORK'],
    })
  })
})

describe('persisted read-only and schema invariants', () => {
  it('is structurally repeatable and leaves every relevant row unchanged', async () => {
    const backlog = await seedActiveBacklog('readonly')
    const truth = await seedSafeStrategicTruth(backlog.projectId)
    const readRows = async () => client.$transaction([
      client.project.findMany({ where: { id: backlog.projectId } }),
      client.sprint.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
      client.epic.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
      client.task.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
      client.taskDependency.findMany({ where: { projectId: backlog.projectId } }),
      client.requirement.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
      client.decision.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
      client.documentSource.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
      client.documentSnapshot.findMany({ where: { projectId: backlog.projectId }, orderBy: { id: 'asc' } }),
    ])
    const before = await readRows()
    const input = {
      projectId: backlog.projectId,
      strategicContexts: [contextFor(backlog.taskId, truth)],
    }
    const first = await resolveNextWorkFromPersistedState(client, input)
    const second = await resolveNextWorkFromPersistedState(client, input)
    const after = await readRows()
    expect(second).toEqual(first)
    expect(after).toEqual(before)
  })

  it('uses the existing eight-migration schema without a new migration', async () => {
    const migrations = await client.$queryRaw<Array<{ migration_name: string, finished_at: Date | null }>>`
      SELECT migration_name, finished_at
        FROM _prisma_migrations
       ORDER BY migration_name
    `
    expect(migrations).toHaveLength(8)
    expect(migrations.every(migration => migration.finished_at !== null)).toBe(true)
    expect(migrations.map(migration => migration.migration_name)).not.toContain(
      '20260818000000_next_work_resolver',
    )
  })
})
