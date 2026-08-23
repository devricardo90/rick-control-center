/**
 * P0-032 deterministic readiness diagnostics.
 *
 * This module is deliberately pure. It accepts the same normalized snapshot
 * as the P0-031 resolver and returns a closed, sanitized diagnostic union.
 * No persistence, provider, clock, randomness or environment access belongs
 * here.
 */
/* eslint-disable complexity, max-lines-per-function, max-params -- the frozen diagnostic taxonomy is evaluated as one deterministic pure rule set. */
import type {
  NextWorkResolverInput,
  ResolverDecisionInput,
  ResolverEpicInput,
  ResolverRequirementInput,
  ResolverSprintInput,
  ResolverStrategicSourceInput,
  ResolverTaskInput,
} from './next-work-resolver.js'
import {
  normalizeBacklogCode,
  TASK_PRIORITY_RANK,
  validateAcceptanceCriteria,
  validateSequence,
} from './operational-backlog.js'
import type { TaskPriority } from './operational-backlog.js'

export const READINESS_DIAGNOSTICS_VERSION = 'P0_032_V1' as const

export const ReadinessDiagnosticCode = {
  INVALID_PROJECT_STATE: 'INVALID_PROJECT_STATE',
  MISSING_REQUIRED_INPUT: 'MISSING_REQUIRED_INPUT',
  AMBIGUOUS_CANDIDATE_ORDERING: 'AMBIGUOUS_CANDIDATE_ORDERING',
  BLOCKED_DEPENDENCY: 'BLOCKED_DEPENDENCY',
  STALE_OR_UNAPPROVED_TRUTH: 'STALE_OR_UNAPPROVED_TRUTH',
  STRATEGIC_CONFLICT: 'STRATEGIC_CONFLICT',
} as const
export type ReadinessDiagnosticCode = typeof ReadinessDiagnosticCode[keyof typeof ReadinessDiagnosticCode]

export const ReadinessDiagnosticSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
} as const
export type ReadinessDiagnosticSeverity = typeof ReadinessDiagnosticSeverity[keyof typeof ReadinessDiagnosticSeverity]

export type ReadinessSubjectKind =
  | 'PROJECT'
  | 'SPRINT'
  | 'EPIC'
  | 'TASK'
  | 'STRATEGIC_SOURCE'
  | 'REQUIREMENT'
  | 'DECISION'

export interface ReadinessSubject {
  readonly kind: ReadinessSubjectKind
  readonly id: string
}

export type InvalidProjectEvidenceKey = 'PROJECT_RECORD' | 'PROJECT_IDENTITY' | 'PROJECT_STATUS'
export type MissingRequiredInputEvidenceKey =
  | 'SPRINT_REFERENCE'
  | 'EPIC_REFERENCE'
  | 'TASK_CODE'
  | 'TASK_PRIORITY'
  | 'TASK_SEQUENCE'
  | 'ACCEPTANCE_CRITERIA'
  | 'STRATEGIC_CONTEXT'
  | 'REQUIREMENT_REFERENCE'
  | 'DECISION_REFERENCE'
  | 'SOURCE_REFERENCE'
  | 'DEPENDENCY_REFERENCE'
  | 'TASK_IDENTITY'
export type AmbiguousCandidateOrderingEvidenceKey =
  | 'DUPLICATE_TASK_ID'
  | 'DUPLICATE_TASK_CODE'
  | 'DUPLICATE_SPRINT_SEQUENCE'
  | 'DUPLICATE_TASK_SEQUENCE'
  | 'MULTIPLE_STRATEGIC_CONTEXTS'
  | 'CONFLICTING_PARENTAGE'
export type StaleOrUnapprovedTruthEvidenceKey =
  | 'SOURCE_APPROVAL'
  | 'SOURCE_SYNC'
  | 'SOURCE_POINTER'
  | 'SOURCE_REVISION'
  | 'SOURCE_CHECKSUM'
  | 'FACT_SNAPSHOT'
export type StrategicConflictEvidenceKey =
  | 'DUPLICATE_DECISION_CODE'
  | 'MULTIPLE_APPROVED_SUCCESSORS'
  | 'ACTIVE_PREDECESSOR_AND_SUCCESSOR'
  | 'SUPERSESSION_CYCLE'

export type InvalidProjectEvidence =
  | { readonly key: 'PROJECT_RECORD', readonly invalidRecordCount: number }
  | { readonly key: 'PROJECT_IDENTITY' }
  | { readonly key: 'PROJECT_STATUS' }
