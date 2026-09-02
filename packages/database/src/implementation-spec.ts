/**
 * Typed persistence surface for `ImplementationSpec` — the governed
 * Spec-Driven Development layer RIC-E07A places between requirements and
 * planning on one side and the Execution Contract on the other.
 *
 * The six capabilities P1-038 names map one-to-one onto this surface:
 *
 *   - **create**    `createImplementationSpec` opens a new lineage at an
 *                   explicit version, in DRAFT;
 *   - **validate**  `validateImplementationSpecById` recomputes the
 *                   deterministic verdict from stored content, and approval
 *                   re-runs it transactionally rather than trusting it;
 *   - **version**   `reviseImplementationSpec` appends a strictly greater
 *                   version to an existing lineage as a NEW row;
 *   - **approve**   `approveImplementationSpec` records an explicit,
 *                   attributed approval, and only for a valid specification;
 *   - **supersede** the same call retires an explicitly named predecessor in
 *                   the same transaction;
 *   - **trace**     link tables tie a specification to the requirements and
 *                   decisions it was written against, and
 *                   `resolveImplementationSpecExecutionEligibility` reports
 *                   whether a Task currently has a specification an
 *                   Execution Contract could legitimately be derived from.
 *
 * There is deliberately no delete operation anywhere on this surface, and no
 * update operation for a specification that has left DRAFT. History is the
 * point: a superseded specification stays queryable exactly as it was
 * approved, because a later Execution Contract will have been derived
 * against it.
 *
 * Every mutation runs inside `withMutableProjectTransaction`, which takes a
 * `SELECT … FOR UPDATE` row lock on the owning project. As with the
 * operational backlog, every uniqueness scope here lives inside one Project
 * — lineage code, version identity, the single approved specification per
 * Task — so serializing on the project row makes an in-transaction
 * pre-check as authoritative as a database constraint. The constraints are
 * still there and still enforced; they are the backstop for any writer that
 * bypasses this module.
 *
 * `contentHash` is recomputed here from the content being stored rather than
 * accepted from the caller, exactly as `document-snapshot.ts` does, so the
 * database can never hold a specification whose hash disagrees with its own
 * body.
 *
 * This module creates, reads and hashes *specifications*. It does not model,
 * generate, validate or hash an Execution Contract — P0-040 through P0-043
 * own that and none of it exists yet.
 *
 * NDERCC-23 / DEC-RIC-010: governed SDD specification lifecycle (P1-038).
 */
import { createHash } from 'node:crypto'
import type { ImplementationSpec, Prisma, PrismaClient } from '@prisma/client'
import type {
  ImplementationSpecContent,
  ImplementationSpecContentInput,
  SpecEligibilityOutcome,
  SpecValidation,
  SpecValidationOutcome,
  SpecVersion,
} from '@rick/domain'
import {
  canonicalSpecContent,
  canTransitionImplementationSpecStatus,
  evaluateSpecExecutionEligibility,
  formatSpecVersion,
  ImplementationSpecStatus,
  isImplementationSpecContentMutable,
  isSpecVersionGreater,
  normalizeSpecCode,
  parseImplementationSpecContent,
  parseSpecVersion,
  SPEC_LIFECYCLE_VERSION,
  validateImplementationSpec,
} from '@rick/domain'
import {
  DuplicateImplementationSpecCodeError,
  ImplementationSpecApproverNotFoundError,
  ImplementationSpecContentFrozenError,
  ImplementationSpecNotApprovableError,
  ImplementationSpecNotFoundError,
  ImplementationSpecSupersessionRequiredError,
  ImplementationSpecTraceTargetNotFoundError,
  ImplementationSpecVersionNotIncreasingError,
  InvalidImplementationSpecInputError,
  InvalidImplementationSpecSupersessionError,
  InvalidImplementationSpecTransitionError,
  TaskNotFoundError,
} from './errors.js'
import {
  requireExistingProject,
  withConsistentProjectReadTransaction,
  withMutableProjectTransaction,
} from './internal/mutable-project-transaction.js'

export type { ImplementationSpec }

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Converts a domain validation result into a value, or throws the persistence layer's typed error carrying the domain's reason. */
function unwrap<T>(result: SpecValidation<T>): T {
  if (!result.ok) {
    throw new InvalidImplementationSpecInputError(result.error)
  }

  return result.value
}

