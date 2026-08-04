/**
 * Typed persistence surface for Project — the root isolation aggregate.
 *
 * Functions take an explicit `PrismaClient` rather than the package
 * singleton so callers (including tests) control which database instance
 * they operate against.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { AutonomyPolicy, BranchPolicy, Prisma } from '@prisma/client'
import type { PrismaClient, Project, ProjectStatus } from '@prisma/client'
import { ArchivedProjectReadOnlyError, DuplicateProjectKeyError, InvalidProjectTransitionError, ProjectNotFoundError } from './errors.js'

export type { Project, ProjectStatus }
// Exported as values, not just types: this is the single source of truth
// consumers (e.g. the apps/web HTTP boundary) validate enum input against,
// so a validator can never drift from the actual persisted enum set.
export { AutonomyPolicy, BranchPolicy }

export interface CreateProjectInput {
  key: string
  name: string
  description?: string
  status?: ProjectStatus
  autonomyPolicy?: AutonomyPolicy
  defaultBranchPolicy?: BranchPolicy
  workspacePath?: string
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

export async function createProject(
  client: PrismaClient,
  input: CreateProjectInput,
): Promise<Project> {
  try {
    return await client.project.create({
      data: {
        key: input.key,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.autonomyPolicy !== undefined ? { autonomyPolicy: input.autonomyPolicy } : {}),
        ...(input.defaultBranchPolicy !== undefined ? { defaultBranchPolicy: input.defaultBranchPolicy } : {}),
        ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
      },
    })
  }
  catch (err: unknown) {
    if (isUniqueConstraintViolation(err)) {
      throw new DuplicateProjectKeyError(input.key)
    }
    throw err
  }
}

export async function findProjectById(
  client: PrismaClient,
  id: string,
): Promise<Project | null> {
  return client.project.findUnique({ where: { id } })
}

export async function findProjectByKey(
  client: PrismaClient,
  key: string,
): Promise<Project | null> {
  return client.project.findUnique({ where: { key } })
}

export async function listProjects(client: PrismaClient): Promise<Project[]> {
  return client.project.findMany({ orderBy: { createdAt: 'asc' } })
}

/**
 * Editable project settings. `key`, `id`, `createdAt`, `archivedAt`, and
 * `status` are deliberately absent from this type — `key` is immutable
 * after creation (NDERCC-10), and the rest are either read-only or only
 * changeable through `transitionProjectLifecycle`. `description` and
 * `workspacePath` accept `null` to explicitly clear the field, distinct
 * from `undefined`, which leaves the existing value untouched.
 */
export interface UpdateProjectSettingsInput {
  name?: string
  description?: string | null
  autonomyPolicy?: AutonomyPolicy
  defaultBranchPolicy?: BranchPolicy
  workspacePath?: string | null
}

/**
 * Update an existing project's editable settings. Rejects (via
 * `ArchivedProjectReadOnlyError`) any attempt to edit an archived
 * project — archived is terminal, enforced here rather than only in the
 * UI, since this is a domain rule, not a presentation concern.
 */
export async function updateProjectSettings(
  client: PrismaClient,
  projectId: string,
  input: UpdateProjectSettingsInput,
): Promise<Project> {
  const current = await client.project.findUnique({ where: { id: projectId } })

  if (!current) {
    throw new ProjectNotFoundError(projectId)
  }
  if (current.status === 'ARCHIVED') {
    throw new ArchivedProjectReadOnlyError(projectId)
  }

  return client.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.autonomyPolicy !== undefined ? { autonomyPolicy: input.autonomyPolicy } : {}),
      ...(input.defaultBranchPolicy !== undefined ? { defaultBranchPolicy: input.defaultBranchPolicy } : {}),
      ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
    },
  })
}

/** The only three lifecycle commands a caller may request — never a raw target `ProjectStatus`. */
export type ProjectLifecycleAction = 'PAUSE' | 'REACTIVATE' | 'ARCHIVE'

interface LifecycleTransitionRule {
  from: readonly ProjectStatus[]
  to: ProjectStatus
}

// ARCHIVED never appears in any `from` list — that is what makes it
// terminal: every action requested against an archived project falls
// through to InvalidProjectTransitionError below, with no special-casing
// required. Same-state no-ops (ACTIVE->ACTIVE, PAUSED->PAUSED) are
// likewise impossible to express through this table, since PAUSE only
// ever originates from ACTIVE and REACTIVATE only from PAUSED.
const LIFECYCLE_TRANSITIONS: Record<ProjectLifecycleAction, LifecycleTransitionRule> = {
  PAUSE: { from: ['ACTIVE'], to: 'PAUSED' },
  REACTIVATE: { from: ['PAUSED'], to: 'ACTIVE' },
  ARCHIVE: { from: ['ACTIVE', 'PAUSED'], to: 'ARCHIVED' },
}

/**
 * Perform a lifecycle transition. Archival sets `status` and `archivedAt`
 * in the same `update` call — a single SQL UPDATE statement — so the two
 * fields can never be left inconsistent by a partial failure. An action
 * that does not apply from the project's current status (including any
 * action against an already-ARCHIVED project) throws
 * `InvalidProjectTransitionError` without writing anything.
 */
export async function transitionProjectLifecycle(
  client: PrismaClient,
  projectId: string,
  action: ProjectLifecycleAction,
): Promise<Project> {
  const current = await client.project.findUnique({ where: { id: projectId } })

  if (!current) {
    throw new ProjectNotFoundError(projectId)
  }

  const transition = LIFECYCLE_TRANSITIONS[action]

  if (!transition.from.includes(current.status)) {
    throw new InvalidProjectTransitionError(projectId, current.status, transition.to)
  }

  return client.project.update({
    where: { id: projectId },
    data: transition.to === 'ARCHIVED'
      ? { status: 'ARCHIVED', archivedAt: new Date() }
      : { status: transition.to },
  })
}
