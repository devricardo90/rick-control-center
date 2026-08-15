/**
 * Typed persistence surface for Task — the executable unit of the
 * operational backlog.
 *
 * This module stores and validates planning state. It deliberately does not
 * answer "what should be worked on next": no readiness, eligibility or
 * blocked/ambiguous/conflict computation appears here or anywhere in this
 * slice. Those are P0-031 / P0-032 concerns (NDERCC-18 / NDERCC-19).
 *
 * Priority is always explicit — there is no default, no inference from
 * wording, Jira order or creation time, and no UNSPECIFIED member to fall
 * back on (DEC-RIC-005 §7).
 *
 * No delete operation exists here by design.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import type { Prisma, PrismaClient, Task } from '@prisma/client'
import type { TaskPriority, TaskStatus, TaskType } from '@rick/domain'
import {
  canTransitionTaskStatus,
  isTaskPlanningMutable,
  isTerminalSprintStatus,
  isTerminalTaskStatus,
  normalizeOptionalText,
  normalizeRequiredText,
  taskTransitionEffect,
  validateAcceptanceCriteria,
} from '@rick/domain'
import {
  BacklogNotTerminalError,
  BacklogPlanningFrozenError,
  InvalidAcceptanceCriteriaError,
  InvalidBacklogTransitionError,
  InvalidEpicSprintOwnershipError,
} from './errors.js'
import type { ExternalIdentityFields } from './internal/backlog-support.js'
import {
  assertCodeAvailable,
  assertExternalIdentityAvailable,
  assertTaskSequenceAvailable,
  externalIdentityUpdateData,
  requireCode,
  requireExternalIdentity,
  requireExternalIdentityScope,
  requireOwnedEpic,
  requireOwnedSprint,
  requireOwnedTask,
  requireSequence,
  resolveExternalIdentityScope,
  unwrapBacklogValidation,
} from './internal/backlog-support.js'
import { requireExistingProject, withMutableProjectTransaction } from './internal/mutable-project-transaction.js'

export type { Task }

const KIND = 'Task'

/** Ordering used by every list function: explicit planning order first, then stable tie-breakers so results never depend on `createdAt`. */
const PLANNING_ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { sequence: 'asc' },
  { code: 'asc' },
  { id: 'asc' },
]

export interface CreateTaskInput extends ExternalIdentityFields {
  projectId: string
  sprintId: string
  /** Optional. When present the epic must be in the same project AND the same sprint. */
  epicId?: string | null
  code: string
  type: TaskType
  title: string
  description?: string | null
  priority: TaskPriority
  /** Explicit planning order, unique within the Sprint. */
  sequence: number
  /** Ordered array of non-empty strings. Defaults to an empty array — a valid, not-yet-ready planning record. */
  acceptanceCriteria?: unknown
}

function requireAcceptanceCriteria(value: unknown): string[] {
  const result = validateAcceptanceCriteria(value)

  if (!result.ok) {
    throw new InvalidAcceptanceCriteriaError(result.error)
  }

  return [...result.value]
}

/**
 * Reads `acceptanceCriteriaJson` back as a typed, ordered string array.
 *
 * The column is `Json`, so its static type cannot express the invariant the
 * writer enforces. Re-validating on read means a caller never has to narrow
 * `Prisma.JsonValue` itself, and a row corrupted by some future out-of-band
 * writer surfaces as a typed error instead of a silent wrong shape.
 */
export function readTaskAcceptanceCriteria(task: Task): readonly string[] {
  const result = validateAcceptanceCriteria(task.acceptanceCriteriaJson)

  if (!result.ok) {
    throw new InvalidAcceptanceCriteriaError(`stored value for task ${task.id}: ${result.error}`)
  }

  return result.value
}

/** Loads the sprint and, when given, the epic — proving both belong to this project and that the epic sits in that same sprint. */
async function resolvePlacement(
  tx: Prisma.TransactionClient,
  projectId: string,
  placement: { sprintId: string, epicId: string | null },
): Promise<void> {
  const sprint = await requireOwnedSprint(tx, projectId, placement.sprintId)

  if (isTerminalSprintStatus(sprint.status)) {
    throw new BacklogPlanningFrozenError('Sprint', sprint.id, sprint.status)
  }

  if (placement.epicId === null) {
    return
  }

  const epic = await requireOwnedEpic(tx, projectId, placement.epicId)

  if (epic.sprintId !== placement.sprintId) {
    throw new InvalidEpicSprintOwnershipError(epic.id, placement.sprintId)
  }
}

