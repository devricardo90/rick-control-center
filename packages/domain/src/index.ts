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
