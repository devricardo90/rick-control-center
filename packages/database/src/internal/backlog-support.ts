/**
 * Shared internals for the operational backlog persistence surface.
 *
 * Every backlog mutation runs inside `withMutableProjectTransaction`, which
 * takes a `SELECT ... FOR UPDATE` row lock on the owning project. That lock
 * does more work here than it does for strategic documents: because every
 * uniqueness scope in this slice (code per Project, sequence per
 * Project/Sprint, external identity per Project, dependency pair, and the
 * dependency graph itself) lives entirely inside one Project, serializing on
 * the project row makes an in-transaction pre-check as authoritative as a
 * database constraint. That is what lets these operations return precise
 * typed errors instead of parsing Prisma constraint metadata, and it is what
 * makes the cycle check in `task-dependency.ts` sound rather than racy.
 *
 * The database constraints are still there and still enforced — they are the
 * backstop that keeps the invariant true even for a writer that bypasses
 * this module.
 *
 * Internal to @rick/database — deliberately not re-exported from src/index.ts.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import type { Epic, Prisma, Sprint, Task } from '@prisma/client'
import type { BacklogValidation } from '@rick/domain'
import { normalizeBacklogCode, validateExternalIdentity, validateSequence } from '@rick/domain'
import type { BacklogRecordKind } from '../errors.js'
import {
  DuplicateBacklogCodeError,
  DuplicateBacklogExternalIdError,
  DuplicateBacklogSequenceError,
  EpicNotFoundError,
  InvalidBacklogInputError,
  SprintNotFoundError,
  TaskNotFoundError,
} from '../errors.js'

/** Converts a domain validation result into a value, or throws the persistence layer's typed error carrying the domain's reason. */
export function unwrapBacklogValidation<T>(
  result: BacklogValidation<T>,
  kind: BacklogRecordKind,
): T {
  if (!result.ok) {
    throw new InvalidBacklogInputError(kind, result.error)
  }

  return result.value
}

export function requireCode(raw: string, kind: BacklogRecordKind): string {
  return unwrapBacklogValidation(normalizeBacklogCode(raw), kind)
}

export function requireSequence(value: number, kind: BacklogRecordKind): number {
  return unwrapBacklogValidation(validateSequence(value), kind)
}

/**
 * External provenance fields. `externalKey` and `externalUrl` are
 * descriptive metadata and are never identity.
 *
 * `| undefined` is explicit on every field so a partial update can express
 * "leave alone" (`undefined`) separately from "clear" (`null`).
 */
export interface ExternalIdentityFields {
  readonly externalProvider?: 'JIRA' | null | undefined
  readonly externalId?: string | null | undefined
  readonly externalKey?: string | null | undefined
  readonly externalUrl?: string | null | undefined
}

export function requireExternalIdentity(
  input: ExternalIdentityFields,
  kind: BacklogRecordKind,
): void {
  unwrapBacklogValidation(validateExternalIdentity(input), kind)
}

/** The provenance half of an update payload. Optional keys are present only when the caller actually supplied them, so an omitted field is never silently written as null. */
export interface ExternalIdentityUpdate {
  externalProvider?: 'JIRA' | null
  externalId?: string | null
  externalKey?: string | null
  externalUrl?: string | null
}

/** Shared by the Epic and Task update paths so both write provenance identically. */
export function externalIdentityUpdateData(input: ExternalIdentityFields): ExternalIdentityUpdate {
  return {
    ...(input.externalProvider !== undefined ? { externalProvider: input.externalProvider } : {}),
    ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
    ...(input.externalKey !== undefined ? { externalKey: input.externalKey } : {}),
    ...(input.externalUrl !== undefined ? { externalUrl: input.externalUrl } : {}),
  }
}

// ── Project-scoped loaders ────────────────────────────────────────────────────
//
// A record that belongs to a different project is treated identically to one
// that does not exist, so no caller can use these to probe another project.

export async function requireOwnedSprint(
  tx: Prisma.TransactionClient,
  projectId: string,
  sprintId: string,
): Promise<Sprint> {
  const sprint = await tx.sprint.findUnique({ where: { id: sprintId } })

  if (!sprint || sprint.projectId !== projectId) {
    throw new SprintNotFoundError(sprintId)
  }

  return sprint
}

export async function requireOwnedEpic(
  tx: Prisma.TransactionClient,
  projectId: string,
  epicId: string,
): Promise<Epic> {
  const epic = await tx.epic.findUnique({ where: { id: epicId } })

  if (!epic || epic.projectId !== projectId) {
    throw new EpicNotFoundError(epicId)
  }

  return epic
}

export async function requireOwnedTask(
  tx: Prisma.TransactionClient,
  projectId: string,
  taskId: string,
): Promise<Task> {
  const task = await tx.task.findUnique({ where: { id: taskId } })

  if (!task || task.projectId !== projectId) {
    throw new TaskNotFoundError(taskId)
  }

  return task
}

