/**
 * Public surface of the @rick/database package.
 *
 * Re-exports the PrismaClient singleton, the health-check utility, and the
 * initial domain persistence surface (Project, IntegrationConnection).
 *
 * NDERCC-4: persistence foundation — sprint 0.
 * NDERCC-5: initial domain and persistence model.
 */
export { prisma } from './client.js'
export type { DatabaseHealthResult } from './health.js'
export { checkDatabaseHealth } from './health.js'

export { DuplicateProjectKeyError, ProjectNotFoundError } from './errors.js'

export type {
  AutonomyPolicy,
  BranchPolicy,
  CreateProjectInput,
  Project,
  ProjectStatus,
} from './project.js'
export { createProject, findProjectById, findProjectByKey, listProjects } from './project.js'

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
