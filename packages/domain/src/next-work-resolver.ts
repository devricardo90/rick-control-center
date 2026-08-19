/**
 * Pure P0-031 next-work selection. The input is deliberately permissive at
 * record fields so callers can pass persisted or decoded state without a
 * type assertion turning malformed deterministic data into eligible work.
 */
import {
  isDependencySatisfiedBy,
  normalizeBacklogCode,
  TASK_PRIORITY_RANK,
  validateAcceptanceCriteria,
  validateSequence,
} from './operational-backlog.js'
import type { TaskPriority, TaskStatus } from './operational-backlog.js'
import {
  diagnoseReadiness,
  isReadinessDiagnosticBlockingTask,
  READINESS_DIAGNOSTICS_VERSION,
} from './readiness-diagnostics.js'
import type { ReadinessDiagnostic } from './readiness-diagnostics.js'

export const NEXT_WORK_RESOLVER_VERSION = 'P0_031_V1' as const

export const NoEligibleWorkReason = {
  PROJECT_NOT_ACTIVE: 'PROJECT_NOT_ACTIVE',
  STRATEGIC_TRUTH_UNSAFE: 'STRATEGIC_TRUTH_UNSAFE',
  NO_ELIGIBLE_WORK: 'NO_ELIGIBLE_WORK',
} as const
export type NoEligibleWorkReason = typeof NoEligibleWorkReason[keyof typeof NoEligibleWorkReason]

interface ProjectStateInput {
  readonly id?: unknown
  readonly status?: unknown
}

export interface ResolverSprintInput {
  readonly id?: unknown
  readonly projectId?: unknown
  readonly code?: unknown
  readonly sequence?: unknown
  readonly status?: unknown
  readonly archivedAt?: unknown
}

export interface ResolverEpicInput {
  readonly id?: unknown
  readonly projectId?: unknown
  readonly sprintId?: unknown
  readonly code?: unknown
  readonly status?: unknown
  readonly archivedAt?: unknown
}

export interface ResolverTaskInput {
  readonly id?: unknown
  readonly projectId?: unknown
  readonly sprintId?: unknown
  readonly epicId?: unknown
  readonly code?: unknown
  readonly priority?: unknown
  readonly sequence?: unknown
  readonly status?: unknown
  readonly acceptanceCriteria?: unknown
  readonly archivedAt?: unknown
}

export interface ResolverDependencyInput {
  readonly projectId?: unknown
  readonly taskId?: unknown
  readonly dependsOnTaskId?: unknown
}

export interface ResolverRequirementInput {
  readonly id?: unknown
  readonly projectId?: unknown
  readonly status?: unknown
  readonly documentSourceId?: unknown
  readonly sourceSnapshotId?: unknown
}

export interface ResolverDecisionInput extends ResolverRequirementInput {
  readonly code?: unknown
  readonly chosenDecision?: unknown
  readonly supersedesDecisionId?: unknown
}

export interface ResolverStrategicSourceInput {
  readonly id?: unknown
  readonly projectId?: unknown
  readonly approvalStatus?: unknown
  readonly syncStatus?: unknown
  readonly revision?: unknown
  readonly checksum?: unknown
  readonly currentSnapshotId?: unknown
  readonly currentSnapshotProviderVersion?: unknown
  readonly currentSnapshotChecksum?: unknown
}

export interface CandidateStrategicContextInput {
  readonly taskId?: unknown
  readonly applicabilityEstablished?: unknown
  readonly requirementIds?: unknown
  readonly decisionIds?: unknown
  readonly sourceIds?: unknown
}

export interface NextWorkResolverInput {
  readonly projectId: string
  readonly resolverVersion: unknown
  readonly project: ProjectStateInput
  readonly sprints: readonly ResolverSprintInput[]
  readonly epics: readonly ResolverEpicInput[]
  readonly tasks: readonly ResolverTaskInput[]
  readonly dependencies: readonly ResolverDependencyInput[]
  readonly requirements: readonly ResolverRequirementInput[]
  readonly decisions: readonly ResolverDecisionInput[]
  readonly strategicSources: readonly ResolverStrategicSourceInput[]
  readonly strategicContexts: readonly CandidateStrategicContextInput[]
}

export type NextWorkRankingTuple = readonly [number, number, number, string, string]