export type MissingRequiredInputEvidence =
  | { readonly key: Exclude<MissingRequiredInputEvidenceKey, 'TASK_IDENTITY'> }
  | { readonly key: 'TASK_IDENTITY', readonly invalidRecordCount: number }
export type AmbiguousCandidateOrderingEvidence = {
  readonly key: AmbiguousCandidateOrderingEvidenceKey
  readonly relatedCount: number
}
export type BlockedDependencyEvidence = { readonly key: 'PREREQUISITES_NOT_DONE', readonly prerequisiteIds: readonly string[] }
export type StaleOrUnapprovedTruthEvidence = {
  readonly key: StaleOrUnapprovedTruthEvidenceKey
  readonly currentSnapshotId?: string
}
export type StrategicConflictEvidence = {
  readonly key: StrategicConflictEvidenceKey
  readonly decisionIds: readonly string[]
}

interface ReadinessDiagnosticBase<K extends ReadinessDiagnosticCode, EKey extends string, E> {
  readonly code: K
  readonly severity: 'ERROR'
  readonly projectId: string
  readonly subject: ReadinessSubject
  readonly relatedSubjects: readonly ReadinessSubject[]
  readonly evidenceKey: EKey
  readonly message: string
  readonly fingerprint: string
  readonly evidence: E
}

export type InvalidProjectStateDiagnostic = ReadinessDiagnosticBase<
  'INVALID_PROJECT_STATE', InvalidProjectEvidenceKey, InvalidProjectEvidence
>
export type MissingRequiredInputDiagnostic = ReadinessDiagnosticBase<
  'MISSING_REQUIRED_INPUT', MissingRequiredInputEvidenceKey, MissingRequiredInputEvidence
>
export type AmbiguousCandidateOrderingDiagnostic = ReadinessDiagnosticBase<
  'AMBIGUOUS_CANDIDATE_ORDERING', AmbiguousCandidateOrderingEvidenceKey, AmbiguousCandidateOrderingEvidence
>
export type BlockedDependencyDiagnostic = ReadinessDiagnosticBase<
  'BLOCKED_DEPENDENCY', 'PREREQUISITES_NOT_DONE', BlockedDependencyEvidence
>
export type StaleOrUnapprovedTruthDiagnostic = ReadinessDiagnosticBase<
  'STALE_OR_UNAPPROVED_TRUTH', StaleOrUnapprovedTruthEvidenceKey, StaleOrUnapprovedTruthEvidence
>
export type StrategicConflictDiagnostic = ReadinessDiagnosticBase<
  'STRATEGIC_CONFLICT', StrategicConflictEvidenceKey, StrategicConflictEvidence
>

export type ReadinessDiagnostic =
  | InvalidProjectStateDiagnostic
  | MissingRequiredInputDiagnostic
  | AmbiguousCandidateOrderingDiagnostic
  | BlockedDependencyDiagnostic
  | StaleOrUnapprovedTruthDiagnostic
  | StrategicConflictDiagnostic

const SUBJECT_KIND_RANK: Record<ReadinessSubjectKind, number> = {
  PROJECT: 0,
  SPRINT: 1,
  EPIC: 2,
  TASK: 3,
  STRATEGIC_SOURCE: 4,
  REQUIREMENT: 5,
  DECISION: 6,
}

const CODE_RANK: Record<ReadinessDiagnosticCode, number> = {
  INVALID_PROJECT_STATE: 0,
  MISSING_REQUIRED_INPUT: 1,
  AMBIGUOUS_CANDIDATE_ORDERING: 2,
  BLOCKED_DEPENDENCY: 3,
  STALE_OR_UNAPPROVED_TRUTH: 4,
  STRATEGIC_CONFLICT: 5,
}

