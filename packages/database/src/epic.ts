/**
 * Typed persistence surface for Epic — a project-owned grouping of Tasks
 * inside exactly one Sprint.
 *
 * The optional `external*` fields are Jira provenance only. Nothing in this
 * module (or anywhere in this package) calls a Jira API, reads from one, or
 * writes to one: `externalKey` is mutable display metadata, and the local
 * UUID plus local `code` remain the only identity (DEC-RIC-005 §4).
 * Synchronization is owned by P1-033/P1-034.
 *
 * No delete operation exists here by design.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import type { Epic, PrismaClient } from '@prisma/client'
import type { EpicStatus } from '@rick/domain'
import {
  canTransitionEpicStatus,
  isEpicPlanningMutable,
  isTerminalEpicStatus,
  isTerminalSprintStatus,
  normalizeOptionalText,
  normalizeRequiredText,
  planningTransitionEffect,
} from '@rick/domain'
import {
  BacklogNotTerminalError,
  BacklogPlanningFrozenError,
  InvalidBacklogTransitionError,
} from './errors.js'
import type { ExternalIdentityFields } from './internal/backlog-support.js'
import {
  assertCodeAvailable,
  assertEpicSequenceAvailable,
  assertExternalIdentityAvailable,
  externalIdentityUpdateData,
  requireCode,
  requireExternalIdentity,
  requireExternalIdentityScope,
  requireOwnedEpic,
  requireOwnedSprint,
  requireSequence,
  resolveExternalIdentityScope,
  unwrapBacklogValidation,
} from './internal/backlog-support.js'
import { requireExistingProject, withMutableProjectTransaction } from './internal/mutable-project-transaction.js'

export type { Epic }

const KIND = 'Epic'

export interface CreateEpicInput extends ExternalIdentityFields {
  projectId: string
  sprintId: string
  code: string
  title: string
  description?: string | null
  /** Explicit planning order, unique within the Sprint. */
  sequence: number
}

/**
 * Creates a PLANNED epic inside an existing sprint of the same project.
 *
 * A sprint that has already reached a terminal status cannot receive new
 * epics: adding work to a COMPLETED or CANCELLED sprint would be silent
 * replanning of a closed record. Adding an epic to an ACTIVE sprint stays
 * allowed — only the sprint's own structural fields freeze at ACTIVE.
 */
export async function createEpic(client: PrismaClient, input: CreateEpicInput): Promise<Epic> {
  const code = requireCode(input.code, KIND)
  const title = unwrapBacklogValidation(normalizeRequiredText(input.title, 'title'), KIND)
  const description = unwrapBacklogValidation(normalizeOptionalText(input.description ?? null, 'description'), KIND)
  const sequence = requireSequence(input.sequence, KIND)
  requireExternalIdentity(input, KIND)

  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    const sprint = await requireOwnedSprint(tx, input.projectId, input.sprintId)

    if (isTerminalSprintStatus(sprint.status)) {
      throw new BacklogPlanningFrozenError('Sprint', sprint.id, sprint.status)
    }

    await assertCodeAvailable(tx, KIND, { projectId: input.projectId, code })
    await assertEpicSequenceAvailable(tx, input.sprintId, sequence)
    await assertExternalIdentityAvailable(tx, KIND, {
      projectId: input.projectId,
      externalProvider: input.externalProvider,
      externalId: input.externalId,
    })

    return tx.epic.create({
      data: {
        projectId: input.projectId,
        sprintId: input.sprintId,
        code,
        title,
        description,
        sequence,
        externalProvider: input.externalProvider ?? null,
        externalId: input.externalId ?? null,
        externalKey: input.externalKey ?? null,
        externalUrl: input.externalUrl ?? null,
      },
    })
  })
}

/** Finds one epic scoped to its owning project. Returns `null` when it does not exist or belongs to a different project. */
export async function findEpicForProject(
  client: PrismaClient,
  projectId: string,
  epicId: string,
): Promise<Epic | null> {
  await requireExistingProject(client, projectId)

  const epic = await client.epic.findUnique({ where: { id: epicId } })

  if (!epic || epic.projectId !== projectId) {
    return null
  }

  return epic
}

/** Finds one epic by its local code within a project. */
export async function findEpicByCode(
  client: PrismaClient,
  projectId: string,
  code: string,
): Promise<Epic | null> {
  await requireExistingProject(client, projectId)

  return client.epic.findUnique({
    where: { projectId_code: { projectId, code: requireCode(code, KIND) } },
  })
}