function requireVersion(raw: string): SpecVersion {
  return unwrap(parseSpecVersion(raw))
}

function requireCode(raw: string): string {
  return unwrap(normalizeSpecCode(raw))
}

/** The stored JSON columns as they leave PostgreSQL: untyped at this boundary and narrowed by the domain before use. */
function storedContentInput(spec: ImplementationSpec): ImplementationSpecContentInput {
  return {
    title: spec.title,
    behavior: spec.behavior,
    scope: spec.scopeJson,
    nonGoals: spec.nonGoalsJson,
    acceptanceCriteria: spec.acceptanceCriteriaJson,
    constraints: spec.constraintsJson,
    dependencies: spec.dependenciesJson,
    risks: spec.risksJson,
    interfaces: spec.interfacesJson,
    validationStrategy: spec.validationStrategyJson,
  }
}

/** Narrows a stored row back into specification content. Returns a failure rather than throwing so callers that only need a verdict — eligibility — can report `INVALID_CONTENT` instead of crashing. */
export function readImplementationSpecContent(spec: ImplementationSpec): SpecValidation<ImplementationSpecContent> {
  return parseImplementationSpecContent(storedContentInput(spec))
}

/**
 * SHA-256 over the domain's canonical serialization. The domain owns *what*
 * is hashed; this owns the primitive, so the two cannot disagree about the
 * bytes.
 *
 * `rulesVersion` is a required argument rather than a module constant read
 * inside: recomputing a stored specification's hash must use the version
 * that specification was authored under, so a later rule-version bump can
 * never rewrite the canonical identity of a specification already approved
 * under earlier rules.
 */
function computeContentHash(content: ImplementationSpecContent, rulesVersion: string): string {
  const canonical = canonicalSpecContent({ rulesVersion, content })

  return createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex')
}

/**
 * Recomputes a stored specification's content hash from its own persisted
 * body and its own persisted `rulesVersion`.
 *
 * For an untampered row this always reproduces `spec.contentHash`, for the
 * whole life of the row — including after `SPEC_LIFECYCLE_VERSION` has moved
 * on. Returns a failure rather than throwing when the stored body is not
 * narrowable, so a caller checking integrity can report that instead of
 * crashing.
 */
export function recomputeImplementationSpecContentHash(spec: ImplementationSpec): SpecValidation<string> {
  const content = readImplementationSpecContent(spec)

  if (!content.ok) {
    return content
  }

  return { ok: true, value: computeContentHash(content.value, spec.rulesVersion) }
}

/** The content half of a create or update payload, with the hash and rule-set version derived rather than accepted. */
interface SpecContentColumns {
  title: string
  behavior: string
  scopeJson: string[]
  nonGoalsJson: string[]
  acceptanceCriteriaJson: string[]
  constraintsJson: string[]
  dependenciesJson: string[]
  risksJson: string[]
  interfacesJson: string[]
  validationStrategyJson: string[]
  contentHash: string
  rulesVersion: string
}

/**
 * Content is only ever written as newly authored content, so it is written
 * under the currently installed rule set. `rulesVersion` and `contentHash`
 * are produced together from that one value and move in the same statement
 * as the body, so a row can never hold a hash that disagrees with its own
 * rules version — which is what makes recomputation from the persisted
 * `rulesVersion` reliable for the rest of the row's life.
 *
 * There is deliberately no path that writes content under any other rule
 * set: rewriting a stored body under today's rules would be exactly the
 * silent historical rewrite this design exists to prevent.
 */
function contentColumns(content: ImplementationSpecContent): SpecContentColumns {
  return {
    title: content.title,
    behavior: content.behavior,
    scopeJson: [...content.scope],
    nonGoalsJson: [...content.nonGoals],
    acceptanceCriteriaJson: [...content.acceptanceCriteria],
    constraintsJson: [...content.constraints],
    dependenciesJson: [...content.dependencies],
    risksJson: [...content.risks],
    interfacesJson: [...content.interfaces],
    validationStrategyJson: [...content.validationStrategy],
    contentHash: computeContentHash(content, SPEC_LIFECYCLE_VERSION),
    rulesVersion: SPEC_LIFECYCLE_VERSION,
  }
}

function versionColumns(version: SpecVersion): {
  version: string
  versionMajor: number
  versionMinor: number
  versionPatch: number
} {
  return {
    version: formatSpecVersion(version),
    versionMajor: version.major,
    versionMinor: version.minor,
    versionPatch: version.patch,
  }
}