function lexical(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isCanonicalCode(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const normalized = normalizeBacklogCode(value)
  return normalized.ok && normalized.value === value
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && Object.hasOwn(TASK_PRIORITY_RANK, value)
}

function isValidSequence(value: unknown): value is number {
  return typeof value === 'number' && validateSequence(value).ok
}

function isValidAcceptanceCriteria(value: unknown): boolean {
  const result = validateAcceptanceCriteria(value)
  return result.ok && result.value.length > 0
}

function sameProject(value: unknown, projectId: string): boolean {
  return value === projectId
}

function findUniqueByProjectAndId<T extends { readonly id?: unknown, readonly projectId?: unknown }>(
  rows: readonly T[],
  projectId: string,
  id: string,
): T | null {
  const matches = rows.filter(row => row.projectId === projectId && row.id === id)
  return matches.length === 1 ? matches[0] ?? null : null
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(lexical)
}

function canonicalSubjects(subjects: readonly ReadinessSubject[]): ReadinessSubject[] {
  const unique = new Map<string, ReadinessSubject>()
  for (const subject of subjects) {
    if (!isIdentifier(subject.id)) continue
    unique.set(`${subject.kind}|${subject.id}`, { kind: subject.kind, id: subject.id })
  }
  return [...unique.values()].sort((left, right) => (
    SUBJECT_KIND_RANK[left.kind] - SUBJECT_KIND_RANK[right.kind]
    || lexical(left.id, right.id)
  ))
}

function fingerprint(
  code: ReadinessDiagnosticCode,
  subject: ReadinessSubject,
  evidenceKey: string,
  relatedSubjects: readonly ReadinessSubject[],
): string {
  return JSON.stringify([
    READINESS_DIAGNOSTICS_VERSION,
    code,
    subject.kind,
    subject.id,
    evidenceKey,
    relatedSubjects.map(related => [related.kind, related.id]),
  ])
}

function createDiagnostic(
  projectId: string,
  code: ReadinessDiagnosticCode,
  subject: ReadinessSubject,
  relatedSubjects: readonly ReadinessSubject[],
  evidenceKey: string,
  evidence: ReadinessDiagnostic['evidence'],
  message: string,
): ReadinessDiagnostic {
  const canonicalRelated = canonicalSubjects(relatedSubjects)
  return {
    code,
    severity: 'ERROR',
    projectId,
    subject,
    relatedSubjects: canonicalRelated,
    evidenceKey,
    message,
    fingerprint: fingerprint(code, subject, evidenceKey, canonicalRelated),
    evidence,
  } as ReadinessDiagnostic
}

function addDiagnostic(
  diagnostics: ReadinessDiagnostic[],
  projectId: string,
  code: ReadinessDiagnosticCode,
  subject: ReadinessSubject,
  relatedSubjects: readonly ReadinessSubject[],
  evidenceKey: string,
  evidence: ReadinessDiagnostic['evidence'],
  message: string,
): void {
  diagnostics.push(createDiagnostic(projectId, code, subject, relatedSubjects, evidenceKey, evidence, message))
}

function finaliseDiagnostics(diagnostics: readonly ReadinessDiagnostic[]): ReadinessDiagnostic[] {
  const unique = new Map<string, ReadinessDiagnostic>()
  for (const diagnostic of diagnostics) unique.set(diagnostic.fingerprint, diagnostic)
  return [...unique.values()].sort((left, right) => (
    (left.severity === right.severity ? 0 : left.severity === 'ERROR' ? -1 : 1)
    || SUBJECT_KIND_RANK[left.subject.kind] - SUBJECT_KIND_RANK[right.subject.kind]
    || lexical(left.subject.id, right.subject.id)
    || CODE_RANK[left.code] - CODE_RANK[right.code]
    || lexical(left.evidenceKey, right.evidenceKey)
    || lexical(JSON.stringify(left.relatedSubjects), JSON.stringify(right.relatedSubjects))
  ))
}

function readIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isIdentifier)) return null
  const ids = uniqueSorted(value)
  return ids.length === value.length ? ids : null
}

function subject(kind: ReadinessSubjectKind, id: string): ReadinessSubject {
  return { kind, id }
}

function taskCurrent(task: ResolverTaskInput): boolean {
  return task.status === 'TODO' && task.archivedAt === null
}

function sprintCurrent(sprint: ResolverSprintInput | null): boolean {
  return Boolean(sprint && sprint.status === 'ACTIVE' && sprint.archivedAt === null)
}

function epicCurrent(epic: ResolverEpicInput | null): boolean {
  return Boolean(!epic || (epic.status === 'ACTIVE' && epic.archivedAt === null))
}

function addMissingTask(
  diagnostics: ReadinessDiagnostic[],
  projectId: string,
  taskId: string,
  key: Exclude<MissingRequiredInputEvidenceKey, 'TASK_IDENTITY'>,
): void {
  addDiagnostic(
    diagnostics,
    projectId,
    'MISSING_REQUIRED_INPUT',
    subject('TASK', taskId),
    [],
    key,
    { key },
    `Task ${taskId} is missing required input ${key}.`,
  )
}

function addAmbiguous(
  diagnostics: ReadinessDiagnostic[],
  projectId: string,
  key: AmbiguousCandidateOrderingEvidenceKey,
  ids: readonly string[],
  kind: ReadinessSubjectKind,
): void {
  const sorted = uniqueSorted(ids)
  const first = sorted[0]
  if (!first) return
  addDiagnostic(
    diagnostics,
    projectId,
    'AMBIGUOUS_CANDIDATE_ORDERING',
    subject(kind, first),
    sorted.slice(1).map(id => subject(kind, id)),
    key,
    { key, relatedCount: sorted.length },
    `Deterministic ordering is ambiguous for ${key}.`,
  )
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const value = key(row)
    if (value === null) continue
    const group = groups.get(value) ?? []
    group.push(row)
    groups.set(value, group)
  }
  return groups
}