// ── Uniqueness pre-checks ─────────────────────────────────────────────────────
//
// Sound because the caller already holds the project row lock. `excludeId`
// lets an update re-assert its own current value without colliding with
// itself.

interface UniquenessProbe {
  readonly existingId: string | undefined
  readonly excludeId: string | undefined
}

function collides({ existingId, excludeId }: UniquenessProbe): boolean {
  return existingId !== undefined && existingId !== excludeId
}

export async function assertCodeAvailable(
  tx: Prisma.TransactionClient,
  kind: BacklogRecordKind,
  scope: { projectId: string, code: string },
  excludeId?: string,
): Promise<void> {
  const existing = await findByCode(tx, kind, scope)

  if (collides({ existingId: existing?.id, excludeId })) {
    throw new DuplicateBacklogCodeError(kind, scope.projectId, scope.code)
  }
}

async function findByCode(
  tx: Prisma.TransactionClient,
  kind: BacklogRecordKind,
  scope: { projectId: string, code: string },
): Promise<{ id: string } | null> {
  const where = { projectId_code: { projectId: scope.projectId, code: scope.code } }

  if (kind === 'Sprint') {
    return tx.sprint.findUnique({ where, select: { id: true } })
  }
  if (kind === 'Epic') {
    return tx.epic.findUnique({ where, select: { id: true } })
  }
  return tx.task.findUnique({ where, select: { id: true } })
}

/** Sprint sequence is unique per Project; Epic and Task sequences are unique per Sprint. */
export async function assertSprintSequenceAvailable(
  tx: Prisma.TransactionClient,
  projectId: string,
  sequence: number,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.sprint.findUnique({
    where: { projectId_sequence: { projectId, sequence } },
    select: { id: true },
  })

  if (collides({ existingId: existing?.id, excludeId })) {
    throw new DuplicateBacklogSequenceError('Sprint', sequence)
  }
}

export async function assertEpicSequenceAvailable(
  tx: Prisma.TransactionClient,
  sprintId: string,
  sequence: number,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.epic.findUnique({
    where: { sprintId_sequence: { sprintId, sequence } },
    select: { id: true },
  })

  if (collides({ existingId: existing?.id, excludeId })) {
    throw new DuplicateBacklogSequenceError('Epic', sequence)
  }
}

export async function assertTaskSequenceAvailable(
  tx: Prisma.TransactionClient,
  sprintId: string,
  sequence: number,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.task.findUnique({
    where: { sprintId_sequence: { sprintId, sequence } },
    select: { id: true },
  })

  if (collides({ existingId: existing?.id, excludeId })) {
    throw new DuplicateBacklogSequenceError('Task', sequence)
  }
}

export interface ExternalIdentityScope {
  readonly projectId: string
  readonly externalProvider: 'JIRA' | null | undefined
  readonly externalId: string | null | undefined
}

/**
 * The (provider, id) pair the record will hold after an update — what the
 * duplicate check must test, since a partial update keeps whichever half it
 * did not supply.
 *
 * Uses an explicit `undefined` test rather than `??`: `null` here means
 * "clear this field", and `??` would treat that as "not supplied" and fall
 * back to the current value, checking the wrong identity and then writing a
 * different one.
 */
export function resolveExternalIdentityScope(
  projectId: string,
  input: ExternalIdentityFields,
  current: ExternalIdentityFields,
): ExternalIdentityScope {
  return {
    projectId,
    externalProvider: input.externalProvider === undefined ? current.externalProvider : input.externalProvider,
    externalId: input.externalId === undefined ? current.externalId : input.externalId,
  }
}

/**
 * Validates the identity the record will actually end up with.
 *
 * An update must be checked against the merged result, not against its own
 * input: setting only `externalId` on a record that already carries a
 * provider is legitimate, while clearing the provider and leaving the id
 * behind is not — and neither case is visible from the input alone.
 */
export function requireExternalIdentityScope(
  scope: ExternalIdentityScope,
  kind: BacklogRecordKind,
): void {
  unwrapBacklogValidation(
    validateExternalIdentity({
      externalProvider: scope.externalProvider,
      externalId: scope.externalId,
    }),
    kind,
  )
}

export async function assertExternalIdentityAvailable(
  tx: Prisma.TransactionClient,
  kind: 'Epic' | 'Task',
  scope: ExternalIdentityScope,
  excludeId?: string,
): Promise<void> {
  const { projectId, externalProvider, externalId } = scope

  // Nothing to reserve: Postgres treats multiple NULLs in a unique index as
  // non-conflicting, so records without provenance never collide.
  if (externalProvider === null || externalProvider === undefined || externalId === null || externalId === undefined) {
    return
  }

  const where = { projectId_externalProvider_externalId: { projectId, externalProvider, externalId } }
  const existing = kind === 'Epic'
    ? await tx.epic.findUnique({ where, select: { id: true } })
    : await tx.task.findUnique({ where, select: { id: true } })

  if (collides({ existingId: existing?.id, excludeId })) {
    throw new DuplicateBacklogExternalIdError(kind, projectId, externalId)
  }
}
