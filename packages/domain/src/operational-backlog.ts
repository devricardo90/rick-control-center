/**
 * Deterministic operational-backlog rules: lifecycle state machines,
 * priority ranking, freeze points and planning-field validation for Sprint,
 * Epic, Task and TaskDependency.
 *
 * Pure and infrastructure-free — no Prisma, no database, no I/O, no clock.
 * Every rule here is a total function of its arguments, so the same input
 * always produces the same decision. The persistence layer
 * (`@rick/database`) translates the `Err` reasons produced here into its own
 * typed error classes rather than restating the rules, so a rule can never
 * drift between the two layers.
 *
 * Deliberately absent: any notion of readiness, eligibility or "next
 * executable item". READY / BLOCKED / AMBIGUOUS / CONFLICT are resolver and
 * diagnostic outcomes owned by P0-031 / P0-032 (NDERCC-18 / NDERCC-19) and
 * are neither computed nor persisted here.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import { err, ok } from '@rick/shared'
import type { Result } from '@rick/shared'

// ── Lifecycle and classification enums ────────────────────────────────────────

// Declared here rather than imported from the generated Prisma client: the
// domain layer must not depend on infrastructure. `@rick/database` re-exports
// the Prisma enums under the same names and the integration tests assert the
// two sets agree.

export const SprintStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type SprintStatus = typeof SprintStatus[keyof typeof SprintStatus]

export const EpicStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type EpicStatus = typeof EpicStatus[keyof typeof EpicStatus]

export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_REVIEW: 'IN_REVIEW',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const
export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus]

export const TaskType = {
  STORY: 'STORY',
  TASK: 'TASK',
  BUG: 'BUG',
  SPIKE: 'SPIKE',
  CHORE: 'CHORE',
} as const
export type TaskType = typeof TaskType[keyof typeof TaskType]

/** P0 is the highest priority. There is deliberately no UNSPECIFIED member — an operational Task always carries an explicit, human-set priority (DEC-RIC-005 §7). */
export const TaskPriority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
} as const
export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority]

/** Provenance only — never the local identity of a record (DEC-RIC-005 §4). */
export const BacklogExternalProvider = {
  JIRA: 'JIRA',
} as const
export type BacklogExternalProvider = typeof BacklogExternalProvider[keyof typeof BacklogExternalProvider]

// ── Lifecycle state machines ──────────────────────────────────────────────────

/** The four states Sprint and Epic share. They remain distinct exported types so one can evolve later without silently redefining the other. */
type PlanningStatus = SprintStatus | EpicStatus

const PLANNING_TRANSITIONS: Readonly<Record<PlanningStatus, readonly PlanningStatus[]>> = {
  PLANNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  TODO: ['IN_PROGRESS', 'CANCELLED'],
  // IN_REVIEW -> IN_PROGRESS is the rework edge: review requesting changes
  // must not have to cancel and recreate the Task.
  IN_PROGRESS: ['IN_REVIEW', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
}

export function canTransitionSprintStatus(from: SprintStatus, to: SprintStatus): boolean {
  return PLANNING_TRANSITIONS[from].includes(to)
}

export function canTransitionEpicStatus(from: EpicStatus, to: EpicStatus): boolean {
  return PLANNING_TRANSITIONS[from].includes(to)
}

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to)
}

/** A state with no outgoing transitions. COMPLETED/CANCELLED for Sprint and Epic; DONE/CANCELLED for Task. */
export function isTerminalSprintStatus(status: SprintStatus): boolean {
  return PLANNING_TRANSITIONS[status].length === 0
}

export function isTerminalEpicStatus(status: EpicStatus): boolean {
  return PLANNING_TRANSITIONS[status].length === 0
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TASK_TRANSITIONS[status].length === 0
}

// ── Freeze points ─────────────────────────────────────────────────────────────