export interface SelectedNextWorkResult {
  readonly kind: 'SELECTED'
  readonly projectId: string
  readonly resolverVersion: typeof NEXT_WORK_RESOLVER_VERSION
  readonly diagnosticsVersion: typeof READINESS_DIAGNOSTICS_VERSION
  readonly diagnostics: readonly ReadinessDiagnostic[]
  readonly task: Readonly<{ id: string, code: string, priority: TaskPriority, sequence: number }>
  readonly sprint: Readonly<{ id: string, code: string, sequence: number }>
  readonly epic: Readonly<{ id: string, code: string }> | null
  readonly ranking: NextWorkRankingTuple
  readonly prerequisites: Readonly<{
    count: number
    satisfiedCount: number
    items: readonly Readonly<{ id: string, status: TaskStatus }>[]
  }>
  readonly strategicContext: Readonly<{
    applicabilityEstablished: true
    safe: true
    requirementIds: readonly string[]
    decisions: readonly Readonly<{ id: string, status: 'APPROVED' | 'REJECTED' }>[]
    sources: readonly Readonly<{
      id: string
      approvalStatus: 'APPROVED'
      syncStatus: 'SYNCED'
      currentSnapshotId: string
    }>[]
  }>
}

export interface NoEligibleWorkResult {
  readonly kind: 'NO_ELIGIBLE_WORK'
  readonly projectId: string
  readonly resolverVersion: typeof NEXT_WORK_RESOLVER_VERSION
  readonly diagnosticsVersion: typeof READINESS_DIAGNOSTICS_VERSION
  readonly diagnostics: readonly ReadinessDiagnostic[]
  readonly reasons: readonly NoEligibleWorkReason[]
  readonly evidence: Readonly<{
    evaluatedTaskCount: number
    invalidCandidateCount: number
    operationallyIneligibleCount: number
    strategicTruthUnsafeCount: number
    consideredTaskIds: readonly string[]
    strategicTruthUnsafeTaskIds: readonly string[]
  }>
}

export type NextWorkResolverResult = SelectedNextWorkResult | NoEligibleWorkResult

interface ValidTask {
  readonly id: string
  readonly code: string
  readonly priority: TaskPriority
  readonly sequence: number
  readonly sprint: { readonly id: string, readonly code: string, readonly sequence: number }
  readonly epic: { readonly id: string, readonly code: string } | null
  readonly ranking: NextWorkRankingTuple
  readonly prerequisites: SelectedNextWorkResult['prerequisites']
}

interface StrategicEvidence {
  readonly applicabilityEstablished: true
  readonly safe: true
  readonly requirementIds: readonly string[]
  readonly decisions: readonly Readonly<{ id: string, status: 'APPROVED' | 'REJECTED' }>[]
  readonly sources: readonly Readonly<{
    id: string
    approvalStatus: 'APPROVED'
    syncStatus: 'SYNCED'
    currentSnapshotId: string
  }>[]
}

interface EvaluationSummary {
  readonly eligible: readonly Readonly<{ task: ValidTask, strategicContext: StrategicEvidence }>[]
  readonly consideredTaskIds: readonly string[]
  readonly strategicTruthUnsafeTaskIds: readonly string[]
  readonly invalidCandidateCount: number
  readonly operationallyIneligibleCount: number
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isCanonicalCode(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const normalized = normalizeBacklogCode(value)
  return normalized.ok && normalized.value === value
}

function validSequence(value: unknown): value is number {
  return typeof value === 'number' && validateSequence(value).ok
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && Object.hasOwn(TASK_PRIORITY_RANK, value)
}

function findUniqueById<T extends { readonly id?: unknown }>(records: readonly T[], id: string): T | null {
  const matches = records.filter(record => record.id === id)
  return matches.length === 1 ? matches[0] ?? null : null
}

function readStringIdArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || !value.every(isIdentifier)) return null
  const unique = new Set(value)
  return unique.size === value.length ? [...value].sort() : null
}

function validAcceptanceCriteria(value: unknown): boolean {
  const validated = validateAcceptanceCriteria(value)
  return validated.ok && validated.value.length > 0
}

function buildPrerequisiteEvidence(
  input: NextWorkResolverInput,
  taskId: string,
): SelectedNextWorkResult['prerequisites'] | null {
  const edges = input.dependencies.filter(edge => edge.taskId === taskId)
  const items: Array<{ id: string, status: TaskStatus }> = []
  const seen = new Set<string>()

  for (const edge of edges) {
    if (edge.projectId !== input.projectId || !isIdentifier(edge.dependsOnTaskId)) return null
    if (seen.has(edge.dependsOnTaskId)) return null
    const prerequisite = findUniqueById(input.tasks, edge.dependsOnTaskId)
    if (!prerequisite || prerequisite.projectId !== input.projectId) return null
    if (!isIdentifier(prerequisite.id) || !isTaskStatus(prerequisite.status)) return null
    seen.add(prerequisite.id)
    items.push({ id: prerequisite.id, status: prerequisite.status })
  }

  items.sort((left, right) => left.id === right.id ? 0 : left.id < right.id ? -1 : 1)
  const satisfiedCount = items.filter(item => isDependencySatisfiedBy(item.status)).length
  return { count: items.length, satisfiedCount, items }
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'TODO' || value === 'IN_PROGRESS' || value === 'IN_REVIEW'
    || value === 'DONE' || value === 'CANCELLED'
}

