/**
 * Public surface of the @rick/database package.
 *
 * Re-exports the PrismaClient singleton, the health-check utility, and the
 * initial domain persistence surface (Project, IntegrationConnection).
 *
 * NDERCC-4: persistence foundation — sprint 0.
 * NDERCC-5: initial domain and persistence model.
 * NDERCC-6: single-user authentication.
 * NDERCC-13: immutable strategic document snapshots.
 */
export { prisma } from './client.js'
export type { DatabaseHealthResult } from './health.js'
export { checkDatabaseHealth } from './health.js'

export {
  ArchivedProjectReadOnlyError,
  DocumentSourceNotFoundError,
  DuplicateDocumentSourceError,
  DuplicateProjectKeyError,
  IntegrationConnectionNotFoundError,
  InvalidDocumentSnapshotInputError,
  InvalidDocumentSourceInputError,
  InvalidProjectTransitionError,
  ProjectNotFoundError,
  DocumentSnapshotNotFoundError,
  StrategicTruthParseError,
  StrategicTruthSourceConflictError,
  StrategicTruthSourceNotEligibleError,
} from './errors.js'

export type { BacklogRecordKind } from './errors.js'
export {
  BacklogNotTerminalError,
  BacklogPlanningFrozenError,
  CrossProjectDependencyError,
  DuplicateBacklogCodeError,
  DuplicateBacklogExternalIdError,
  DuplicateBacklogSequenceError,
  DuplicateTaskDependencyError,
  EpicNotFoundError,
  InvalidAcceptanceCriteriaError,
  InvalidBacklogInputError,
  InvalidBacklogTransitionError,
  InvalidEpicSprintOwnershipError,
  SelfDependencyError,
  SprintNotFoundError,
  TaskDependencyCycleError,
  TaskDependencyFrozenError,
  TaskNotFoundError,
} from './errors.js'

export type {
  CreateProjectInput,
  Project,
  ProjectLifecycleAction,
  ProjectStatus,
  UpdateProjectSettingsInput,
} from './project.js'
export {
  AutonomyPolicy,
  BranchPolicy,
  createProject,
  findProjectById,
  findProjectByKey,
  listProjects,
  transitionProjectLifecycle,
  updateProjectSettings,
} from './project.js'

export type {
  CreateIntegrationConnectionInput,
  IntegrationConnection,
  IntegrationConnectionStatus,
  IntegrationProvider,
  UpsertVerifiedIntegrationConnectionInput,
} from './integration-connection.js'
export {
  createIntegrationConnection,
  findGitHubConnectionForProject,
  listGitHubConnectionsByProject,
  listIntegrationConnectionsByProject,
  markIntegrationConnectionError,
  upsertVerifiedIntegrationConnection,
} from './integration-connection.js'

export type { SafeOperator, UpsertPrimaryOperatorInput } from './operator.js'
export {
  getPrimaryOperator,
  upsertPrimaryOperator,
  upsertPrimaryOperatorAndRevokeSessions,
} from './operator.js'

export type { CreatedSession, SafeAuthSession } from './auth-session.js'
export {
  createSession,
  revokeAllSessionsForOperator,
  revokeSessionByToken,
  validateSession,
} from './auth-session.js'

export type { AuthenticationResult, LoginCredentials } from './authenticate.js'
export { authenticateOperator } from './authenticate.js'

export type {
  CreateDocumentSourceInput,
  DocumentSource,
  RecordDocumentSourceSyncSuccessInput,
  UpdateDocumentSourceRegistryInput,
} from './document-source.js'
export {
  createDocumentSource,
  DocumentApprovalStatus,
  DocumentProvider,
  DocumentSyncStatus,
  DocumentType,
  findDocumentSourceForProject,
  listDocumentSourcesForProject,
  markDocumentSourceSyncError,
  markDocumentSourceSyncStale,
  recordDocumentSourceSyncSuccess,
  updateDocumentSourceRegistry,
} from './document-source.js'

