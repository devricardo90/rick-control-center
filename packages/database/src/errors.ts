/**
 * Typed persistence errors for the initial domain model.
 *
 * Raw Prisma errors (e.g. `PrismaClientKnownRequestError`) are never
 * surfaced to callers of the repository layer — they are translated into
 * these deterministic, framework-independent error types.
 *
 * NDERCC-5: initial domain and persistence model.
 */
export class ProjectNotFoundError extends Error {
  constructor(public readonly projectId: string) {
    super(`Project not found: ${projectId}`)
    this.name = 'ProjectNotFoundError'
  }
}

export class DuplicateProjectKeyError extends Error {
  constructor(public readonly key: string) {
    super(`Project key already exists: ${key}`)
    this.name = 'DuplicateProjectKeyError'
  }
}

/**
 * A lifecycle action was requested that does not apply from the project's
 * current status (including any action requested against an ARCHIVED
 * project, which is terminal — NDERCC-10).
 */
export class InvalidProjectTransitionError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(`Invalid project lifecycle transition for ${projectId}: ${fromStatus} -> ${toStatus}`)
    this.name = 'InvalidProjectTransitionError'
  }
}

/** An archived project's settings were requested to change — archived is terminal and read-only (NDERCC-10). */
export class ArchivedProjectReadOnlyError extends Error {
  constructor(public readonly projectId: string) {
    super(`Archived project is read-only: ${projectId}`)
    this.name = 'ArchivedProjectReadOnlyError'
  }
}

/** No IntegrationConnection with this id exists for the given project — either it never existed, or it belongs to a different project (NDERCC-11). */
export class IntegrationConnectionNotFoundError extends Error {
  constructor(public readonly connectionId: string) {
    super(`Integration connection not found: ${connectionId}`)
    this.name = 'IntegrationConnectionNotFoundError'
  }
}

/** No DocumentSource with this id exists for the given project — either it never existed, or it belongs to a different project (NDERCC-12). */
export class DocumentSourceNotFoundError extends Error {
  constructor(public readonly sourceId: string) {
    super(`Document source not found: ${sourceId}`)
    this.name = 'DocumentSourceNotFoundError'
  }
}

/** A document source already exists for this (project, provider, externalFileId) triple (NDERCC-12). */
export class DuplicateDocumentSourceError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly provider: string,
    public readonly externalFileId: string,
  ) {
    super(`Document source already registered for project ${projectId}: ${provider}/${externalFileId}`)
    this.name = 'DuplicateDocumentSourceError'
  }
}

/** Document source input failed a domain validation rule (empty field, unsafe URL, malformed checksum, or secret-shaped metadata) (NDERCC-12). */
export class InvalidDocumentSourceInputError extends Error {
  constructor(reason: string) {
    super(`Invalid document source input: ${reason}`)
    this.name = 'InvalidDocumentSourceInputError'
  }
}

/**
 * Snapshot input failed a domain validation rule (NDERCC-13). The most
 * important case is a checksum that does not match the content it is
 * stored alongside — the persistence layer recomputes the digest rather
 * than trusting the caller, so an immutable snapshot row can never claim a
 * checksum its own `contentText` does not produce.
 */
export class InvalidDocumentSnapshotInputError extends Error {
  constructor(reason: string) {
    super(`Invalid document snapshot input: ${reason}`)
    this.name = 'InvalidDocumentSnapshotInputError'
  }
}

/** No immutable snapshot with this id exists for the requested project. */
export class DocumentSnapshotNotFoundError extends Error {
  constructor(public readonly snapshotId: string) {
    super(`Document snapshot not found: ${snapshotId}`)
    this.name = 'DocumentSnapshotNotFoundError'
  }
}

/** The source/snapshot pair is not an approved current extraction input. */
export class StrategicTruthSourceNotEligibleError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly documentSourceId: string,
    public readonly sourceSnapshotId: string,
    public readonly reason: string,
  ) {
    super(`Strategic truth source is not eligible for extraction: ${reason}`)
    this.name = 'StrategicTruthSourceNotEligibleError'
  }
}