function hasValidTaskIdentity(input: NextWorkResolverInput, task: ResolverTaskInput): task is ResolverTaskInput & {
  readonly id: string
  readonly projectId: string
  readonly sprintId: string
} {
  if (!isIdentifier(task.id) || task.projectId !== input.projectId) return false
  if (!isIdentifier(task.sprintId)) return false
  return findUniqueById(input.tasks, task.id) === task
}

function hasValidTaskRanking(task: ResolverTaskInput): task is ResolverTaskInput & {
  readonly code: string
  readonly priority: TaskPriority
  readonly sequence: number
} {
  if (!isCanonicalCode(task.code) || !isTaskPriority(task.priority)) return false
  return validSequence(task.sequence)
}

function resolveSprint(input: NextWorkResolverInput, sprintId: string): ResolverSprintInput & {
  readonly id: string
  readonly code: string
  readonly sequence: number
} | null {
  const sprint = findUniqueById(input.sprints, sprintId)
  if (!sprint || sprint.projectId !== input.projectId) return null
  if (!isIdentifier(sprint.id) || !isCanonicalCode(sprint.code)) return null
  if (!validSequence(sprint.sequence)) return null
  return { ...sprint, id: sprint.id, code: sprint.code, sequence: sprint.sequence }
}

function isOperationallyEligible(
  task: ResolverTaskInput,
  sprint: ResolverSprintInput,
  epicIneligible: boolean,
  prerequisites: SelectedNextWorkResult['prerequisites'],
): boolean {
  if (task.status !== 'TODO' || task.archivedAt !== null) return false
  if (sprint.status !== 'ACTIVE' || sprint.archivedAt !== null) return false
  if (epicIneligible || !validAcceptanceCriteria(task.acceptanceCriteria)) return false
  return prerequisites.satisfiedCount === prerequisites.count
}

function validateOperationalCandidate(
  input: NextWorkResolverInput,
  task: ResolverTaskInput,
): { readonly state: 'INVALID' }
  | { readonly state: 'INELIGIBLE' }
  | { readonly state: 'VALID', readonly task: ValidTask } {
  if (!hasValidTaskIdentity(input, task)) return { state: 'INVALID' }
  if (!hasValidTaskRanking(task)) return { state: 'INVALID' }
  const sprint = resolveSprint(input, task.sprintId)
  if (!sprint) return { state: 'INVALID' }
  const epicResult = resolveEpic(input, task, sprint.id)
  if (epicResult.state === 'INVALID') return epicResult
  const prerequisites = buildPrerequisiteEvidence(input, task.id)
  if (!prerequisites) return { state: 'INVALID' }
  if (!isOperationallyEligible(task, sprint, epicResult.ineligible, prerequisites)) {
    return { state: 'INELIGIBLE' }
  }
  const ranking: NextWorkRankingTuple = [
    sprint.sequence,
    TASK_PRIORITY_RANK[task.priority],
    task.sequence,
    task.code,
    task.id,
  ]
  return {
    state: 'VALID',
    task: {
      id: task.id,
      code: task.code,
      priority: task.priority,
      sequence: task.sequence,
      sprint: { id: sprint.id, code: sprint.code, sequence: sprint.sequence },
      epic: epicResult.epic,
      ranking,
      prerequisites,
    },
  }
}

function resolveEpic(
  input: NextWorkResolverInput,
  task: ResolverTaskInput,
  sprintId: string,
): { readonly state: 'INVALID' } | {
  readonly state: 'VALID'
  readonly epic: { readonly id: string, readonly code: string } | null
  readonly ineligible: boolean
} {
  if (task.epicId === null || task.epicId === undefined) {
    return { state: 'VALID', epic: null, ineligible: false }
  }
  if (!isIdentifier(task.epicId)) return { state: 'INVALID' }
  const epic = findUniqueById(input.epics, task.epicId)
  if (!epic || epic.projectId !== input.projectId || epic.sprintId !== sprintId
    || !isIdentifier(epic.id) || !isCanonicalCode(epic.code)) return { state: 'INVALID' }
  return {
    state: 'VALID',
    epic: { id: epic.id, code: epic.code },
    ineligible: epic.status !== 'ACTIVE' || epic.archivedAt !== null,
  }
}

