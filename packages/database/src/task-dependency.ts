/**
 * Typed persistence surface for TaskDependency — the directed prerequisite
 * edges between Tasks.
 *
 * `TaskDependency(taskId, dependsOnTaskId)` means `taskId` requires
 * `dependsOnTaskId`. The direction is explicit and is never inferred or
 * auto-reversed.
 *
 * Four rules guard the edge set, each enforced at the lowest layer that can
 * express it:
 *
 *   - same project — both composite foreign keys resolve through
 *     `(task id, project id)`, so PostgreSQL rejects a cross-project edge
 *     outright; this module also checks it first to return a precise error;
 *   - no self-dependency — `task_dependencies_no_self_check`;
 *   - no duplicate edge — `UNIQUE (task_id, depends_on_task_id)`;
 *   - no directed cycle — the one rule no relational constraint can express,
 *     so it is checked here with a recursive reachability query inside the
 *     same transaction that inserts the edge.
 *
 * The cycle check is sound rather than racy because every backlog mutation
 * enters through `withMutableProjectTransaction`, which holds a
 * `SELECT ... FOR UPDATE` lock on the owning project row. Two concurrent
 * inserts that would jointly close a cycle cannot interleave between the
 * check and the insert: the second one waits, then re-runs its check against
 * the first one's committed edge.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import type { Prisma, PrismaClient, Task, TaskDependency } from '@prisma/client'
import { isTaskPlanningMutable } from '@rick/domain'
import {
  CrossProjectDependencyError,
  DuplicateTaskDependencyError,
  SelfDependencyError,
  TaskDependencyCycleError,
  TaskDependencyFrozenError,
  TaskNotFoundError,
} from './errors.js'
import { requireOwnedTask } from './internal/backlog-support.js'
import { requireExistingProject, withMutableProjectTransaction } from './internal/mutable-project-transaction.js'

export type { TaskDependency }

/** One directed edge. Cross-sprint and cross-epic pairs are fine; cross-project pairs are not. */
export interface TaskDependencyEdge {
  /** The dependent task — the one that must wait. */
  taskId: string
  /** The prerequisite task — the one that must be satisfied first. */
  dependsOnTaskId: string
}

/**
 * Resolves the prerequisite without scoping the lookup to the project, so a
 * prerequisite in another project can be reported as exactly that rather
 * than as a generic not-found.
 *
 * This distinguishes "no such task" from "task in another project" only for
 * a caller who already holds the prerequisite's UUID. Since these ids are
 * random v4 UUIDs, that is not a usable existence oracle, and the precise
 * error is worth considerably more to a caller wiring up a backlog than a
 * uniformly opaque one.
 */
async function requirePrerequisite(
  tx: Prisma.TransactionClient,
  projectId: string,
  edge: TaskDependencyEdge,
): Promise<Task> {
  const prerequisite = await tx.task.findUnique({ where: { id: edge.dependsOnTaskId } })

  if (!prerequisite) {
    throw new TaskNotFoundError(edge.dependsOnTaskId)
  }

  if (prerequisite.projectId !== projectId) {
    throw new CrossProjectDependencyError(edge.taskId, edge.dependsOnTaskId)
  }

  return prerequisite
}

