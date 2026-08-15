/**
 * @rick/domain
 *
 * Core domain layer: entities, value objects, state machines, invariants,
 * and domain events. Framework-agnostic and infrastructure-free.
 *
 * Sprint 0 stub — domain models will be introduced in Sprint 1+.
 */

export type { ProjectId, ContractId, RunId, AuditId, Result, Ok, Err } from '@rick/shared'

export {
  DecisionStatus,
  hasBlockingDiagnostics,
  parseStrategicTruth,
  RequirementPriority,
  RequirementStatus,
  RequirementType,
  STRATEGIC_TRUTH_EXTRACTOR_VERSION,
} from './strategic-truth.js'
export type {
  DecisionCandidate,
  ExtractionDiagnostic,
  ExtractionDiagnosticCode,
  ExtractionDiagnosticSeverity,
  RequirementCandidate,
  StrategicSourceLocator,
  StrategicTruthCandidate,
} from './strategic-truth.js'

export {
  BacklogExternalProvider,
  canTransitionEpicStatus,
  canTransitionSprintStatus,
  canTransitionTaskStatus,
  EpicStatus,
  isDependencySatisfiedBy,
  isEpicPlanningMutable,
  isSprintPlanningMutable,
  isTaskPlanningMutable,
  isTerminalEpicStatus,
  isTerminalSprintStatus,
  isTerminalTaskStatus,
  normalizeBacklogCode,
  normalizeOptionalText,
  normalizeRequiredText,
  planningTransitionEffect,
  SprintStatus,
  TASK_PRIORITY_RANK,
  taskPriorityRank,
  TaskPriority,
  TaskStatus,
  taskTransitionEffect,
  TaskType,
  validateAcceptanceCriteria,
  validateExternalIdentity,
  validateSequence,
} from './operational-backlog.js'
export type {
  BacklogValidation,
  ExternalIdentityInput,
  LifecycleTimestampEffect,
} from './operational-backlog.js'