/** A candidate could not be trusted because deterministic parsing found an error. */
export class StrategicTruthParseError extends Error {
  constructor(public readonly diagnostics: readonly string[]) {
    super('Strategic truth candidate is ambiguous or unsupported')
    this.name = 'StrategicTruthParseError'
  }
}

/** A trusted explicit code already belongs to another document source. */
export class StrategicTruthSourceConflictError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly code: string,
    public readonly existingDocumentSourceId: string,
    public readonly candidateDocumentSourceId: string,
  ) {
    super(`Strategic truth source conflict for ${code}`)
    this.name = 'StrategicTruthSourceConflictError'
  }
}

// ── Operational backlog (NDERCC-17 / DEC-RIC-005) ─────────────────────────────
//
// A record that exists but belongs to a different project raises the same
// not-found error as one that never existed, so these errors never confirm
// the existence of another project's data.

/** The kind of backlog record an error refers to, so one error type can serve all three aggregates without losing precision. */
export type BacklogRecordKind = 'Sprint' | 'Epic' | 'Task'

export class SprintNotFoundError extends Error {
  constructor(public readonly sprintId: string) {
    super(`Sprint not found: ${sprintId}`)
    this.name = 'SprintNotFoundError'
  }
}

export class EpicNotFoundError extends Error {
  constructor(public readonly epicId: string) {
    super(`Epic not found: ${epicId}`)
    this.name = 'EpicNotFoundError'
  }
}