/** Creates a TODO task. Placement, identity, ordering and acceptance criteria are all validated atomically under the project lock. */
export async function createTask(client: PrismaClient, input: CreateTaskInput): Promise<Task> {
  const code = requireCode(input.code, KIND)
  const title = unwrapBacklogValidation(normalizeRequiredText(input.title, 'title'), KIND)
  const description = unwrapBacklogValidation(normalizeOptionalText(input.description ?? null, 'description'), KIND)
  const sequence = requireSequence(input.sequence, KIND)
  const acceptanceCriteria = requireAcceptanceCriteria(input.acceptanceCriteria ?? [])
  const epicId = input.epicId ?? null
  requireExternalIdentity(input, KIND)

  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    await resolvePlacement(tx, input.projectId, { sprintId: input.sprintId, epicId })
    await assertCodeAvailable(tx, KIND, { projectId: input.projectId, code })
    await assertTaskSequenceAvailable(tx, input.sprintId, sequence)
    await assertExternalIdentityAvailable(tx, KIND, {
      projectId: input.projectId,
      externalProvider: input.externalProvider,
      externalId: input.externalId,
    })

    return tx.task.create({
      data: {
        projectId: input.projectId,
        sprintId: input.sprintId,
        epicId,
        code,
        type: input.type,
        title,
        description,
        priority: input.priority,
        sequence,
        acceptanceCriteriaJson: acceptanceCriteria,
        externalProvider: input.externalProvider ?? null,
        externalId: input.externalId ?? null,
        externalKey: input.externalKey ?? null,
        externalUrl: input.externalUrl ?? null,
      },
    })
  })
}