/** `$queryRaw` returns `unknown`; this narrows it without assuming a shape. */
function hasAnyRow(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

/**
 * True when `dependsOnTaskId` already reaches `taskId` by following
 * prerequisite edges — which is exactly the condition under which adding
 * `taskId -> dependsOnTaskId` would close a directed cycle.
 *
 * Walks the transitive prerequisites of the proposed prerequisite. `UNION`
 * (not `UNION ALL`) deduplicates, so the traversal terminates even on a
 * graph that somehow already contains a cycle. Parameters are
 * Prisma-interpolated, never string-concatenated.
 */
async function wouldCreateCycle(
  tx: Prisma.TransactionClient,
  edge: TaskDependencyEdge,
): Promise<boolean> {
  const reachable: unknown = await tx.$queryRaw`
    WITH RECURSIVE prerequisites(task_id) AS (
      SELECT depends_on_task_id
        FROM task_dependencies
       WHERE task_id = ${edge.dependsOnTaskId}::uuid
      UNION
      SELECT edges.depends_on_task_id
        FROM task_dependencies AS edges
        JOIN prerequisites ON edges.task_id = prerequisites.task_id
    )
    SELECT 1 AS closes_cycle
      FROM prerequisites
     WHERE task_id = ${edge.taskId}::uuid
     LIMIT 1
  `

  return hasAnyRow(reachable)
}

/**
 * Adds one prerequisite edge.
 *
 * Allowed only while the dependent task is TODO: once work starts, the
 * dependency set freezes along with the rest of the task's planning boundary
 * (DEC-RIC-005 §10). The prerequisite's own status is irrelevant here —
 * whether it is satisfied is a resolver question, not a persistence one.
 */
export async function addTaskDependency(
  client: PrismaClient,
  projectId: string,
  edge: TaskDependencyEdge,
): Promise<TaskDependency> {
  if (edge.taskId === edge.dependsOnTaskId) {
    throw new SelfDependencyError(edge.taskId)
  }

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const dependent = await requireOwnedTask(tx, projectId, edge.taskId)

    if (!isTaskPlanningMutable(dependent.status)) {
      throw new TaskDependencyFrozenError(edge.taskId, dependent.status)
    }

    await requirePrerequisite(tx, projectId, edge)

    const existing = await tx.taskDependency.findUnique({
      where: { taskId_dependsOnTaskId: { taskId: edge.taskId, dependsOnTaskId: edge.dependsOnTaskId } },
      select: { id: true },
    })

    if (existing) {
      throw new DuplicateTaskDependencyError(edge.taskId, edge.dependsOnTaskId)
    }

    if (await wouldCreateCycle(tx, edge)) {
      throw new TaskDependencyCycleError(edge.taskId, edge.dependsOnTaskId)
    }

    return tx.taskDependency.create({
      data: { projectId, taskId: edge.taskId, dependsOnTaskId: edge.dependsOnTaskId },
    })
  })
}

/**
 * Removes one prerequisite edge, subject to the same TODO-only freeze as
 * adding one. Returns `false` when there was no such edge, so a caller can
 * tell a real removal from a no-op instead of guessing.
 *
 * This is the only delete in the operational backlog surface. It is
 * deliberate: DEC-RIC-005 §8 authorizes removing a dependency while the
 * dependent task is TODO, whereas Sprint, Epic and Task records have no
 * hard-delete path at all.
 */
export async function removeTaskDependency(
  client: PrismaClient,
  projectId: string,
  edge: TaskDependencyEdge,
): Promise<boolean> {
  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const dependent = await requireOwnedTask(tx, projectId, edge.taskId)

    if (!isTaskPlanningMutable(dependent.status)) {
      throw new TaskDependencyFrozenError(edge.taskId, dependent.status)
    }

    const removed = await tx.taskDependency.deleteMany({
      where: { projectId, taskId: edge.taskId, dependsOnTaskId: edge.dependsOnTaskId },
    })

    return removed.count > 0
  })
}

/** Deterministic ordering for both directions of the dependency lookup. */
const DEPENDENCY_ORDER: Prisma.TaskOrderByWithRelationInput[] = [
  { sequence: 'asc' },
  { code: 'asc' },
  { id: 'asc' },
]

/**
 * The tasks this task is waiting on.
 *
 * Returns the prerequisite tasks themselves rather than the edge rows: a
 * caller reasoning about dependencies needs the prerequisites' statuses, and
 * returning edges would force every caller to make a second query.
 */
export async function listTaskPrerequisites(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<Task[]> {
  await requireExistingProject(client, projectId)

  return client.task.findMany({
    where: { projectId, dependents: { some: { taskId } } },
    orderBy: DEPENDENCY_ORDER,
  })
}

/** The reverse lookup: the tasks waiting on this one. Backed by `task_dependencies_depends_on_idx`. */
export async function listTaskDependents(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<Task[]> {
  await requireExistingProject(client, projectId)

  return client.task.findMany({
    where: { projectId, dependencies: { some: { dependsOnTaskId: taskId } } },
    orderBy: DEPENDENCY_ORDER,
  })
}

/** Lists the raw edges of a project, for callers that need the graph itself rather than one task's neighbours. */
export async function listTaskDependenciesForProject(
  client: PrismaClient,
  projectId: string,
): Promise<TaskDependency[]> {
  await requireExistingProject(client, projectId)

  return client.taskDependency.findMany({
    where: { projectId },
    orderBy: [{ taskId: 'asc' }, { dependsOnTaskId: 'asc' }],
  })
}