export class TaskNotFoundError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task not found: ${taskId}`)
    this.name = 'TaskNotFoundError'
  }
}

/** A lifecycle transition that the Sprint/Epic/Task state machine does not allow from the record's current status — including any transition out of a terminal status. */
export class InvalidBacklogTransitionError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    public readonly recordId: string,
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(`Invalid ${kind} lifecycle transition for ${recordId}: ${fromStatus} -> ${toStatus}`)
    this.name = 'InvalidBacklogTransitionError'
  }
}

/**
 * A planning field was changed after its freeze point: a Task that has left
 * TODO, or a Sprint/Epic that has left PLANNED (DEC-RIC-005 §11). Also
 * raised for the always-immutable fields (id, projectId, code, createdAt),
 * which no update input accepts in the first place.
 */
export class BacklogPlanningFrozenError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    public readonly recordId: string,
    public readonly status: string,
  ) {
    super(`${kind} planning fields are frozen in status ${status}: ${recordId}`)
    this.name = 'BacklogPlanningFrozenError'
  }
}

/** Archival was requested for a record that has not reached a terminal status. Archival is logical and permitted only for terminal records (DEC-RIC-005 §12). */
export class BacklogNotTerminalError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    public readonly recordId: string,
    public readonly status: string,
  ) {
    super(`${kind} cannot be archived from non-terminal status ${status}: ${recordId}`)
    this.name = 'BacklogNotTerminalError'
  }
}

/** A backlog field failed a domain validation rule (blank title, malformed code, invalid sequence, or an externalId without its provider). */
export class InvalidBacklogInputError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    reason: string,
  ) {
    super(`Invalid ${kind} input: ${reason}`)
    this.name = 'InvalidBacklogInputError'
  }
}

/** `acceptanceCriteria` was not an ordered array of non-empty strings (DEC-RIC-005 §9). */
export class InvalidAcceptanceCriteriaError extends Error {
  constructor(reason: string) {
    super(`Invalid acceptance criteria: ${reason}`)
    this.name = 'InvalidAcceptanceCriteriaError'
  }
}

/** The local code is already used by another record of the same kind in this project. */
export class DuplicateBacklogCodeError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    public readonly projectId: string,
    public readonly code: string,
  ) {
    super(`${kind} code already exists in project ${projectId}: ${code}`)
    this.name = 'DuplicateBacklogCodeError'
  }
}

/** The planning sequence is already taken — per Project for a Sprint, per Sprint for an Epic or Task. */
export class DuplicateBacklogSequenceError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    public readonly sequence: number,
  ) {
    super(`${kind} sequence already exists in its ordering scope: ${String(sequence)}`)
    this.name = 'DuplicateBacklogSequenceError'
  }
}

/** The `(projectId, externalProvider, externalId)` provenance triple is already recorded on another record of the same kind. */
export class DuplicateBacklogExternalIdError extends Error {
  constructor(
    public readonly kind: BacklogRecordKind,
    public readonly projectId: string,
    public readonly externalId: string,
  ) {
    super(`${kind} external identity already exists in project ${projectId}: ${externalId}`)
    this.name = 'DuplicateBacklogExternalIdError'
  }
}

/** A Task named an Epic that is not in the Task's own Sprint (or not in its Project). The composite foreign key rejects this at the database level too. */
export class InvalidEpicSprintOwnershipError extends Error {
  constructor(
    public readonly epicId: string,
    public readonly sprintId: string,
  ) {
    super(`Epic ${epicId} does not belong to sprint ${sprintId}`)
    this.name = 'InvalidEpicSprintOwnershipError'
  }
}

/** A Task cannot depend on itself. Also enforced by `task_dependencies_no_self_check` in PostgreSQL. */
export class SelfDependencyError extends Error {
  constructor(public readonly taskId: string) {
    super(`Task cannot depend on itself: ${taskId}`)
    this.name = 'SelfDependencyError'
  }
}

/** The `(taskId, dependsOnTaskId)` edge already exists. Dependency edges are a set, not a multiset. */
export class DuplicateTaskDependencyError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly dependsOnTaskId: string,
  ) {
    super(`Dependency already exists: ${taskId} -> ${dependsOnTaskId}`)
    this.name = 'DuplicateTaskDependencyError'
  }
}

/** The prerequisite belongs to a different project. Cross-project dependency orchestration is explicitly out of scope (DEC-RIC-005 §10). */
export class CrossProjectDependencyError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly dependsOnTaskId: string,
  ) {
    super(`Dependency crosses projects: ${taskId} -> ${dependsOnTaskId}`)
    this.name = 'CrossProjectDependencyError'
  }
}

/** Adding the edge would close a directed cycle. Rejected transactionally — the one dependency rule a relational constraint cannot express. */
export class TaskDependencyCycleError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly dependsOnTaskId: string,
  ) {
    super(`Dependency would create a cycle: ${taskId} -> ${dependsOnTaskId}`)
    this.name = 'TaskDependencyCycleError'
  }
}

/** Dependency writes are allowed only while the dependent Task is TODO; the set freezes once work starts (DEC-RIC-005 §10). */
export class TaskDependencyFrozenError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly status: string,
  ) {
    super(`Dependency set is frozen for task ${taskId} in status ${status}`)
    this.name = 'TaskDependencyFrozenError'
  }
}

// ── Implementation specifications (NDERCC-23 / DEC-RIC-010) ───────────────────
//
// As elsewhere in this file, a specification that exists but belongs to a
// different project raises the same not-found error as one that never
// existed, so these errors never confirm another project's data.

/** No implementation specification with this id exists for the given project. */
export class ImplementationSpecNotFoundError extends Error {
  constructor(public readonly specId: string) {
    super(`Implementation specification not found: ${specId}`)
    this.name = 'ImplementationSpecNotFoundError'
  }
}

/** A specification field failed a domain rule: a blank title or behavior, a malformed code or version, or a statement list that is not an ordered array of non-empty strings. */
export class InvalidImplementationSpecInputError extends Error {
  constructor(reason: string) {
    super(`Invalid implementation specification input: ${reason}`)
    this.name = 'InvalidImplementationSpecInputError'
  }
}

/** The lineage code is already in use in this project. A revision of an existing lineage uses `reviseImplementationSpec`, which is the only path that may reuse a code. */
export class DuplicateImplementationSpecCodeError extends Error {
  constructor(
    public readonly projectId: string,
    public readonly code: string,
  ) {
    super(`Implementation specification code already exists in project ${projectId}: ${code}`)
    this.name = 'DuplicateImplementationSpecCodeError'
  }
}

/**
 * A revision did not advance its lineage. Version identity must be
 * deterministic, so a revision has to be strictly greater than every version
 * the lineage already holds — re-using or lowering one would leave two rows
 * competing for the same identity.
 */
export class ImplementationSpecVersionNotIncreasingError extends Error {
  constructor(
    public readonly code: string,
    public readonly candidateVersion: string,
    public readonly currentVersion: string,
  ) {
    super(`Implementation specification version must increase for ${code}: ${candidateVersion} does not follow ${currentVersion}`)
    this.name = 'ImplementationSpecVersionNotIncreasingError'
  }
}

/** A lifecycle transition the specification state machine does not allow from the record's current status, including every transition out of a terminal status. */
export class InvalidImplementationSpecTransitionError extends Error {
  constructor(
    public readonly specId: string,
    public readonly fromStatus: string,
    public readonly toStatus: string,
  ) {
    super(`Invalid implementation specification transition for ${specId}: ${fromStatus} -> ${toStatus}`)
    this.name = 'InvalidImplementationSpecTransitionError'
  }
}

/** Content was changed after the specification left DRAFT. Content freezes permanently at that point; a change is a new version, never an edit. */
export class ImplementationSpecContentFrozenError extends Error {
  constructor(
    public readonly specId: string,
    public readonly status: string,
  ) {
    super(`Implementation specification content is frozen in status ${status}: ${specId}`)
    this.name = 'ImplementationSpecContentFrozenError'
  }
}

/**
 * Approval was requested for a specification that does not satisfy the
 * deterministic validation rules. Carries the finding codes so a caller can
 * report exactly what is missing without re-deriving them.
 */
export class ImplementationSpecNotApprovableError extends Error {
  constructor(
    public readonly specId: string,
    public readonly findingCodes: readonly string[],
  ) {
    super(`Implementation specification is not approvable: ${specId} (${findingCodes.join(', ')})`)
    this.name = 'ImplementationSpecNotApprovableError'
  }
}

/**
 * The Task already has an approved specification and the approval did not
 * name it as the one being superseded. Supersession is explicit: the system
 * never picks which specification to retire.
 */
export class ImplementationSpecSupersessionRequiredError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly currentApprovedSpecId: string,
  ) {
    super(`Task ${taskId} already has an approved specification; supersession must name ${currentApprovedSpecId}`)
    this.name = 'ImplementationSpecSupersessionRequiredError'
  }
}

/** The named predecessor cannot be superseded by this specification — it is not approved, governs a different Task, is the specification itself, or is an earlier version of the same lineage that the successor does not actually follow. */
export class InvalidImplementationSpecSupersessionError extends Error {
  constructor(
    public readonly specId: string,
    public readonly supersedesSpecId: string,
    reason: string,
  ) {
    super(`Invalid implementation specification supersession ${specId} -> ${supersedesSpecId}: ${reason}`)
    this.name = 'InvalidImplementationSpecSupersessionError'
  }
}

/** Approval named an operator that does not exist. An approval must always carry a real actor — it is explicit, never inferred. */
export class ImplementationSpecApproverNotFoundError extends Error {
  constructor(public readonly operatorId: string) {
    super(`Implementation specification approver not found: ${operatorId}`)
    this.name = 'ImplementationSpecApproverNotFoundError'
  }
}

/** A traceability link named a requirement or decision that does not exist in this project. */
export class ImplementationSpecTraceTargetNotFoundError extends Error {
  constructor(
    public readonly kind: 'Requirement' | 'Decision',
    public readonly targetId: string,
  ) {
    super(`Implementation specification trace target not found: ${kind} ${targetId}`)
    this.name = 'ImplementationSpecTraceTargetNotFoundError'
  }
}
