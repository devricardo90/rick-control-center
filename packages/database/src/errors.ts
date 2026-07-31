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