function emitGlobalAmbiguities(
  input: NextWorkResolverInput,
  diagnostics: ReadinessDiagnostic[],
  targetTasks: readonly ResolverTaskInput[],
): void {
  const currentTasks = targetTasks.filter(taskCurrent).filter((task) => {
    const sprint = isIdentifier(task.sprintId)
      ? findUniqueByProjectAndId(input.sprints, input.projectId, task.sprintId)
      : null
    const epic = task.epicId === null || task.epicId === undefined
      ? null
      : isIdentifier(task.epicId) ? findUniqueByProjectAndId(input.epics, input.projectId, task.epicId) : null
    return sprintCurrent(sprint) && epicCurrent(epic)
  })
  const sprints = input.sprints.filter(row => sameProject(row.projectId, input.projectId)
    && isIdentifier(row.id) && isValidSequence(row.sequence) && sprintCurrent(row))
  for (const group of groupBy(sprints, row => String(row.sequence)).values()) {
    if (group.length > 1) addAmbiguous(diagnostics, input.projectId, 'DUPLICATE_SPRINT_SEQUENCE', group.map(row => String(row.id)), 'SPRINT')
  }

  for (const group of groupBy(currentTasks.filter(row => isIdentifier(row.id) && isValidSequence(row.sequence)), row => (
    isIdentifier(row.sprintId) ? `${row.sprintId}|${row.sequence}` : null
  )).values()) {
    if (group.length > 1) addAmbiguous(diagnostics, input.projectId, 'DUPLICATE_TASK_SEQUENCE', group.map(row => String(row.id)), 'TASK')
  }
  for (const group of groupBy(currentTasks.filter(row => isIdentifier(row.id) && isCanonicalCode(row.code)), row => String(row.code)).values()) {
    if (group.length > 1) addAmbiguous(diagnostics, input.projectId, 'DUPLICATE_TASK_CODE', group.map(row => String(row.id)), 'TASK')
  }

  for (const group of groupBy(currentTasks.filter(row => isIdentifier(row.id)), row => String(row.id)).values()) {
    if (group.length > 1) {
      addAmbiguous(diagnostics, input.projectId, 'DUPLICATE_TASK_ID', group.map(row => String(row.id)), 'TASK')
      const parents = new Set(group.map(row => `${String(row.sprintId)}|${String(row.epicId)}`))
      if (parents.size > 1) addAmbiguous(diagnostics, input.projectId, 'CONFLICTING_PARENTAGE', group.map(row => String(row.id)), 'TASK')
    }
  }
}

function addSourceDiagnostics(
  input: NextWorkResolverInput,
  diagnostics: ReadinessDiagnostic[],
  source: ResolverStrategicSourceInput,
): void {
  if (!isIdentifier(source.id) || !sameProject(source.projectId, input.projectId)) return
  const sourceSubject = subject('STRATEGIC_SOURCE', source.id)
  if (source.approvalStatus !== 'APPROVED') {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', sourceSubject, [], 'SOURCE_APPROVAL', { key: 'SOURCE_APPROVAL' }, `Strategic source ${source.id} is not approved.`)
  }
  if (source.syncStatus !== 'SYNCED') {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', sourceSubject, [], 'SOURCE_SYNC', { key: 'SOURCE_SYNC' }, `Strategic source ${source.id} is not synced.`)
  }
  if (!isIdentifier(source.currentSnapshotId)
    || !isIdentifier(source.revision)
    || !isIdentifier(source.checksum)
    || !isIdentifier(source.currentSnapshotProviderVersion)
    || !isIdentifier(source.currentSnapshotChecksum)) {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', sourceSubject, [], 'SOURCE_POINTER', { key: 'SOURCE_POINTER' }, `Strategic source ${source.id} has no complete current pointer.`)
  }
  if (isIdentifier(source.revision) && isIdentifier(source.currentSnapshotProviderVersion)
    && source.revision !== source.currentSnapshotProviderVersion) {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', sourceSubject, [], 'SOURCE_REVISION', { key: 'SOURCE_REVISION' }, `Strategic source ${source.id} revision does not match its current snapshot.`)
  }
  if (isIdentifier(source.checksum) && isIdentifier(source.currentSnapshotChecksum)
    && source.checksum !== source.currentSnapshotChecksum) {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', sourceSubject, [], 'SOURCE_CHECKSUM', { key: 'SOURCE_CHECKSUM' }, `Strategic source ${source.id} checksum does not match its current snapshot.`)
  }
}