export type {
  DocumentSnapshot,
  DocumentSnapshotSummary,
  DocumentSnapshotSyncResult,
  RecordDocumentSnapshotSyncInput,
} from './document-snapshot.js'
// Read and append only, by design — there is intentionally no snapshot
// update or delete operation on this package's public surface (NDERCC-13).
export {
  findLatestDocumentSnapshot,
  listDocumentSnapshotsForSource,
  listLatestDocumentSnapshotsForProject,
  recordDocumentSnapshotSync,
} from './document-snapshot.js'

export type {
  DecisionRecord,
  RequirementRecord,
  StrategicTruthExtractionInput,
  StrategicTruthExtractionResult,
  StrategicTruthCounts,
} from './strategic-truth.js'
export {
  extractAndReconcileStrategicTruth,
  extractStrategicTruth,
  findCurrentDecisionByCode,
  findCurrentRequirementByCode,
  listCurrentDecisionsByProject,
  listCurrentRequirementsByProject,
  listDecisionsByProject,
  listRequirementsByProject,
} from './strategic-truth.js'

// ── Operational backlog (NDERCC-17 / DEC-RIC-005) ─────────────────────────────
//
// Read and write operations only. There is deliberately no delete function
// for Sprint, Epic or Task anywhere on this surface — records leave
// circulation by reaching a terminal status and then being archived. The one
// authorized removal is `removeTaskDependency`, and only while the dependent
// task is still TODO.
//
// Nothing here computes readiness, eligibility or a "next executable item":
// READY / BLOCKED / AMBIGUOUS / CONFLICT are P0-031 / P0-032 outcomes and are
// neither persisted nor derived in this slice.

export type { CreateSprintInput, Sprint, UpdateSprintPlanningInput } from './sprint.js'
export {
  archiveSprint,
  createSprint,
  findSprintByCode,
  findSprintForProject,
  listSprintsForProject,
  transitionSprintStatus,
  updateSprintPlanning,
} from './sprint.js'

export type { CreateEpicInput, Epic, UpdateEpicPlanningInput } from './epic.js'
export {
  archiveEpic,
  createEpic,
  findEpicByCode,
  findEpicForProject,
  listEpicsForProject,
  listEpicsForSprint,
  transitionEpicStatus,
  updateEpicPlanning,
} from './epic.js'

export type { CreateTaskInput, Task, UpdateTaskPlanningInput } from './task.js'
export {
  archiveTask,
  createTask,
  findTaskByCode,
  findTaskForProject,
  listTasksForEpic,
  listTasksForProject,
  listTasksForSprint,
  readTaskAcceptanceCriteria,
  transitionTaskStatus,
  updateTaskPlanning,
} from './task.js'

export type { TaskDependency, TaskDependencyEdge } from './task-dependency.js'
export {
  addTaskDependency,
  listTaskDependenciesForProject,
  listTaskDependents,
  listTaskPrerequisites,
  removeTaskDependency,
} from './task-dependency.js'

// ── Spec-Driven Development layer (NDERCC-23 / DEC-RIC-010) ──────────────────
//
// Create, read and lifecycle-transition operations only. There is
// deliberately no delete function for a specification or a traceability link
// anywhere on this surface, and no update function for a specification that
// has left DRAFT — a superseded specification must stay queryable exactly as
// it was approved.
//
// Nothing here generates, validates or hashes an Execution Contract.
// `resolveImplementationSpecExecutionEligibility` states the deterministic
// precondition a later contract generator must consult; P0-041 through P0-043
// own that later behavior.

