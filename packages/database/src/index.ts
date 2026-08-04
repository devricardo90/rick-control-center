/**
 * Public surface of the @rick/database package.
 *
 * Re-exports the PrismaClient singleton, the health-check utility, and the
 * initial domain persistence surface (Project, IntegrationConnection).
 *
 * NDERCC-4: persistence foundation — sprint 0.
 * NDERCC-5: initial domain and persistence model.
 * NDERCC-6: single-user authentication.
 */
export { prisma } from './client.js'
export type { DatabaseHealthResult } from './health.js'
export { checkDatabaseHealth } from './health.js'

export {
  ArchivedProjectReadOnlyError,
  DuplicateProjectKeyError,
  InvalidProjectTransitionError,
  ProjectNotFoundError,
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
} from './integration-connection.js'
export {
  createIntegrationConnection,
  listIntegrationConnectionsByProject,
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