function emitFactDiagnostics(
  input: NextWorkResolverInput,
  diagnostics: ReadinessDiagnostic[],
  fact: ResolverRequirementInput | ResolverDecisionInput,
  source: ResolverStrategicSourceInput,
): void {
  const kind: ReadinessSubjectKind = 'code' in fact ? 'DECISION' : 'REQUIREMENT'
  const id = typeof fact.id === 'string' ? fact.id : null
  if (!id || !sameProject(fact.projectId, input.projectId)) return
  if (kind === 'REQUIREMENT' && fact.status !== 'ACTIVE') {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', subject(kind, id), [], 'FACT_SNAPSHOT', { key: 'FACT_SNAPSHOT' }, `${kind} ${id} is not current applicable truth.`)
  }
  if (kind === 'DECISION' && fact.status !== 'APPROVED' && fact.status !== 'REJECTED') {
    addDiagnostic(diagnostics, input.projectId, 'STALE_OR_UNAPPROVED_TRUTH', subject(kind, id), [], 'FACT_SNAPSHOT', { key: 'FACT_SNAPSHOT' }, `${kind} ${id} is not approved applicable truth.`)
  }
  if (isIdentifier(source.currentSnapshotId) && fact.sourceSnapshotId !== source.currentSnapshotId) {
    addDiagnostic(
      diagnostics,
      input.projectId,
      'STALE_OR_UNAPPROVED_TRUTH',
      subject(kind, id),
      [subject('STRATEGIC_SOURCE', String(source.id))],
      'FACT_SNAPSHOT',
      { key: 'FACT_SNAPSHOT', currentSnapshotId: source.currentSnapshotId },
      `${kind} ${id} does not point to the current strategic snapshot.`,
    )
  }
}

function emitConflict(
  diagnostics: ReadinessDiagnostic[],
  projectId: string,
  key: StrategicConflictEvidenceKey,
  ids: readonly string[],
): void {
  const sorted = uniqueSorted(ids)
  const first = sorted[0]
  if (!first) return
  addDiagnostic(
    diagnostics,
    projectId,
    'STRATEGIC_CONFLICT',
    subject('DECISION', first),
    sorted.slice(1).map(id => subject('DECISION', id)),
    key,
    { key, decisionIds: sorted },
    `Applicable decisions prove structural conflict ${key}.`,
  )
}

function emitDecisionConflicts(
  input: NextWorkResolverInput,
  diagnostics: ReadinessDiagnostic[],
  decisions: readonly ResolverDecisionInput[],
): void {
  const applicable = decisions.filter(decision => sameProject(decision.projectId, input.projectId) && isIdentifier(decision.id))
  for (const group of groupBy(applicable, decision => isIdentifier(decision.code) ? decision.code : null).values()) {
    if (group.length < 2) continue
    const canonical = group.map(decision => JSON.stringify([
      decision.chosenDecision,
      decision.status,
      decision.documentSourceId,
      decision.sourceSnapshotId,
    ])).sort(lexical)
    if (new Set(canonical).size > 1) emitConflict(diagnostics, input.projectId, 'DUPLICATE_DECISION_CODE', group.map(decision => String(decision.id)))
  }

  for (const group of groupBy(applicable.filter(decision => decision.status === 'APPROVED' && isIdentifier(decision.supersedesDecisionId)), decision => String(decision.supersedesDecisionId)).values()) {
    if (group.length > 1) emitConflict(diagnostics, input.projectId, 'MULTIPLE_APPROVED_SUCCESSORS', group.map(decision => String(decision.id)))
  }

  const byId = new Map(applicable.map(decision => [String(decision.id), decision]))
  for (const successor of applicable) {
    if (successor.status !== 'APPROVED' || !isIdentifier(successor.supersedesDecisionId)) continue
    const predecessor = byId.get(successor.supersedesDecisionId)
    if (predecessor?.status === 'APPROVED' && isIdentifier(predecessor.id)) {
      emitConflict(diagnostics, input.projectId, 'ACTIVE_PREDECESSOR_AND_SUCCESSOR', [predecessor.id, successor.id as string])
    }
  }

  const edges = new Map<string, string>()
  for (const decision of applicable) {
    if (isIdentifier(decision.id) && isIdentifier(decision.supersedesDecisionId)
      && byId.has(decision.supersedesDecisionId)) edges.set(decision.id, decision.supersedesDecisionId)
  }
  const visited = new Set<string>()
  const active = new Set<string>()
  const path: string[] = []
  const cycles = new Set<string>()
  const visit = (id: string): void => {
    if (active.has(id)) {
      const index = path.indexOf(id)
      const cycle = uniqueSorted(path.slice(index))
      const key = cycle.join('|')
      if (!cycles.has(key)) {
        cycles.add(key)
        emitConflict(diagnostics, input.projectId, 'SUPERSESSION_CYCLE', cycle)
      }
      return
    }
    if (visited.has(id)) return
    visited.add(id)
    active.add(id)
    path.push(id)
    const next = edges.get(id)
    if (next) visit(next)
    path.pop()
    active.delete(id)
  }
  for (const id of [...byId.keys()].sort(lexical)) visit(id)
}