/** Lists a sprint's epics in explicit planning order, with stable tie-breakers so ordering never depends on `createdAt`. Returns `[]` for a sprint in another project rather than leaking its contents. */
export async function listEpicsForSprint(
  client: PrismaClient,
  projectId: string,
  sprintId: string,
): Promise<Epic[]> {
  await requireExistingProject(client, projectId)

  return client.epic.findMany({
    where: { projectId, sprintId },
    orderBy: [{ sequence: 'asc' }, { code: 'asc' }, { id: 'asc' }],
  })
}

/** Lists every epic in a project, ordered by sprint sequence then epic sequence. */
export async function listEpicsForProject(client: PrismaClient, projectId: string): Promise<Epic[]> {
  await requireExistingProject(client, projectId)

  return client.epic.findMany({
    where: { projectId },
    orderBy: [{ sprint: { sequence: 'asc' } }, { sequence: 'asc' }, { code: 'asc' }, { id: 'asc' }],
  })
}

/** Mutable while PLANNED only. `code` and `projectId` are absent by design. */
export interface UpdateEpicPlanningInput extends ExternalIdentityFields {
  title?: string
  description?: string | null
  sequence?: number
}

/** Updates structural planning fields. Rejects any change once the epic has left PLANNED. */
export async function updateEpicPlanning(
  client: PrismaClient,
  projectId: string,
  epicId: string,
  input: UpdateEpicPlanningInput,
): Promise<Epic> {
  const title = input.title !== undefined
    ? unwrapBacklogValidation(normalizeRequiredText(input.title, 'title'), KIND)
    : undefined
  const description = input.description !== undefined
    ? unwrapBacklogValidation(normalizeOptionalText(input.description, 'description'), KIND)
    : undefined
  const sequence = input.sequence !== undefined ? requireSequence(input.sequence, KIND) : undefined

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const epic = await requireOwnedEpic(tx, projectId, epicId)

    if (!isEpicPlanningMutable(epic.status)) {
      throw new BacklogPlanningFrozenError(KIND, epicId, epic.status)
    }

    if (sequence !== undefined) {
      await assertEpicSequenceAvailable(tx, epic.sprintId, sequence, epicId)
    }

    // Validated against the merged result, not the input alone — only the
    // merged pair reveals whether the epic ends up with an id and no provider.
    const externalScope = resolveExternalIdentityScope(projectId, input, epic)
    requireExternalIdentityScope(externalScope, KIND)
    await assertExternalIdentityAvailable(tx, KIND, externalScope, epicId)

    return tx.epic.update({
      where: { id: epicId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(sequence !== undefined ? { sequence } : {}),
        ...externalIdentityUpdateData(input),
      },
    })
  })
}

/** Applies one lifecycle transition, stamping `startedAt` on ACTIVE and `completedAt` on COMPLETED in the same UPDATE. Cancellation stamps neither. */
export async function transitionEpicStatus(
  client: PrismaClient,
  projectId: string,
  epicId: string,
  toStatus: EpicStatus,
): Promise<Epic> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const epic = await requireOwnedEpic(tx, projectId, epicId)

    if (!canTransitionEpicStatus(epic.status, toStatus)) {
      throw new InvalidBacklogTransitionError(KIND, epicId, epic.status, toStatus)
    }

    const effect = planningTransitionEffect(toStatus)
    const now = new Date()

    return tx.epic.update({
      where: { id: epicId },
      data: {
        status: toStatus,
        ...(effect.setStartedAt ? { startedAt: now } : {}),
        ...(effect.setCompletedAt ? { completedAt: now } : {}),
      },
    })
  })
}

/** Logical archival, permitted only for a terminal epic and idempotent on repeat. */
export async function archiveEpic(
  client: PrismaClient,
  projectId: string,
  epicId: string,
): Promise<Epic> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const epic = await requireOwnedEpic(tx, projectId, epicId)

    if (!isTerminalEpicStatus(epic.status)) {
      throw new BacklogNotTerminalError(KIND, epicId, epic.status)
    }

    if (epic.archivedAt !== null) {
      return epic
    }

    return tx.epic.update({ where: { id: epicId }, data: { archivedAt: new Date() } })
  })
}