export type {
  ApproveImplementationSpecInput,
  CreateImplementationSpecInput,
  ImplementationSpec,
  ReviseImplementationSpecInput,
} from './implementation-spec.js'
export {
  approveImplementationSpec,
  createImplementationSpec,
  findApprovedImplementationSpecForTask,
  findImplementationSpecForProject,
  listImplementationSpecDecisionIds,
  listImplementationSpecLineage,
  listImplementationSpecRequirementIds,
  listImplementationSpecsForProject,
  listImplementationSpecsForTask,
  readImplementationSpecContent,
  recomputeImplementationSpecContentHash,
  rejectImplementationSpec,
  // The transaction-scoped resolver is the gate; the plain
  // `resolve…ExecutionEligibility` is a read-only projection. A caller that
  // grants authority on an eligibility answer must use the former inside its
  // own writing transaction, so the check and the write cannot be separated.
  resolveImplementationSpecEligibilityInTransaction,
  resolveImplementationSpecExecutionEligibility,
  reviseImplementationSpec,
  updateImplementationSpecDraft,
  validateImplementationSpecById,
} from './implementation-spec.js'

export {
  DuplicateImplementationSpecCodeError,
  ImplementationSpecApproverNotFoundError,
  ImplementationSpecContentFrozenError,
  ImplementationSpecNotApprovableError,
  ImplementationSpecNotFoundError,
  ImplementationSpecSupersessionRequiredError,
  ImplementationSpecTraceTargetNotFoundError,
  ImplementationSpecVersionNotIncreasingError,
  InvalidImplementationSpecInputError,
  InvalidImplementationSpecSupersessionError,
  InvalidImplementationSpecTransitionError,
} from './errors.js'

// The specification enum and every lifecycle rule come from @rick/domain
// rather than the generated Prisma client, so the domain layer stays the
// single definition and the two can never drift. The integration tests
// assert both sets agree.
export {
  canonicalSpecContent,
  canTransitionImplementationSpecStatus,
  compareSpecVersions,
  evaluateSpecExecutionEligibility,
  formatSpecVersion,
  ImplementationSpecStatus,
  isImplementationSpecContentMutable,
  isSpecVersionGreater,
  isTerminalImplementationSpecStatus,
  parseImplementationSpecContent,
  parseSpecVersion,
  SPEC_LIFECYCLE_VERSION,
  SpecEligibilityReason,
  SpecValidationCode,
  validateImplementationSpec,
} from '@rick/domain'
export type {
  CanonicalSpecInput,
  ImplementationSpecContent,
  ImplementationSpecContentInput,
  SpecEligibilityFinding,
  SpecEligibilityOutcome,
  SpecValidationFinding,
  SpecValidationOutcome,
  SpecVersion,
} from '@rick/domain'

export type { PersistedNextWorkResolverInput } from './next-work-resolver-state.js'
export {
  composeNextWorkResolverState,
  resolveNextWorkFromPersistedState,
} from './next-work-resolver-state.js'

export {
  parseStrategicTruth,
  DecisionStatus,
  RequirementPriority,
  RequirementStatus,
  RequirementType,
  STRATEGIC_TRUTH_EXTRACTOR_VERSION,
} from '@rick/domain'

// The backlog enums come from @rick/domain rather than the generated Prisma
// client, so the domain layer stays the single definition and the two can
// never drift. The integration tests assert both sets agree.
export {
  BacklogExternalProvider,
  EpicStatus,
  isDependencySatisfiedBy,
  SprintStatus,
  TASK_PRIORITY_RANK,
  taskPriorityRank,
  TaskPriority,
  TaskStatus,
  TaskType,
} from '@rick/domain'
export type {
  DecisionCandidate,
  ExtractionDiagnostic,
  ExtractionDiagnosticCode,
  ExtractionDiagnosticSeverity,
  RequirementCandidate,
  StrategicSourceLocator,
  StrategicTruthCandidate,
} from '@rick/domain'

// ── Execution Contract schema (NDERCC-37 / RIC-S3-02 / P0-040) ─────────────
//
// Types only: P0-040 defines the persistence shape. Contract generation,
// completeness/readiness and hashing/versioning remain later tasks.
export type {
  PersistedExecutionContract,
  PersistedExecutionContractTask,
} from './execution-contract.js'