/** Finds one task scoped to its owning project. Returns `null` when it does not exist or belongs to a different project. */
export async function findTaskForProject(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<Task | null> {
  await requireExistingProject(client, projectId)

  const task = await client.task.findUnique({ where: { id: taskId } })

  if (!task || task.projectId !== projectId) {
    return null
  }

  return task
}

/** Finds one task by its local code within a project — the lookup that stays valid whether or not Jira is connected. */
export async function findTaskByCode(
  client: PrismaClient,
  projectId: string,
  code: string,
): Promise<Task | null> {
  await requireExistingProject(client, projectId)

  return client.task.findUnique({
    where: { projectId_code: { projectId, code: requireCode(code, KIND) } },
  })
}

/** Lists a sprint's tasks in explicit planning order. */
export async function listTasksForSprint(
  client: PrismaClient,
  projectId: string,
  sprintId: string,
): Promise<Task[]> {
  await requireExistingProject(client, projectId)

  return client.task.findMany({ where: { projectId, sprintId }, orderBy: PLANNING_ORDER })
}

/** Lists an epic's tasks in explicit planning order. */
export async function listTasksForEpic(
  client: PrismaClient,
  projectId: string,
  epicId: string,
): Promise<Task[]> {
  await requireExistingProject(client, projectId)

  return client.task.findMany({ where: { projectId, epicId }, orderBy: PLANNING_ORDER })
}

/** Lists every task in a project, ordered by sprint sequence then task planning order. */
export async function listTasksForProject(client: PrismaClient, projectId: string): Promise<Task[]> {
  await requireExistingProject(client, projectId)

  return client.task.findMany({
    where: { projectId },
    orderBy: [{ sprint: { sequence: 'asc' } }, ...PLANNING_ORDER],
  })
}

/**
 * Mutable while TODO only, and only these fields — `id`, `projectId`, `code`
 * and `createdAt` are immutable for the record's whole life, so no input
 * shape can express changing them.
 */
export interface UpdateTaskPlanningInput extends ExternalIdentityFields {
  sprintId?: string
  epicId?: string | null
  type?: TaskType
  title?: string
  description?: string | null
  priority?: TaskPriority
  sequence?: number
  acceptanceCriteria?: unknown
}

interface ResolvedTaskPlanning {
  readonly sprintId: string
  readonly epicId: string | null
  readonly sequence: number
}

/** The already-validated free-text and criteria fields, kept separate from the raw input so the payload builder does no validation of its own. */
interface NormalizedTaskFields {
  readonly title: string | undefined
  readonly description: string | null | undefined
  readonly acceptanceCriteria: string[] | undefined
}

/** Only the keys the caller actually supplied, so an omitted planning field is left exactly as it was. */
interface TaskPlanningUpdateData {
  type?: TaskType
  title?: string
  description?: string | null
  priority?: TaskPriority
  acceptanceCriteriaJson?: string[]
}

function taskPlanningUpdateData(
  input: UpdateTaskPlanningInput,
  normalized: NormalizedTaskFields,
): TaskPlanningUpdateData {
  return {
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(normalized.title !== undefined ? { title: normalized.title } : {}),
    ...(normalized.description !== undefined ? { description: normalized.description } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(normalized.acceptanceCriteria !== undefined
      ? { acceptanceCriteriaJson: normalized.acceptanceCriteria }
      : {}),
  }
}

/** Combines the requested changes with the task's current values, so partial updates keep a coherent placement. */
function resolveTaskPlanning(task: Task, input: UpdateTaskPlanningInput): ResolvedTaskPlanning {
  return {
    sprintId: input.sprintId ?? task.sprintId,
    epicId: input.epicId === undefined ? task.epicId : input.epicId,
    sequence: input.sequence === undefined ? task.sequence : requireSequence(input.sequence, KIND),
  }
}

/**
 * Updates planning fields. Rejects every change once the task has left TODO:
 * a task that has started work cannot be silently reparented, reprioritized
 * or re-scoped (DEC-RIC-005 §11).
 */
export async function updateTaskPlanning(
  client: PrismaClient,
  projectId: string,
  taskId: string,
  input: UpdateTaskPlanningInput,
): Promise<Task> {
  const title = input.title !== undefined
    ? unwrapBacklogValidation(normalizeRequiredText(input.title, 'title'), KIND)
    : undefined
  const description = input.description !== undefined
    ? unwrapBacklogValidation(normalizeOptionalText(input.description, 'description'), KIND)
    : undefined
  const acceptanceCriteria = input.acceptanceCriteria !== undefined
    ? requireAcceptanceCriteria(input.acceptanceCriteria)
    : undefined

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const task = await requireOwnedTask(tx, projectId, taskId)

    if (!isTaskPlanningMutable(task.status)) {
      throw new BacklogPlanningFrozenError(KIND, taskId, task.status)
    }

    const planning = resolveTaskPlanning(task, input)
    await resolvePlacement(tx, projectId, planning)
    await assertTaskSequenceAvailable(tx, planning.sprintId, planning.sequence, taskId)

    // Validated against the merged result, not the input alone — only the
    // merged pair reveals whether the task ends up with an id and no provider.
    const externalScope = resolveExternalIdentityScope(projectId, input, task)
    requireExternalIdentityScope(externalScope, KIND)
    await assertExternalIdentityAvailable(tx, KIND, externalScope, taskId)

    return tx.task.update({
      where: { id: taskId },
      data: {
        sprintId: planning.sprintId,
        epicId: planning.epicId,
        sequence: planning.sequence,
        ...taskPlanningUpdateData(input, { title, description, acceptanceCriteria }),
        ...externalIdentityUpdateData(input),
      },
    })
  })
}

/**
 * Applies one lifecycle transition. Entering IN_PROGRESS stamps `startedAt`;
 * entering DONE stamps `completedAt`; CANCELLED stamps neither, because a
 * cancelled task was never completed.
 *
 * Crossing TODO -> IN_PROGRESS is also the moment the task's planning fields
 * and its dependency set freeze.
 */
export async function transitionTaskStatus(
  client: PrismaClient,
  projectId: string,
  taskId: string,
  toStatus: TaskStatus,
): Promise<Task> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const task = await requireOwnedTask(tx, projectId, taskId)

    if (!canTransitionTaskStatus(task.status, toStatus)) {
      throw new InvalidBacklogTransitionError(KIND, taskId, task.status, toStatus)
    }

    const effect = taskTransitionEffect(toStatus)
    const now = new Date()

    return tx.task.update({
      where: { id: taskId },
      data: {
        status: toStatus,
        ...(effect.setStartedAt ? { startedAt: now } : {}),
        ...(effect.setCompletedAt ? { completedAt: now } : {}),
      },
    })
  })
}

/** Logical archival, permitted only for a terminal task and idempotent on repeat. */
export async function archiveTask(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<Task> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const task = await requireOwnedTask(tx, projectId, taskId)

    if (!isTerminalTaskStatus(task.status)) {
      throw new BacklogNotTerminalError(KIND, taskId, task.status)
    }

    if (task.archivedAt !== null) {
      return task
    }

    return tx.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } })
  })
}