function isSafeSource(
  input: NextWorkResolverInput,
  sourceId: string,
): ResolverStrategicSourceInput | null {
  const source = findUniqueById(input.strategicSources, sourceId)
  if (!source || source.projectId !== input.projectId) return null
  if (source.approvalStatus !== 'APPROVED' || source.syncStatus !== 'SYNCED') return null
  if (!hasCompleteSourcePointer(source) || !sourcePointerMatches(source)) return null
  return source
}

function hasCompleteSourcePointer(source: ResolverStrategicSourceInput): boolean {
  if (!isIdentifier(source.currentSnapshotId) || !isIdentifier(source.revision)) return false
  if (!isIdentifier(source.checksum) || !isIdentifier(source.currentSnapshotProviderVersion)) return false
  return isIdentifier(source.currentSnapshotChecksum)
}

function sourcePointerMatches(source: ResolverStrategicSourceInput): boolean {
  return source.revision === source.currentSnapshotProviderVersion
    && source.checksum === source.currentSnapshotChecksum
}

function factHasSafeProvenance(
  input: NextWorkResolverInput,
  fact: ResolverRequirementInput,
  sourceIds: readonly string[],
): boolean {
  if (fact.projectId !== input.projectId || !isIdentifier(fact.documentSourceId)
    || !isIdentifier(fact.sourceSnapshotId) || !sourceIds.includes(fact.documentSourceId)) return false
  const source = isSafeSource(input, fact.documentSourceId)
  return source?.currentSnapshotId === fact.sourceSnapshotId
}

function evaluateStrategicContext(
  input: NextWorkResolverInput,
  taskId: string,
): StrategicEvidence | null {
  const contexts = input.strategicContexts.filter(context => context.taskId === taskId)
  const context = contexts.length === 1 ? contexts[0] : undefined
  if (!context || context.applicabilityEstablished !== true) return null
  const requirementIds = readStringIdArray(context.requirementIds)
  const decisionIds = readStringIdArray(context.decisionIds)
  const sourceIds = readStringIdArray(context.sourceIds)
  if (!requirementIds || !decisionIds || !sourceIds) return null
  const requirements = requirementIds.map(id => findUniqueById(input.requirements, id))
  if (requirements.some(record => !record || record.status !== 'ACTIVE'
    || !factHasSafeProvenance(input, record, sourceIds))) return null
  const decisions = decisionIds.map(id => findUniqueById(input.decisions, id))
  if (decisions.some(record => !record || (record.status !== 'APPROVED' && record.status !== 'REJECTED')
    || !factHasSafeProvenance(input, record, sourceIds))) return null
  const sources = sourceIds.map(id => isSafeSource(input, id))
  if (sources.some(source => !source)) return null
  return {
    applicabilityEstablished: true,
    safe: true,
    requirementIds,
    decisions: decisions.map((record, index) => ({
      id: decisionIds[index] ?? '',
      status: record?.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    })),
    sources: sources.map((source, index) => ({
      id: sourceIds[index] ?? '',
      approvalStatus: 'APPROVED',
      syncStatus: 'SYNCED',
      currentSnapshotId: typeof source?.currentSnapshotId === 'string' ? source.currentSnapshotId : '',
    })),
  }
}

function compareRanking(left: NextWorkRankingTuple, right: NextWorkRankingTuple): number {
  const sprintOrder = left[0] - right[0]
  if (sprintOrder !== 0) return sprintOrder
  const priorityOrder = left[1] - right[1]
  if (priorityOrder !== 0) return priorityOrder
  const sequenceOrder = left[2] - right[2]
  if (sequenceOrder !== 0) return sequenceOrder
  if (left[3] !== right[3]) return left[3] < right[3] ? -1 : 1
  if (left[4] !== right[4]) return left[4] < right[4] ? -1 : 1
  return 0
}