/** A specification that belongs to a different project is treated identically to one that does not exist. */
async function requireOwnedSpec(
  tx: Prisma.TransactionClient,
  projectId: string,
  specId: string,
): Promise<ImplementationSpec> {
  const spec = await tx.implementationSpec.findUnique({ where: { id: specId } })

  if (!spec || spec.projectId !== projectId) {
    throw new ImplementationSpecNotFoundError(specId)
  }

  return spec
}

/** Version identity is one-to-one with the `(major, minor, patch)` triple, so ordering on the triple is a total order inside a lineage. */
const LINEAGE_NEWEST_FIRST = [
  { versionMajor: 'desc' },
  { versionMinor: 'desc' },
  { versionPatch: 'desc' },
] as const satisfies Prisma.ImplementationSpecOrderByWithRelationInput[]

async function findLineageLatest(
  tx: Prisma.TransactionClient,
  projectId: string,
  code: string,
): Promise<ImplementationSpec | null> {
  return tx.implementationSpec.findFirst({
    where: { projectId, code },
    orderBy: [...LINEAGE_NEWEST_FIRST],
  })
}

function specVersionOf(spec: ImplementationSpec): SpecVersion {
  return { major: spec.versionMajor, minor: spec.versionMinor, patch: spec.versionPatch }
}

// ── Traceability links ────────────────────────────────────────────────────────

interface TraceLinkInput {
  readonly projectId: string
  readonly specId: string
  readonly requirementIds: readonly string[]
  readonly decisionIds: readonly string[]
}

/**
 * Writes the requirement and decision links for a specification.
 *
 * Each target is checked for existence inside this project first: the
 * composite foreign keys already make a cross-project link impossible, but a
 * raw constraint violation would surface as an opaque Prisma error instead
 * of naming which target was wrong.
 *
 * Ids are de-duplicated, so supplying the same requirement twice records one
 * link rather than colliding with the pair uniqueness index.
 */
async function createTraceLinks(tx: Prisma.TransactionClient, input: TraceLinkInput): Promise<void> {
  const { projectId, specId } = input
  const requirementIds = [...new Set(input.requirementIds)]
  const decisionIds = [...new Set(input.decisionIds)]

  for (const requirementId of requirementIds) {
    const found = await tx.requirement.findUnique({ where: { id: requirementId }, select: { projectId: true } })

    if (!found || found.projectId !== projectId) {
      throw new ImplementationSpecTraceTargetNotFoundError('Requirement', requirementId)
    }
  }

  for (const decisionId of decisionIds) {
    const found = await tx.decision.findUnique({ where: { id: decisionId }, select: { projectId: true } })

    if (!found || found.projectId !== projectId) {
      throw new ImplementationSpecTraceTargetNotFoundError('Decision', decisionId)
    }
  }

  if (requirementIds.length > 0) {
    await tx.implementationSpecRequirement.createMany({
      data: requirementIds.map(requirementId => ({ projectId, specId, requirementId })),
    })
  }

  if (decisionIds.length > 0) {
    await tx.implementationSpecDecision.createMany({
      data: decisionIds.map(decisionId => ({ projectId, specId, decisionId })),
    })
  }
}

// ── Create and revise ─────────────────────────────────────────────────────────

export interface CreateImplementationSpecInput {
  projectId: string
  /** The governed unit of work this specification authorises preparation for. */
  taskId: string
  /** Immutable lineage identity, e.g. `RIC-SPEC-NDERCC-23-001`. Trimmed and uppercased. */
  code: string
  /** Canonical `major.minor.patch`, no `v` prefix. */
  version: string
  content: ImplementationSpecContentInput
  /** Requirements this specification was written against. */
  requirementIds?: readonly string[]
  /** Decisions this specification was written against. */
  decisionIds?: readonly string[]
}

/**
 * Opens a new specification lineage in DRAFT.
 *
 * Content is narrowed and normalized but **not** required to be approvable:
 * an incomplete draft is a legitimate work-in-progress. Approvability is
 * decided at approval time, which is the only moment it matters.
 */
