/**
 * Typed persistence surface for Sprint — the project-owned planning
 * container at the root of the operational backlog hierarchy.
 *
 * There is deliberately no delete operation anywhere on this surface. A
 * Sprint leaves circulation by reaching a terminal status and then being
 * archived, which keeps it queryable as history (DEC-RIC-005 §12).
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import type { PrismaClient, Sprint } from '@prisma/client'
import type { SprintStatus } from '@rick/domain'
import {
  canTransitionSprintStatus,
  isSprintPlanningMutable,
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
import {
  assertCodeAvailable,
  assertSprintSequenceAvailable,
  requireCode,
  requireOwnedSprint,
  requireSequence,
  unwrapBacklogValidation,
} from './internal/backlog-support.js'
import { requireExistingProject, withMutableProjectTransaction } from './internal/mutable-project-transaction.js'

export type { Sprint }

const KIND = 'Sprint'

export interface CreateSprintInput {
  projectId: string
  /** Immutable local identity, unique per Project. Trimmed and uppercased. */
  code: string
  title: string
  objective?: string | null
  /** Explicit planning order, unique per Project. Not an eligibility decision. */
  sequence: number
  plannedStartAt?: Date | null
  plannedEndAt?: Date | null
}

/** Creates a PLANNED sprint. Rejects an unknown or archived project, a duplicate code, and a duplicate or negative sequence — all atomically under the project lock. */
export async function createSprint(client: PrismaClient, input: CreateSprintInput): Promise<Sprint> {
  const code = requireCode(input.code, KIND)
  const title = unwrapBacklogValidation(normalizeRequiredText(input.title, 'title'), KIND)
  const objective = unwrapBacklogValidation(normalizeOptionalText(input.objective ?? null, 'objective'), KIND)
  const sequence = requireSequence(input.sequence, KIND)

  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    await assertCodeAvailable(tx, KIND, { projectId: input.projectId, code })
    await assertSprintSequenceAvailable(tx, input.projectId, sequence)

    return tx.sprint.create({
      data: {
        projectId: input.projectId,
        code,
        title,
        objective,
        sequence,
        plannedStartAt: input.plannedStartAt ?? null,
        plannedEndAt: input.plannedEndAt ?? null,
      },
    })
  })
}

/** Finds one sprint scoped to its owning project. Returns `null` when it does not exist or belongs to a different project. Reads are allowed for archived projects. */
export async function findSprintForProject(
  client: PrismaClient,
  projectId: string,
  sprintId: string,
): Promise<Sprint | null> {
  await requireExistingProject(client, projectId)

  const sprint = await client.sprint.findUnique({ where: { id: sprintId } })

  if (!sprint || sprint.projectId !== projectId) {
    return null
  }

  return sprint
}

/** Finds one sprint by its local code within a project. */
export async function findSprintByCode(
  client: PrismaClient,
  projectId: string,
  code: string,
): Promise<Sprint | null> {
  await requireExistingProject(client, projectId)

  return client.sprint.findUnique({
    where: { projectId_code: { projectId, code: requireCode(code, KIND) } },
  })
}

/**
 * Lists a project's sprints in explicit planning order. `sequence` is unique
 * per project, so it alone is already a total order; `code` and `id` follow
 * as stable tie-breakers so the order can never depend on `createdAt`.
 */
export async function listSprintsForProject(client: PrismaClient, projectId: string): Promise<Sprint[]> {
  await requireExistingProject(client, projectId)

  return client.sprint.findMany({
    where: { projectId },
    orderBy: [{ sequence: 'asc' }, { code: 'asc' }, { id: 'asc' }],
  })
}

/** Mutable while PLANNED only. `projectId`, `code` and `id` are absent by design — they are immutable for the record's whole life. */
export interface UpdateSprintPlanningInput {
  title?: string
  objective?: string | null
  sequence?: number
  plannedStartAt?: Date | null
  plannedEndAt?: Date | null
}

/** Updates structural planning fields. Rejects any change once the sprint has left PLANNED (DEC-RIC-005 §11). */
export async function updateSprintPlanning(
  client: PrismaClient,
  projectId: string,
  sprintId: string,
  input: UpdateSprintPlanningInput,
): Promise<Sprint> {
  const title = input.title !== undefined
    ? unwrapBacklogValidation(normalizeRequiredText(input.title, 'title'), KIND)
    : undefined
  const objective = input.objective !== undefined
    ? unwrapBacklogValidation(normalizeOptionalText(input.objective, 'objective'), KIND)
    : undefined
  const sequence = input.sequence !== undefined ? requireSequence(input.sequence, KIND) : undefined

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const sprint = await requireOwnedSprint(tx, projectId, sprintId)

    if (!isSprintPlanningMutable(sprint.status)) {
      throw new BacklogPlanningFrozenError(KIND, sprintId, sprint.status)
    }

    if (sequence !== undefined) {
      await assertSprintSequenceAvailable(tx, projectId, sequence, sprintId)
    }

    return tx.sprint.update({
      where: { id: sprintId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(objective !== undefined ? { objective } : {}),
        ...(sequence !== undefined ? { sequence } : {}),
        ...(input.plannedStartAt !== undefined ? { plannedStartAt: input.plannedStartAt } : {}),
        ...(input.plannedEndAt !== undefined ? { plannedEndAt: input.plannedEndAt } : {}),
      },
    })
  })
}

/**
 * Applies one lifecycle transition. Entering ACTIVE stamps `startedAt` and
 * entering COMPLETED stamps `completedAt`; cancellation stamps neither,
 * because a cancelled sprint was never completed.
 *
 * Status and timestamps move in the same UPDATE, so no observer can see a
 * COMPLETED sprint without its `completedAt`.
 */
export async function transitionSprintStatus(
  client: PrismaClient,
  projectId: string,
  sprintId: string,
  toStatus: SprintStatus,
): Promise<Sprint> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const sprint = await requireOwnedSprint(tx, projectId, sprintId)

    if (!canTransitionSprintStatus(sprint.status, toStatus)) {
      throw new InvalidBacklogTransitionError(KIND, sprintId, sprint.status, toStatus)
    }

    const effect = planningTransitionEffect(toStatus)
    const now = new Date()

    return tx.sprint.update({
      where: { id: sprintId },
      data: {
        status: toStatus,
        ...(effect.setStartedAt ? { startedAt: now } : {}),
        ...(effect.setCompletedAt ? { completedAt: now } : {}),
      },
    })
  })
}

/**
 * Logical archival, permitted only for a terminal sprint. Archiving is
 * idempotent: re-archiving preserves the original `archivedAt` rather than
 * rewriting history.
 */
export async function archiveSprint(
  client: PrismaClient,
  projectId: string,
  sprintId: string,
): Promise<Sprint> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const sprint = await requireOwnedSprint(tx, projectId, sprintId)

    if (!isTerminalSprintStatus(sprint.status)) {
      throw new BacklogNotTerminalError(KIND, sprintId, sprint.status)
    }

    if (sprint.archivedAt !== null) {
      return sprint
    }

    return tx.sprint.update({ where: { id: sprintId }, data: { archivedAt: new Date() } })
  })
}