function emitTaskDiagnostics(
  input: NextWorkResolverInput,
  diagnostics: ReadinessDiagnostic[],
  task: ResolverTaskInput,
): void {
  const taskId = isIdentifier(task.id) ? task.id : null
  if (!taskId) return
  if (!taskCurrent(task)) return
  const sprint = isIdentifier(task.sprintId)
    ? findUniqueByProjectAndId(input.sprints, input.projectId, task.sprintId)
    : null
  const sprintValid = Boolean(sprint && sameProject(sprint.projectId, input.projectId) && isIdentifier(sprint.id))
  if (!sprintValid) addMissingTask(diagnostics, input.projectId, taskId, 'SPRINT_REFERENCE')
  if (sprintValid && !sprintCurrent(sprint)) return

  let epic: ResolverEpicInput | null = null
  if (task.epicId !== null && task.epicId !== undefined) {
    epic = isIdentifier(task.epicId)
      ? findUniqueByProjectAndId(input.epics, input.projectId, task.epicId)
      : null
    const epicValid = Boolean(epic && sameProject(epic.projectId, input.projectId)
      && epic.sprintId === task.sprintId && isIdentifier(epic.id))
    if (!epicValid) {
      addMissingTask(diagnostics, input.projectId, taskId, 'EPIC_REFERENCE')
      if (epic && sameProject(epic.projectId, input.projectId) && epic.sprintId !== task.sprintId) {
        addDiagnostic(diagnostics, input.projectId, 'AMBIGUOUS_CANDIDATE_ORDERING', subject('TASK', taskId), [], 'CONFLICTING_PARENTAGE', { key: 'CONFLICTING_PARENTAGE', relatedCount: 0 }, `Task ${taskId} has conflicting structural parentage.`)
      }
    }
    if (epicValid && !epicCurrent(epic)) return
  }
  if (!isCanonicalCode(task.code)) addMissingTask(diagnostics, input.projectId, taskId, 'TASK_CODE')
  if (!isTaskPriority(task.priority)) addMissingTask(diagnostics, input.projectId, taskId, 'TASK_PRIORITY')
  if (!isValidSequence(task.sequence)) addMissingTask(diagnostics, input.projectId, taskId, 'TASK_SEQUENCE')
  if (!isValidAcceptanceCriteria(task.acceptanceCriteria)) addMissingTask(diagnostics, input.projectId, taskId, 'ACCEPTANCE_CRITERIA')

  const contexts = input.strategicContexts.filter(context => context.taskId === taskId)
  if (contexts.length > 1) addAmbiguous(diagnostics, input.projectId, 'MULTIPLE_STRATEGIC_CONTEXTS', [taskId], 'TASK')
  const context = contexts.length === 1 ? contexts[0] : null
  const requirementIds = context?.applicabilityEstablished === true ? readIds(context.requirementIds) : null
  const decisionIds = context?.applicabilityEstablished === true ? readIds(context.decisionIds) : null
  const sourceIds = context?.applicabilityEstablished === true ? readIds(context.sourceIds) : null
  if (!context || context.applicabilityEstablished !== true || !requirementIds || !decisionIds || !sourceIds) {
    addMissingTask(diagnostics, input.projectId, taskId, 'STRATEGIC_CONTEXT')
  }

  const requirements = requirementIds?.map(id => findUniqueByProjectAndId(input.requirements, input.projectId, id)) ?? []
  const decisions = decisionIds?.map(id => findUniqueByProjectAndId(input.decisions, input.projectId, id)) ?? []
  const sources = sourceIds?.map(id => findUniqueByProjectAndId(input.strategicSources, input.projectId, id)) ?? []
  if (requirementIds) {
    requirementIds.forEach((_id, index) => {
      const record = requirements[index]
      if (!record || !sameProject(record.projectId, input.projectId)
        || !sourceIds?.includes(String(record.documentSourceId))) {
        addMissingTask(diagnostics, input.projectId, taskId, 'REQUIREMENT_REFERENCE')
      }
    })
  }
  if (decisionIds) {
    decisionIds.forEach((_id, index) => {
      const record = decisions[index]
      if (!record || !sameProject(record.projectId, input.projectId)
        || !sourceIds?.includes(String(record.documentSourceId))) {
        addMissingTask(diagnostics, input.projectId, taskId, 'DECISION_REFERENCE')
      }
    })
  }
  if (sourceIds) {
    sourceIds.forEach((_id, index) => {
      const record = sources[index]
      if (!record || !sameProject(record.projectId, input.projectId)) addMissingTask(diagnostics, input.projectId, taskId, 'SOURCE_REFERENCE')
    })
  }

  const dependencyRows = input.dependencies.filter(edge => edge.taskId === taskId
    && (edge.projectId === input.projectId || !isIdentifier(edge.projectId)))
  const prerequisites: ResolverTaskInput[] = []
  for (const edge of dependencyRows) {
    if (!sameProject(edge.projectId, input.projectId) || !isIdentifier(edge.dependsOnTaskId)) {
      addMissingTask(diagnostics, input.projectId, taskId, 'DEPENDENCY_REFERENCE')
      continue
    }
    const prerequisite = findUniqueByProjectAndId(input.tasks, input.projectId, edge.dependsOnTaskId)
    if (!prerequisite) {
      addMissingTask(diagnostics, input.projectId, taskId, 'DEPENDENCY_REFERENCE')
      continue
    }
    if (!prerequisites.some(item => item.id === prerequisite.id)) prerequisites.push(prerequisite)
  }

  // Non-candidate lifecycle history is intentionally not relabeled as broken.
  if (!sprintCurrent(sprintValid ? sprint : null) || !epicCurrent(epic)) return

  for (const source of sources) {
    if (source && sameProject(source.projectId, input.projectId)) addSourceDiagnostics(input, diagnostics, source)
  }
  for (const requirement of requirements) {
    const source = requirement && isIdentifier(requirement.documentSourceId)
      ? findUniqueByProjectAndId(input.strategicSources, input.projectId, requirement.documentSourceId)
      : null
    if (requirement && source && sameProject(source.projectId, input.projectId)) emitFactDiagnostics(input, diagnostics, requirement, source)
  }
  for (const decision of decisions) {
    const source = decision && isIdentifier(decision.documentSourceId)
      ? findUniqueByProjectAndId(input.strategicSources, input.projectId, decision.documentSourceId)
      : null
    if (decision && source && sameProject(source.projectId, input.projectId)) emitFactDiagnostics(input, diagnostics, decision, source)
  }

  const structuralErrors = diagnostics.some(diagnostic => diagnostic.subject.kind === 'TASK'
    && diagnostic.subject.id === taskId
    && (diagnostic.code === 'MISSING_REQUIRED_INPUT' || diagnostic.code === 'AMBIGUOUS_CANDIDATE_ORDERING'))
  if (!structuralErrors && requirementIds && decisionIds && sourceIds) {
    const unsatisfied = prerequisites
      .filter(prerequisite => prerequisite.status !== 'DONE' && isIdentifier(prerequisite.id))
      .map(prerequisite => prerequisite.id as string)
      .sort(lexical)
    if (unsatisfied.length > 0) {
      addDiagnostic(
        diagnostics,
        input.projectId,
        'BLOCKED_DEPENDENCY',
        subject('TASK', taskId),
        unsatisfied.map(id => subject('TASK', id)),
        'PREREQUISITES_NOT_DONE',
        { key: 'PREREQUISITES_NOT_DONE', prerequisiteIds: unsatisfied },
        `Task ${taskId} has prerequisites that are not DONE.`,
      )
    }
  }
}

