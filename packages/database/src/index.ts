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

export {
  parseStrategicTruth,
  DecisionStatus,
  RequirementPriority,
  RequirementStatus,
  RequirementType,
  STRATEGIC_TRUTH_EXTRACTOR_VERSION,
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