export async function createImplementationSpec(
  client: PrismaClient,
  input: CreateImplementationSpecInput,
): Promise<ImplementationSpec> {
  const code = requireCode(input.code)
  const version = requireVersion(input.version)
  const content = unwrap(parseImplementationSpecContent(input.content))

  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    // A Task in another project is indistinguishable from one that does not
    // exist, so a specification can never be used to probe another project.
    const task = await tx.task.findUnique({ where: { id: input.taskId }, select: { projectId: true } })

    if (!task || task.projectId !== input.projectId) {
      throw new TaskNotFoundError(input.taskId)
    }

    const existing = await findLineageLatest(tx, input.projectId, code)

    if (existing !== null) {
      throw new DuplicateImplementationSpecCodeError(input.projectId, code)
    }

    const spec = await tx.implementationSpec.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId,
        code,
        ...versionColumns(version),
        ...contentColumns(content),
      },
    })

    await createTraceLinks(tx, {
      projectId: input.projectId,
      specId: spec.id,
      requirementIds: input.requirementIds ?? [],
      decisionIds: input.decisionIds ?? [],
    })

    return spec
  })
}

export interface ReviseImplementationSpecInput {
  projectId: string
  /** The lineage to append to. Must already exist. */
  code: string
  /** Must be strictly greater than every version the lineage already holds. */
  version: string
  content: ImplementationSpecContentInput
  requirementIds?: readonly string[]
  decisionIds?: readonly string[]
}

/**
 * Appends a new version to an existing lineage as a new DRAFT row.
 *
 * The revision inherits the lineage's Task rather than accepting one: a
 * lineage governs one unit of work for its whole life, and letting a
 * revision move to a different Task would silently transfer authority.
 *
 * Traceability links are supplied explicitly rather than copied from the
 * previous version — a revision exists precisely because something changed,
 * and inheriting stale links would be the opposite of traceability.
 */
export async function reviseImplementationSpec(
  client: PrismaClient,
  input: ReviseImplementationSpecInput,
): Promise<ImplementationSpec> {
  const code = requireCode(input.code)
  const version = requireVersion(input.version)
  const content = unwrap(parseImplementationSpecContent(input.content))

  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    const latest = await findLineageLatest(tx, input.projectId, code)

    if (latest === null) {
      throw new ImplementationSpecNotFoundError(code)
    }

    if (!isSpecVersionGreater(version, specVersionOf(latest))) {
      throw new ImplementationSpecVersionNotIncreasingError(code, formatSpecVersion(version), latest.version)
    }

    const spec = await tx.implementationSpec.create({
      data: {
        projectId: input.projectId,
        taskId: latest.taskId,
        code,
        ...versionColumns(version),
        ...contentColumns(content),
      },
    })

    await createTraceLinks(tx, {
      projectId: input.projectId,
      specId: spec.id,
      requirementIds: input.requirementIds ?? [],
      decisionIds: input.decisionIds ?? [],
    })

    return spec
  })
}

/**
 * Edits a DRAFT specification's content in place.
 *
 * This is the only mutation of specification content that exists. Once a
 * specification leaves DRAFT the content columns are frozen permanently, and
 * a change becomes `reviseImplementationSpec` — a new version — instead. The
 * content hash is recomputed on every edit, so it always describes the body
 * actually stored.
 */
export async function updateImplementationSpecDraft(
  client: PrismaClient,
  projectId: string,
  specId: string,
  content: ImplementationSpecContentInput,
): Promise<ImplementationSpec> {
  const parsed = unwrap(parseImplementationSpecContent(content))

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const spec = await requireOwnedSpec(tx, projectId, specId)

    if (!isImplementationSpecContentMutable(spec.status)) {
      throw new ImplementationSpecContentFrozenError(specId, spec.status)
    }

    return tx.implementationSpec.update({
      where: { id: specId },
      data: contentColumns(parsed),
    })
  })
}

// ── Validate ──────────────────────────────────────────────────────────────────

/**
 * Recomputes the deterministic validation verdict from the specification's
 * stored content. Nothing is written, and no verdict is ever persisted — the
 * answer is always derived from the body as it stands right now.
 */
export async function validateImplementationSpecById(
  client: PrismaClient,
  projectId: string,
  specId: string,
): Promise<SpecValidationOutcome> {
  await requireExistingProject(client, projectId)

  const spec = await client.implementationSpec.findUnique({ where: { id: specId } })

  if (!spec || spec.projectId !== projectId) {
    throw new ImplementationSpecNotFoundError(specId)
  }

  return validateImplementationSpec(unwrap(readImplementationSpecContent(spec)))
}