function evaluateCandidates(
  input: NextWorkResolverInput,
  diagnostics: readonly ReadinessDiagnostic[],
): EvaluationSummary {
  const eligible: Array<{ task: ValidTask, strategicContext: StrategicEvidence }> = []
  const consideredTaskIds: string[] = []
  const strategicTruthUnsafeTaskIds: string[] = []
  let invalidCandidateCount = 0
  let operationallyIneligibleCount = 0

  for (const task of input.tasks) {
    if (task.projectId !== input.projectId) continue
    if (isIdentifier(task.id)) consideredTaskIds.push(task.id)
    const operational = validateOperationalCandidate(input, task)
    if (operational.state === 'INVALID') {
      invalidCandidateCount += 1
      continue
    }
    if (operational.state === 'INELIGIBLE') {
      operationallyIneligibleCount += 1
      continue
    }
    const strategicContext = evaluateStrategicContext(input, operational.task.id)
    if (!strategicContext) {
      strategicTruthUnsafeTaskIds.push(operational.task.id)
      continue
    }
    if (diagnostics.some(diagnostic => isReadinessDiagnosticBlockingTask(input, task, diagnostic))) {
      invalidCandidateCount += 1
      continue
    }
    eligible.push({ task: operational.task, strategicContext })
  }
  return {
    eligible,
    consideredTaskIds: [...new Set(consideredTaskIds)].sort(),
    strategicTruthUnsafeTaskIds: [...new Set(strategicTruthUnsafeTaskIds)].sort(),
    invalidCandidateCount,
    operationallyIneligibleCount,
  }
}

function noEligibleResult(
  input: NextWorkResolverInput,
  reasons: readonly NoEligibleWorkReason[],
  summary: EvaluationSummary,
  diagnostics: readonly ReadinessDiagnostic[],
): NoEligibleWorkResult {
  return {
    kind: 'NO_ELIGIBLE_WORK',
    projectId: input.projectId,
    resolverVersion: NEXT_WORK_RESOLVER_VERSION,
    diagnosticsVersion: READINESS_DIAGNOSTICS_VERSION,
    diagnostics,
    reasons,
    evidence: {
      evaluatedTaskCount: summary.consideredTaskIds.length,
      invalidCandidateCount: summary.invalidCandidateCount,
      operationallyIneligibleCount: summary.operationallyIneligibleCount,
      strategicTruthUnsafeCount: summary.strategicTruthUnsafeTaskIds.length,
      consideredTaskIds: summary.consideredTaskIds,
      strategicTruthUnsafeTaskIds: summary.strategicTruthUnsafeTaskIds,
    },
  }
}

export function resolveNextWork(input: NextWorkResolverInput): NextWorkResolverResult {
  const diagnostics = diagnoseReadiness(input)
  if (!isIdentifier(input.projectId) || input.project?.id !== input.projectId
    || input.project?.status !== 'ACTIVE') {
    return noEligibleResult(input, [NoEligibleWorkReason.PROJECT_NOT_ACTIVE], {
      eligible: [],
      consideredTaskIds: [],
      strategicTruthUnsafeTaskIds: [],
      invalidCandidateCount: 0,
      operationallyIneligibleCount: 0,
    }, diagnostics)
  }
  if (input.resolverVersion !== NEXT_WORK_RESOLVER_VERSION) {
    return noEligibleResult(input, [NoEligibleWorkReason.NO_ELIGIBLE_WORK], {
      eligible: [],
      consideredTaskIds: [],
      strategicTruthUnsafeTaskIds: [],
      invalidCandidateCount: input.tasks.filter(task => task.projectId === input.projectId).length,
      operationallyIneligibleCount: 0,
    }, diagnostics)
  }
  const summary = evaluateCandidates(input, diagnostics)
  const selected = [...summary.eligible].sort((left, right) => (
    compareRanking(left.task.ranking, right.task.ranking)
  ))[0]
  if (!selected) {
    const reasons: NoEligibleWorkReason[] = []
    if (summary.strategicTruthUnsafeTaskIds.length > 0) {
      reasons.push(NoEligibleWorkReason.STRATEGIC_TRUTH_UNSAFE)
    }
    reasons.push(NoEligibleWorkReason.NO_ELIGIBLE_WORK)
    return noEligibleResult(input, reasons, summary, diagnostics)
  }
  return {
    kind: 'SELECTED',
    projectId: input.projectId,
    resolverVersion: NEXT_WORK_RESOLVER_VERSION,
    diagnosticsVersion: READINESS_DIAGNOSTICS_VERSION,
    diagnostics,
    task: {
      id: selected.task.id,
      code: selected.task.code,
      priority: selected.task.priority,
      sequence: selected.task.sequence,
    },
    sprint: selected.task.sprint,
    epic: selected.task.epic,
    ranking: selected.task.ranking,
    prerequisites: selected.task.prerequisites,
    strategicContext: selected.strategicContext,
  }
}