/**
 * Evaluate all independently true P0-032 conditions for one normalized
 * project snapshot. The returned array is canonical, deduplicated and sorted.
 */
export function diagnoseReadiness(input: NextWorkResolverInput): readonly ReadinessDiagnostic[] {
  const projectId = typeof input?.projectId === 'string' ? input.projectId : ''
  const diagnostics: ReadinessDiagnostic[] = []
  const projectValue: unknown = input?.project
  const projectRecordValid = isObject(projectValue)
  if (!projectRecordValid) {
    addDiagnostic(diagnostics, projectId, 'INVALID_PROJECT_STATE', subject('PROJECT', projectId), [], 'PROJECT_RECORD', { key: 'PROJECT_RECORD', invalidRecordCount: 1 }, `Project ${projectId} record is missing or malformed.`)
    return finaliseDiagnostics(diagnostics)
  }
  const project = projectValue as { readonly id?: unknown, readonly status?: unknown }
  if (!isIdentifier(project.id) || project.id !== projectId) {
    addDiagnostic(diagnostics, projectId, 'INVALID_PROJECT_STATE', subject('PROJECT', projectId), [], 'PROJECT_IDENTITY', { key: 'PROJECT_IDENTITY' }, `Project ${projectId} identity is invalid.`)
  }
  if (project.status !== 'ACTIVE') {
    addDiagnostic(diagnostics, projectId, 'INVALID_PROJECT_STATE', subject('PROJECT', projectId), [], 'PROJECT_STATUS', { key: 'PROJECT_STATUS' }, `Project ${projectId} is not ACTIVE.`)
  }
  if (!isIdentifier(projectId) || project.id !== projectId || project.status !== 'ACTIVE') return finaliseDiagnostics(diagnostics)

  const targetTasks = input.tasks.filter(task => sameProject(task.projectId, projectId))
  const malformedIdentityCount = targetTasks.filter(task => !isIdentifier(task.id)).length
  if (malformedIdentityCount > 0) {
    addDiagnostic(diagnostics, projectId, 'MISSING_REQUIRED_INPUT', subject('PROJECT', projectId), [], 'TASK_IDENTITY', { key: 'TASK_IDENTITY', invalidRecordCount: malformedIdentityCount }, `Project ${projectId} contains ${malformedIdentityCount} task record(s) without an addressable identity.`)
  }
  emitGlobalAmbiguities(input, diagnostics, targetTasks)
  for (const task of targetTasks) emitTaskDiagnostics(input, diagnostics, task)

  const applicableDecisionIds = new Set<string>()
  const currentTaskIds = new Set(targetTasks
    .filter(task => taskCurrent(task))
    .filter((task) => {
      const sprint = isIdentifier(task.sprintId)
        ? findUniqueByProjectAndId(input.sprints, input.projectId, task.sprintId)
        : null
      const epic = task.epicId === null || task.epicId === undefined
        ? null
        : isIdentifier(task.epicId) ? findUniqueByProjectAndId(input.epics, input.projectId, task.epicId) : null
      return sprintCurrent(sprint) && epicCurrent(epic)
    })
    .map(task => task.id)
    .filter((id): id is string => isIdentifier(id)))
  for (const context of input.strategicContexts) {
    if (!isIdentifier(context.taskId) || !currentTaskIds.has(context.taskId)) continue
    const ids = readIds(context.decisionIds)
    if (context.applicabilityEstablished === true && ids) ids.forEach(id => applicableDecisionIds.add(id))
  }
  const applicableDecisions = [...applicableDecisionIds]
    .map(id => findUniqueByProjectAndId(input.decisions, input.projectId, id))
    .filter((decision): decision is ResolverDecisionInput => Boolean(decision && sameProject(decision.projectId, projectId)))
  emitDecisionConflicts(input, diagnostics, applicableDecisions)
  return finaliseDiagnostics(diagnostics)
}