// ── Approve, reject and supersede ─────────────────────────────────────────────

export interface ApproveImplementationSpecInput {
  projectId: string
  specId: string
  /** The operator granting approval. Approval is always attributed. */
  approvedByOperatorId: string
  /**
   * The currently approved specification this one replaces. Required
   * whenever the Task already has one, and rejected when it does not — the
   * system never chooses which specification to retire.
   */
  supersedesSpecId?: string
}

interface SupersessionContext {
  readonly successor: ImplementationSpec
  readonly current: ImplementationSpec | null
  readonly namedSpecId: string | undefined
}

/** Decides which specification, if any, this approval retires. Returns it so the caller can mark it SUPERSEDED before the successor becomes APPROVED. */
function resolveSupersessionTarget(context: SupersessionContext): ImplementationSpec | null {
  const { successor, current, namedSpecId } = context

  if (current === null) {
    if (namedSpecId !== undefined) {
      throw new InvalidImplementationSpecSupersessionError(
        successor.id,
        namedSpecId,
        'the task has no approved specification to supersede',
      )
    }
    return null
  }

  if (namedSpecId === undefined) {
    throw new ImplementationSpecSupersessionRequiredError(successor.taskId, current.id)
  }

  if (namedSpecId !== current.id) {
    throw new InvalidImplementationSpecSupersessionError(
      successor.id,
      namedSpecId,
      'it is not the current approved specification for the task',
    )
  }

  if (successor.code === current.code && !isSpecVersionGreater(specVersionOf(successor), specVersionOf(current))) {
    throw new InvalidImplementationSpecSupersessionError(
      successor.id,
      namedSpecId,
      `version ${successor.version} does not follow ${current.version}`,
    )
  }

  return current
}

/**
 * Records an explicit, attributed approval.
 *
 * Three things happen in one transaction, in this order, so no observer ever
 * sees two approved specifications for one Task — which is also exactly what
 * the `implementation_specs_task_approved_key` partial unique index
 * enforces:
 *
 *   1. validation is re-run against the stored content, so an approval can
 *      never rest on a verdict computed at some earlier moment;
 *   2. the explicitly named predecessor, if any, becomes SUPERSEDED;
 *   3. this specification becomes APPROVED, carrying its approver, timestamp
 *      and the predecessor it replaced.
 */
export async function approveImplementationSpec(
  client: PrismaClient,
  input: ApproveImplementationSpecInput,
): Promise<ImplementationSpec> {
  return withMutableProjectTransaction(client, input.projectId, async (tx) => {
    const spec = await requireOwnedSpec(tx, input.projectId, input.specId)

    if (!canTransitionImplementationSpecStatus(spec.status, ImplementationSpecStatus.APPROVED)) {
      throw new InvalidImplementationSpecTransitionError(spec.id, spec.status, ImplementationSpecStatus.APPROVED)
    }

    const outcome = validateImplementationSpec(unwrap(readImplementationSpecContent(spec)))

    if (!outcome.valid) {
      throw new ImplementationSpecNotApprovableError(spec.id, outcome.findings.map(finding => finding.code))
    }

    const approver = await tx.operator.findUnique({
      where: { id: input.approvedByOperatorId },
      select: { id: true },
    })

    if (!approver) {
      throw new ImplementationSpecApproverNotFoundError(input.approvedByOperatorId)
    }

    const current = await tx.implementationSpec.findFirst({
      where: { projectId: input.projectId, taskId: spec.taskId, status: ImplementationSpecStatus.APPROVED },
    })

    const superseded = resolveSupersessionTarget({
      successor: spec,
      current,
      namedSpecId: input.supersedesSpecId,
    })
    const now = new Date()

    if (superseded !== null) {
      await tx.implementationSpec.update({
        where: { id: superseded.id },
        data: { status: ImplementationSpecStatus.SUPERSEDED, supersededAt: now },
      })
    }

    return tx.implementationSpec.update({
      where: { id: spec.id },
      data: {
        status: ImplementationSpecStatus.APPROVED,
        approvedByOperatorId: approver.id,
        approvedAt: now,
        ...(superseded !== null ? { supersedesSpecId: superseded.id } : {}),
      },
    })
  })
}

