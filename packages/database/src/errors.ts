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
