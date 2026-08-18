/**
 * Read-only persisted-state composition for P0-031. Applicability is supplied
 * explicitly by the caller; this module never infers Task-to-strategic links.
 */
import type { Epic, PrismaClient, Sprint, Task, TaskDependency } from '@prisma/client'
import {
  NEXT_WORK_RESOLVER_VERSION,
  resolveNextWork,
} from '@rick/domain'
import type {
  CandidateStrategicContextInput,
  NextWorkResolverInput,
  NextWorkResolverResult,
  ResolverDecisionInput,
  ResolverRequirementInput,
  ResolverStrategicSourceInput,
} from '@rick/domain'
import { ProjectNotFoundError } from './errors.js'

export interface PersistedNextWorkResolverInput {
  readonly projectId: string
  readonly strategicContexts: readonly CandidateStrategicContextInput[]
}

function referencedIds(
  contexts: readonly CandidateStrategicContextInput[],
  key: 'requirementIds' | 'decisionIds' | 'sourceIds',
): string[] {
  const ids = new Set<string>()
  for (const context of contexts) {
    const value = context[key]
    if (!Array.isArray(value)) continue
    for (const id of value) {
      if (typeof id === 'string') ids.add(id)
    }
  }
  return [...ids].sort()
}

function mapRequirements(rows: readonly Readonly<{
  id: string
  projectId: string
  status: string
  documentSourceId: string
  sourceSnapshotId: string
}>[]): ResolverRequirementInput[] {
  return rows.map(row => ({
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    documentSourceId: row.documentSourceId,
    sourceSnapshotId: row.sourceSnapshotId,
  }))
}

function mapDecisions(rows: readonly Readonly<{
  id: string
  projectId: string
  status: string
  documentSourceId: string
  sourceSnapshotId: string
}>[]): ResolverDecisionInput[] {
  return rows.map(row => ({
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    documentSourceId: row.documentSourceId,
    sourceSnapshotId: row.sourceSnapshotId,
  }))
}

interface SnapshotPointer {
  readonly id: string
  readonly providerVersion: string
  readonly checksum: string
}

async function loadLatestSnapshotsBySource(
  client: PrismaClient,
  projectId: string,
  sourceIds: readonly string[],
): Promise<ReadonlyMap<string, SnapshotPointer>> {
  const rows = await Promise.all(sourceIds.map(async (documentSourceId) => {
    const snapshot = await client.documentSnapshot.findFirst({
      where: { projectId, documentSourceId },
      select: {
        id: true,
        providerVersion: true,
        checksum: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return snapshot ? { documentSourceId, snapshot } : null
  }))

  const pointers = new Map<string, SnapshotPointer>()
  for (const row of rows) {
    if (row) pointers.set(row.documentSourceId, row.snapshot)
  }
  return pointers
}

function mapSources(rows: readonly Readonly<{
  id: string
  projectId: string
  approvalStatus: string
  syncStatus: string
  revision: string | null
  checksum: string | null
}>[], pointers: ReadonlyMap<string, SnapshotPointer>): ResolverStrategicSourceInput[] {
  return rows.map((row) => {
    const pointer = pointers.get(row.id)
    return {
      id: row.id,
      projectId: row.projectId,
      approvalStatus: row.approvalStatus,
      syncStatus: row.syncStatus,
      revision: row.revision,
      checksum: row.checksum,
      currentSnapshotId: pointer?.id,
      currentSnapshotProviderVersion: pointer?.providerVersion,
      currentSnapshotChecksum: pointer?.checksum,
    }
  })
}

function mapSprints(sprints: readonly Sprint[]) {
  return sprints.map(sprint => ({
    id: sprint.id, projectId: sprint.projectId, code: sprint.code,
    sequence: sprint.sequence, status: sprint.status, archivedAt: sprint.archivedAt,
  }))
}

function mapEpics(epics: readonly Epic[]) {
  return epics.map(epic => ({
    id: epic.id, projectId: epic.projectId, sprintId: epic.sprintId,
    code: epic.code, status: epic.status, archivedAt: epic.archivedAt,
  }))
}

function mapTasks(tasks: readonly Task[]) {
  return tasks.map(task => ({
    id: task.id, projectId: task.projectId, sprintId: task.sprintId, epicId: task.epicId,
    code: task.code, priority: task.priority, sequence: task.sequence, status: task.status,
    acceptanceCriteria: task.acceptanceCriteriaJson, archivedAt: task.archivedAt,
  }))
}

function mapDependencies(dependencies: readonly TaskDependency[]) {
  return dependencies.map(edge => ({
    projectId: edge.projectId, taskId: edge.taskId, dependsOnTaskId: edge.dependsOnTaskId,
  }))
}

export async function composeNextWorkResolverState(
  client: PrismaClient,
  input: PersistedNextWorkResolverInput,
): Promise<NextWorkResolverInput> {
  const project = await client.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, status: true },
  })
  if (!project) throw new ProjectNotFoundError(input.projectId)

  const requirementIds = referencedIds(input.strategicContexts, 'requirementIds')
  const decisionIds = referencedIds(input.strategicContexts, 'decisionIds')
  const sourceIds = referencedIds(input.strategicContexts, 'sourceIds')
  const [sprints, epics, tasks, dependencies, requirements, decisions, sources, snapshotsBySource] = await Promise.all([
    client.sprint.findMany({ where: { projectId: input.projectId } }),
    client.epic.findMany({ where: { projectId: input.projectId } }),
    client.task.findMany({ where: { projectId: input.projectId } }),
    client.taskDependency.findMany({ where: { projectId: input.projectId } }),
    client.requirement.findMany({ where: { projectId: input.projectId, id: { in: requirementIds } } }),
    client.decision.findMany({ where: { projectId: input.projectId, id: { in: decisionIds } } }),
    client.documentSource.findMany({ where: { projectId: input.projectId, id: { in: sourceIds } } }),
    loadLatestSnapshotsBySource(client, input.projectId, sourceIds),
  ])
  return {
    projectId: input.projectId,
    resolverVersion: NEXT_WORK_RESOLVER_VERSION,
    project,
    sprints: mapSprints(sprints),
    epics: mapEpics(epics),
    tasks: mapTasks(tasks),
    dependencies: mapDependencies(dependencies),
    requirements: mapRequirements(requirements),
    decisions: mapDecisions(decisions),
    strategicSources: mapSources(sources, snapshotsBySource),
    strategicContexts: input.strategicContexts,
  }
}

export async function resolveNextWorkFromPersistedState(
  client: PrismaClient,
  input: PersistedNextWorkResolverInput,
): Promise<NextWorkResolverResult> {
  return resolveNextWork(await composeNextWorkResolverState(client, input))
}