/**
 * Rejects a DRAFT specification with a recorded reason.
 *
 * REJECTED is terminal: a rejected specification is never reopened, because
 * reopening it would let the record of what was rejected disappear. The next
 * attempt is a new version of the lineage.
 */
export async function rejectImplementationSpec(
  client: PrismaClient,
  projectId: string,
  specId: string,
  reason: string,
): Promise<ImplementationSpec> {
  const trimmed = reason.trim()

  if (trimmed.length === 0) {
    throw new InvalidImplementationSpecInputError('rejectionReason must not be empty')
  }

  return withMutableProjectTransaction(client, projectId, async (tx) => {
    const spec = await requireOwnedSpec(tx, projectId, specId)

    if (!canTransitionImplementationSpecStatus(spec.status, ImplementationSpecStatus.REJECTED)) {
      throw new InvalidImplementationSpecTransitionError(specId, spec.status, ImplementationSpecStatus.REJECTED)
    }

    return tx.implementationSpec.update({
      where: { id: specId },
      data: {
        status: ImplementationSpecStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: trimmed,
      },
    })
  })
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Finds one specification scoped to its owning project. Returns `null` when it does not exist or belongs to a different project. Reads are allowed for archived projects. */
export async function findImplementationSpecForProject(
  client: PrismaClient,
  projectId: string,
  specId: string,
): Promise<ImplementationSpec | null> {
  await requireExistingProject(client, projectId)

  const spec = await client.implementationSpec.findUnique({ where: { id: specId } })

  if (!spec || spec.projectId !== projectId) {
    return null
  }

  return spec
}

/** The Task's single current authority, or `null` when it has none. */
export async function findApprovedImplementationSpecForTask(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<ImplementationSpec | null> {
  await requireExistingProject(client, projectId)

  return client.implementationSpec.findFirst({
    where: { projectId, taskId, status: ImplementationSpecStatus.APPROVED },
  })
}

/** One lineage's full history in version order, oldest first. Nothing is ever removed from it. */
export async function listImplementationSpecLineage(
  client: PrismaClient,
  projectId: string,
  code: string,
): Promise<ImplementationSpec[]> {
  await requireExistingProject(client, projectId)

  return client.implementationSpec.findMany({
    where: { projectId, code: requireCode(code) },
    orderBy: [{ versionMajor: 'asc' }, { versionMinor: 'asc' }, { versionPatch: 'asc' }],
  })
}

/**
 * Every specification governing one Task, newest version first.
 *
 * `code` and `id` follow the version triple as tie-breakers so that two
 * lineages holding the same version number still produce one stable order,
 * never one that depends on `createdAt`.
 */
export async function listImplementationSpecsForTask(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<ImplementationSpec[]> {
  await requireExistingProject(client, projectId)

  return client.implementationSpec.findMany({
    where: { projectId, taskId },
    orderBy: [...LINEAGE_NEWEST_FIRST, { code: 'asc' }, { id: 'asc' }],
  })
}

/** Every specification in the project, in the same deterministic order. */
export async function listImplementationSpecsForProject(
  client: PrismaClient,
  projectId: string,
): Promise<ImplementationSpec[]> {
  await requireExistingProject(client, projectId)

  return client.implementationSpec.findMany({
    where: { projectId },
    orderBy: [{ code: 'asc' }, ...LINEAGE_NEWEST_FIRST, { id: 'asc' }],
  })
}

/** The requirement ids this specification was written against, in insertion order with `id` as the tie-breaker. */
export async function listImplementationSpecRequirementIds(
  client: PrismaClient,
  projectId: string,
  specId: string,
): Promise<string[]> {
  await requireExistingProject(client, projectId)

  const links = await client.implementationSpecRequirement.findMany({
    where: { projectId, specId },
    select: { requirementId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  return links.map(link => link.requirementId)
}

/** The decision ids this specification was written against. */
export async function listImplementationSpecDecisionIds(
  client: PrismaClient,
  projectId: string,
  specId: string,
): Promise<string[]> {
  await requireExistingProject(client, projectId)

  const links = await client.implementationSpecDecision.findMany({
    where: { projectId, specId },
    select: { decisionId: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  return links.map(link => link.decisionId)
}

// ── Execution eligibility ─────────────────────────────────────────────────────

/**
 * The specification whose state answers "may an Execution Contract be
 * derived for this Task?".
 *
 * The Task's approved specification when it has one — there is at most one,
 * by database constraint. Otherwise the newest specification by version,
 * with `code` and `id` as tie-breakers, so a caller learns *why* the Task is
 * not ready (`NOT_APPROVED`, `SUPERSEDED`, `INVALID_CONTENT`) instead of a
 * bare "missing" for a Task that has drafts sitting in front of it.
 */
async function findGoverningSpecForTask(
  tx: Prisma.TransactionClient,
  projectId: string,
  taskId: string,
): Promise<ImplementationSpec | null> {
  const approved = await tx.implementationSpec.findFirst({
    where: { projectId, taskId, status: ImplementationSpecStatus.APPROVED },
  })

  if (approved !== null) {
    return approved
  }

  return tx.implementationSpec.findFirst({
    where: { projectId, taskId },
    orderBy: [...LINEAGE_NEWEST_FIRST, { code: 'asc' }, { id: 'asc' }],
  })
}

/**
 * Whether a Task currently has a specification an Execution Contract could
 * legitimately be derived from, and every reason it does not — **computed
 * inside the caller's transaction**.
 *
 * This is the deterministic gate RIC-E07A's exit criterion calls for, and it
 * is the primitive a later Execution Contract generator (P0-041) must use.
 * An eligibility answer is only as good as the transaction it was computed
 * in: the specification's status, its traceability links and the strategic
 * truth those links point at are four separate reads, and a verdict that
 * mixed a pre-change specification with post-change links would describe a
 * state that never existed.
 *
 * The caller must therefore already hold the owning project's row lock —
 * `withMutableProjectTransaction` for a transaction that will also write, or
 * `withConsistentProjectReadTransaction` for a pure projection. Every writer
 * that can move any fact read here takes that same lock: specification
 * lifecycle and traceability writes in this module, and requirement and
 * decision writes in `strategic-truth.ts`. While it is held, none of them
 * can commit, so all four reads below belong to one state.
 *
 * **This is the call P0-041 must make, and it must make it inside the same
 * transaction that persists the contract.** Deriving authority means
 * re-checking eligibility and writing the contract atomically; obtaining
 * `ELIGIBLE` from the projection below and then opening a *second*
 * transaction to create authority would reintroduce exactly the gap this
 * signature exists to close. Nothing here creates, validates or hashes a
 * contract — P0-040 through P0-043 remain unimplemented.
 */
export async function resolveImplementationSpecEligibilityInTransaction(
  tx: Prisma.TransactionClient,
  projectId: string,
  taskId: string,
): Promise<SpecEligibilityOutcome> {
  const spec = await findGoverningSpecForTask(tx, projectId, taskId)

  if (spec === null) {
    return evaluateSpecExecutionEligibility({ spec: null, linkedRequirements: [], linkedDecisions: [] })
  }

  const content = readImplementationSpecContent(spec)
  const contentValid = content.ok && validateImplementationSpec(content.value).valid

  const requirementLinks = await tx.implementationSpecRequirement.findMany({
    where: { projectId, specId: spec.id },
    select: { requirement: { select: { id: true, status: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const decisionLinks = await tx.implementationSpecDecision.findMany({
    where: { projectId, specId: spec.id },
    select: { decision: { select: { id: true, status: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  return evaluateSpecExecutionEligibility({
    spec: { status: spec.status, contentValid },
    linkedRequirements: requirementLinks.map(link => link.requirement),
    linkedDecisions: decisionLinks.map(link => link.decision),
  })
}

/**
 * The read-only projection of the same question, for display and reporting.
 *
 * It runs the transaction-scoped resolver above inside a consistent-read
 * transaction that holds the project row lock, so the answer describes one
 * real state rather than a blend of several. Reads remain permitted for an
 * archived project, as everywhere else in this package.
 *
 * **This is a projection, not a gate.** The verdict is accurate for the
 * instant the transaction committed and may be stale by the time the caller
 * reads it. Anything that grants authority on the strength of an eligibility
 * answer must call `resolveImplementationSpecEligibilityInTransaction`
 * inside its own writing transaction instead, so the check and the write
 * cannot be separated.
 */
export async function resolveImplementationSpecExecutionEligibility(
  client: PrismaClient,
  projectId: string,
  taskId: string,
): Promise<SpecEligibilityOutcome> {
  return withConsistentProjectReadTransaction(client, projectId, async tx =>
    resolveImplementationSpecEligibilityInTransaction(tx, projectId, taskId))
}