/**
 * Task planning fields — sprint/epic placement, title, description, type,
 * priority, sequence, acceptance criteria and dependencies — are mutable
 * only while TODO. Once work starts, replanning must be an explicit governed
 * operation rather than a silent edit (DEC-RIC-005 §11).
 */
export function isTaskPlanningMutable(status: TaskStatus): boolean {
  return status === TaskStatus.TODO
}

/** Sprint and Epic structural fields (hierarchy, code, sequence) are mutable only while PLANNED. */
export function isSprintPlanningMutable(status: SprintStatus): boolean {
  return status === SprintStatus.PLANNED
}

export function isEpicPlanningMutable(status: EpicStatus): boolean {
  return status === EpicStatus.PLANNED
}

// ── Priority ranking ──────────────────────────────────────────────────────────

/** Lower rank sorts first. Exposed as data so later ranking code cannot invent a different order. */
export const TASK_PRIORITY_RANK: Readonly<Record<TaskPriority, number>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
}

export function taskPriorityRank(priority: TaskPriority): number {
  return TASK_PRIORITY_RANK[priority]
}

// ── Lifecycle timestamp effects ───────────────────────────────────────────────

/**
 * Which lifecycle timestamps a transition must set. Returned as data rather
 * than applied here, because the domain layer owns no clock.
 *
 * `setCompletedAt` is false for CANCELLED on purpose: cancellation is not
 * completion and must never fabricate a completion timestamp
 * (DEC-RIC-005 §12).
 */
export interface LifecycleTimestampEffect {
  readonly setStartedAt: boolean
  readonly setCompletedAt: boolean
}

const NO_EFFECT: LifecycleTimestampEffect = { setStartedAt: false, setCompletedAt: false }

export function planningTransitionEffect(to: SprintStatus | EpicStatus): LifecycleTimestampEffect {
  if (to === 'ACTIVE') {
    return { setStartedAt: true, setCompletedAt: false }
  }
  if (to === 'COMPLETED') {
    return { setStartedAt: false, setCompletedAt: true }
  }
  return NO_EFFECT
}

export function taskTransitionEffect(to: TaskStatus): LifecycleTimestampEffect {
  if (to === TaskStatus.IN_PROGRESS) {
    return { setStartedAt: true, setCompletedAt: false }
  }
  if (to === TaskStatus.DONE) {
    return { setStartedAt: false, setCompletedAt: true }
  }
  return NO_EFFECT
}

// ── Planning-field validation ─────────────────────────────────────────────────

/** Failure reasons are plain strings; the persistence layer wraps them in typed errors. */
export type BacklogValidation<T> = Result<T, string>

const MAX_CODE_LENGTH = 64
/** PostgreSQL `INTEGER` upper bound — `sequence` is a 32-bit column. */
const MAX_SEQUENCE = 2_147_483_647
/** Written as a scan rather than a regex so that expressing "reject control characters" needs no `no-control-regex` suppression. */
function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0)

    if (code !== undefined && (code < 0x20 || code === 0x7F)) {
      return true
    }
  }

  return false
}

/**
 * Canonical local code: trimmed and uppercased, because the source codes are
 * case-insensitive (DEC-RIC-005 §3). Rejects empty, over-long and
 * control-character input. A stricter character policy is deliberately not
 * imposed here — no approved source defines one, and inventing one could
 * reject legitimate existing codes.
 */
export function normalizeBacklogCode(raw: string): BacklogValidation<string> {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return err('code must not be empty')
  }
  if (trimmed.length > MAX_CODE_LENGTH) {
    return err(`code must be at most ${String(MAX_CODE_LENGTH)} characters`)
  }
  if (containsControlCharacter(trimmed)) {
    return err('code must not contain control characters')
  }

  return ok(trimmed.toUpperCase())
}

/** Required free text (title). Trimmed; must not be empty. */
export function normalizeRequiredText(raw: string, field: string): BacklogValidation<string> {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return err(`${field} must not be empty`)
  }

  return ok(trimmed)
}