/** Return whether an ERROR diagnostic applies to a candidate Task. */
export function isReadinessDiagnosticBlockingTask(
  input: NextWorkResolverInput,
  task: ResolverTaskInput,
  diagnostic: ReadinessDiagnostic,
): boolean {
  if (diagnostic.severity !== 'ERROR') return false
  if (diagnostic.subject.kind === 'PROJECT') return true
  if (!isIdentifier(task.id) || !sameProject(task.projectId, input.projectId)) return false
  const subjects = [diagnostic.subject, ...diagnostic.relatedSubjects]
  if (diagnostic.subject.kind === 'TASK') return subjects.some(item => item.kind === 'TASK' && item.id === task.id)
  if (diagnostic.subject.kind === 'SPRINT') return subjects.some(item => item.kind === 'SPRINT' && item.id === task.sprintId)
  if (diagnostic.subject.kind === 'EPIC') return subjects.some(item => item.kind === 'EPIC' && item.id === task.epicId)
  const contexts = input.strategicContexts.filter(context => context.taskId === task.id)
  return contexts.some((context) => {
    const ids = diagnostic.subject.kind === 'STRATEGIC_SOURCE'
      ? context.sourceIds
      : diagnostic.subject.kind === 'REQUIREMENT' ? context.requirementIds : context.decisionIds
    if (!Array.isArray(ids)) return false
    return subjects.some(item => item.kind === diagnostic.subject.kind && ids.includes(item.id))
  })
}