/**
 * Optional free text (objective, description). `null` explicitly clears the
 * value and is preserved as `null`; a blank string is rejected rather than
 * silently treated as "clear", so callers must say which they mean.
 */
export function normalizeOptionalText(raw: string | null, field: string): BacklogValidation<string | null> {
  if (raw === null) {
    return ok(null)
  }

  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return err(`${field} must not be blank; use null to clear it`)
  }

  return ok(trimmed)
}

/** Explicit planning order: a non-negative 32-bit integer. Not an eligibility decision (DEC-RIC-005 §8). */
export function validateSequence(value: number): BacklogValidation<number> {
  if (!Number.isInteger(value)) {
    return err('sequence must be an integer')
  }
  if (value < 0) {
    return err('sequence must not be negative')
  }
  if (value > MAX_SEQUENCE) {
    return err(`sequence must be at most ${String(MAX_SEQUENCE)}`)
  }

  return ok(value)
}

/**
 * An ordered JSON array of non-empty strings, order preserved exactly
 * (DEC-RIC-005 §9). An empty array is valid and represents a Task that is
 * not ready to execute — NDERCC-17 draws no eligibility conclusion from it.
 * Arbitrary object schemas are deferred, so anything that is not a string
 * array is rejected rather than coerced.
 */
export function validateAcceptanceCriteria(value: unknown): BacklogValidation<readonly string[]> {
  if (!Array.isArray(value)) {
    return err('acceptanceCriteria must be an array')
  }

  const criteria: string[] = []

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string') {
      return err(`acceptanceCriteria[${String(index)}] must be a string`)
    }

    const trimmed = entry.trim()

    if (trimmed.length === 0) {
      return err(`acceptanceCriteria[${String(index)}] must not be empty`)
    }

    criteria.push(trimmed)
  }

  return ok(criteria)
}

/**
 * External provenance, never identity.
 *
 * Every field is explicitly `| undefined` so that "not supplied" and
 * "explicitly cleared to null" stay distinguishable under
 * `exactOptionalPropertyTypes` — a partial update has to be able to say
 * which one it means.
 */
export interface ExternalIdentityInput {
  readonly externalProvider?: BacklogExternalProvider | null | undefined
  readonly externalId?: string | null | undefined
  readonly externalKey?: string | null | undefined
  readonly externalUrl?: string | null | undefined
}

/**
 * An `externalId` is meaningless without the provider that issued it, so the
 * provider is required whenever an id is present (DEC-RIC-005 §4). The
 * reverse is allowed: a provider may be recorded before its id is known.
 *
 * A blank or whitespace-only string is rejected rather than treated as
 * absent (IR-NDERCC-17-001). `externalId` is defined as a provider-stable
 * identifier, and a blank value is not one — it is a malformed identity.
 * Treating it as "no identity" would let it slip past the provider-required
 * rule and then be written to the row verbatim, since `?? null` does not
 * catch an empty string. "No identity" is spelled `null` (clear) or
 * `undefined` (leave unchanged); both remain accepted.
 */
export function validateExternalIdentity(input: ExternalIdentityInput): BacklogValidation<null> {
  const { externalId, externalProvider } = input

  if (typeof externalId !== 'string') {
    return ok(null)
  }

  if (externalId.trim().length === 0) {
    return err('externalId must not be blank; use null to clear it')
  }

  if (externalProvider === undefined || externalProvider === null) {
    return err('externalProvider is required when externalId is present')
  }

  return ok(null)
}

/**
 * Only a prerequisite in DONE satisfies a dependency edge. CANCELLED
 * deliberately does not: a cancelled prerequisite leaves the dependent Task
 * genuinely unsatisfied and is a replanning signal for P0-032, not a silent
 * success (DEC-RIC-005 §10).
 *
 * NDERCC-17 stores and states this contract; it does not compute
 * eligibility, which needs the whole graph and is owned by P0-031.
 */
export function isDependencySatisfiedBy(prerequisiteStatus: TaskStatus): boolean {
  return prerequisiteStatus === TaskStatus.DONE
}
