/**
 * Deterministic Spec-Driven Development rules: the governed lifecycle of an
 * implementation specification — create, validate, version, approve,
 * supersede and trace — that must exist before an Execution Contract can be
 * derived.
 *
 * Pure and infrastructure-free — no Prisma, no database, no I/O, no clock,
 * no hashing primitive. Every rule here is a total function of its
 * arguments, so the same specification content always produces the same
 * verdict. `@rick/database` translates the reasons produced here into its
 * own typed error classes rather than restating the rules, so a rule can
 * never drift between the two layers.
 *
 * This module makes explicit what RIC-E07A already requires and what the
 * repository has so far practised only informally: specifications named
 * `RIC-SPEC-<scope>-NNN` at a semantic version, recorded in Jira comments
 * (DEC-RIC-006, DEC-RIC-009). Those identifier and version conventions are
 * preserved rather than replaced.
 *
 * Deliberately absent — these belong to later Sprint 3 tasks and nothing
 * here implements, anticipates or shapes them:
 *
 *   - the canonical Execution Contract schema (P0-040);
 *   - immutable contract generation (P0-041);
 *   - contract completeness validation (P0-042);
 *   - contract hashing and versioning (P0-043).
 *
 * `canonicalSpecContent` below serialises a *specification* for hashing. It
 * is not a contract hash and does not implement P0-043.
 *
 * There is also deliberately no persisted `VALIDATED` state. Validity is a
 * pure function of content; persisting a verdict would let it drift away
 * from the content it describes — the same reasoning that keeps READY /
 * BLOCKED / AMBIGUOUS / CONFLICT unpersisted in DEC-RIC-005 §5.
 *
 * NDERCC-23 / P1-038 / DEC-RIC-010: governed SDD specification lifecycle.
 */
import { err, ok } from '@rick/shared'
import type { Result } from '@rick/shared'
import { normalizeBacklogCode } from './operational-backlog.js'
import { DecisionStatus, RequirementStatus } from './strategic-truth.js'

/** Bumped whenever a validation or eligibility rule below changes, so a reported verdict always names the rule set that produced it. */
export const SPEC_LIFECYCLE_VERSION = 'P1_038_V1' as const

/** Failure reasons are plain strings; the persistence layer wraps them in typed errors. */
export type SpecValidation<T> = Result<T, string>

// ── Lifecycle state machine ───────────────────────────────────────────────────

// Declared here rather than imported from the generated Prisma client: the
// domain layer must not depend on infrastructure. `@rick/database`
// re-exports this enum under the same name and the integration tests assert
// the two sets agree.

/**
 * The same four-state vocabulary already used by `DecisionStatus` and
 * `DocumentApprovalStatus`, kept a separate enum so the specification
 * lifecycle can evolve later without silently redefining either of them.
 */
export const ImplementationSpecStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
} as const
export type ImplementationSpecStatus = typeof ImplementationSpecStatus[keyof typeof ImplementationSpecStatus]

/**
 * `DRAFT -> APPROVED` additionally requires a passing validation; the
 * transition table states only which edges exist at all, and
 * `@rick/database` enforces the validation precondition transactionally.
 *
 * `APPROVED -> SUPERSEDED` is the only way an approved specification leaves
 * circulation. There is deliberately no `APPROVED -> REJECTED` edge:
 * retracting an approval after the fact would rewrite the history a later
 * Execution Contract was derived against. A superseding specification
 * replaces it instead, and both rows survive.
 */
const SPEC_TRANSITIONS: Readonly<Record<ImplementationSpecStatus, readonly ImplementationSpecStatus[]>> = {
  DRAFT: ['APPROVED', 'REJECTED'],
  APPROVED: ['SUPERSEDED'],
  REJECTED: [],
  SUPERSEDED: [],
}

export function canTransitionImplementationSpecStatus(
  from: ImplementationSpecStatus,
  to: ImplementationSpecStatus,
): boolean {
  return SPEC_TRANSITIONS[from].includes(to)
}

/** A state with no outgoing transitions: REJECTED and SUPERSEDED. */
export function isTerminalImplementationSpecStatus(status: ImplementationSpecStatus): boolean {
  return SPEC_TRANSITIONS[status].length === 0
}

/**
 * Specification content is editable only while DRAFT. Once a specification
 * leaves DRAFT its content is frozen for the rest of its life: a revision is
 * a new version row, never an edit of an approved, rejected or superseded
 * one. An approval that could be edited afterwards would be evidence of
 * nothing.
 */
export function isImplementationSpecContentMutable(status: ImplementationSpecStatus): boolean {
  return status === ImplementationSpecStatus.DRAFT
}

// ── Version identity ──────────────────────────────────────────────────────────

/** An explicit `major.minor.patch` version. Pre-release and build metadata are deliberately not accepted — a governed specification version is a plain, totally ordered triple. */
export interface SpecVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

/** PostgreSQL `INTEGER` upper bound — each component is a 32-bit column. */
const MAX_VERSION_COMPONENT = 2_147_483_647

function parseVersionComponent(raw: string, field: string): SpecValidation<number> {
  if (raw.length === 0) {
    return err(`version ${field} must not be empty`)
  }

  for (const character of raw) {
    if (character < '0' || character > '9') {
      return err(`version ${field} must contain digits only`)
    }
  }

  if (raw.length > 1 && raw.startsWith('0')) {
    return err(`version ${field} must not have a leading zero`)
  }

  const value = Number.parseInt(raw, 10)

  if (value > MAX_VERSION_COMPONENT) {
    return err(`version ${field} must be at most ${String(MAX_VERSION_COMPONENT)}`)
  }

  return ok(value)
}

/**
 * Parses `major.minor.patch`. A leading `v` is rejected rather than
 * stripped: the stored canonical form carries no prefix, and silently
 * accepting both spellings would let two different strings denote one
 * version.
 */
export function parseSpecVersion(raw: string): SpecValidation<SpecVersion> {
  const parts = raw.trim().split('.')

  if (parts.length !== 3) {
    return err('version must have the form major.minor.patch')
  }

  // The length check above guarantees three elements, so the defaults below
  // never apply — they exist only so each binding is typed `string` under
  // `noUncheckedIndexedAccess`.
  const [majorRaw = '', minorRaw = '', patchRaw = ''] = parts

  const major = parseVersionComponent(majorRaw, 'major')
  if (!major.ok) {
    return major
  }

  const minor = parseVersionComponent(minorRaw, 'minor')
  if (!minor.ok) {
    return minor
  }

  const patch = parseVersionComponent(patchRaw, 'patch')
  if (!patch.ok) {
    return patch
  }

  return ok({ major: major.value, minor: minor.value, patch: patch.value })
}

/** The canonical stored spelling: no `v` prefix, no padding. */
export function formatSpecVersion(version: SpecVersion): string {
  return `${String(version.major)}.${String(version.minor)}.${String(version.patch)}`
}

/** Negative when `left` precedes `right`, zero when equal, positive when it follows. A total order, so a lineage's maximum version is never ambiguous. */
export function compareSpecVersions(left: SpecVersion, right: SpecVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor
  }
  return left.patch - right.patch
}

/** A revision must advance its lineage. Re-using or lowering a version would make version identity non-deterministic. */
export function isSpecVersionGreater(candidate: SpecVersion, current: SpecVersion): boolean {
  return compareSpecVersions(candidate, current) > 0
}

// ── Identity and field validation ─────────────────────────────────────────────

/**
 * The canonical local specification code, e.g. `RIC-SPEC-NDERCC-23-001`.
 *
 * The rule — trimmed, uppercased, non-empty, bounded, no control characters
 * — is identical to the operational backlog's canonical local code, so it is
 * reused rather than re-implemented; two copies of one rule could drift.
 */
export function normalizeSpecCode(raw: string): SpecValidation<string> {
  return normalizeBacklogCode(raw)
}

/** Required free text (title, behavior). Trimmed; must not be empty. */
export function normalizeSpecText(raw: string, field: string): SpecValidation<string> {
  const trimmed = raw.trim()

  if (trimmed.length === 0) {
    return err(`${field} must not be empty`)
  }

  return ok(trimmed)
}

/**
 * An ordered array of non-empty strings, order preserved exactly.
 *
 * The NDERCC-17 `validateAcceptanceCriteria` enforces the same shape for a
 * Task's planning-level criteria. It is deliberately left untouched: it is
 * owned by a different, already delivered slice, and generalising it would
 * edit code outside this task's authorised scope.
 */
export function validateSpecStatements(value: unknown, field: string): SpecValidation<readonly string[]> {
  if (!Array.isArray(value)) {
    return err(`${field} must be an array`)
  }

  const statements: string[] = []

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string') {
      return err(`${field}[${String(index)}] must be a string`)
    }

    const trimmed = entry.trim()

    if (trimmed.length === 0) {
      return err(`${field}[${String(index)}] must not be empty`)
    }

    statements.push(trimmed)
  }

  return ok(statements)
}

// ── Specification content ─────────────────────────────────────────────────────

/**
 * The content RIC-E07A requires a specification to define. Every field is
 * represented explicitly, including the ones that may legitimately be empty
 * — an empty `risks` list states "no risks recorded", which is a different
 * claim from a missing field.
 */
export interface ImplementationSpecContent {
  /** Short human title. */
  readonly title: string
  /** Expected behaviour — *comportamento esperado*. */
  readonly behavior: string
  /** In scope — *escopo*. */
  readonly scope: readonly string[]
  /** Out of scope — *fora de escopo*. */
  readonly nonGoals: readonly string[]
  /** Verifiable acceptance criteria — *critérios de aceite*. */
  readonly acceptanceCriteria: readonly string[]
  /** *Restrições*, recorded when applicable. */
  readonly constraints: readonly string[]
  /** *Dependências*, recorded when applicable. */
  readonly dependencies: readonly string[]
  /** *Riscos*, recorded when applicable. */
  readonly risks: readonly string[]
  /** *Interfaces/contratos*, recorded when applicable. */
  readonly interfaces: readonly string[]
  /** *Estratégia de validação*, recorded when applicable. */
  readonly validationStrategy: readonly string[]
}

/** The same shape as it arrives from an untrusted boundary — a persisted JSON column, an HTTP body — before narrowing. */
export interface ImplementationSpecContentInput {
  readonly title: string
  readonly behavior: string
  readonly scope: unknown
  readonly nonGoals: unknown
  readonly acceptanceCriteria: unknown
  readonly constraints: unknown
  readonly dependencies: unknown
  readonly risks: unknown
  readonly interfaces: unknown
  readonly validationStrategy: unknown
}

/** The statement-list fields, in the fixed order used for narrowing, validation findings and canonical serialisation. */
const STATEMENT_FIELDS = [
  'scope',
  'nonGoals',
  'acceptanceCriteria',
  'constraints',
  'dependencies',
  'risks',
  'interfaces',
  'validationStrategy',
] as const

type StatementField = typeof STATEMENT_FIELDS[number]

type StatementLists = Record<StatementField, readonly string[]>

/**
 * Every key was assigned by the loop in `narrowStatementLists`; the empty
 * fallbacks exist so the result is a total `StatementLists` without a type
 * assertion — a missing field becomes an empty list, which validation then
 * reports, rather than `undefined` slipping through unnoticed.
 */
function assembleStatementLists(lists: Partial<StatementLists>): StatementLists {
  return {
    scope: lists.scope ?? [],
    nonGoals: lists.nonGoals ?? [],
    acceptanceCriteria: lists.acceptanceCriteria ?? [],
    constraints: lists.constraints ?? [],
    dependencies: lists.dependencies ?? [],
    risks: lists.risks ?? [],
    interfaces: lists.interfaces ?? [],
    validationStrategy: lists.validationStrategy ?? [],
  }
}

function narrowStatementLists(input: ImplementationSpecContentInput): SpecValidation<StatementLists> {
  const lists: Partial<StatementLists> = {}

  for (const field of STATEMENT_FIELDS) {
    const parsed = validateSpecStatements(input[field], field)

    if (!parsed.ok) {
      return parsed
    }

    lists[field] = parsed.value
  }

  return ok(assembleStatementLists(lists))
}

/**
 * Narrows untrusted content into `ImplementationSpecContent`, trimming every
 * string. Structural narrowing only: it answers "is this a well-formed
 * specification body", not "is this specification approvable" — that second
 * question is `validateImplementationSpec` below. The two are kept apart so
 * a malformed row and an incomplete draft never produce the same diagnosis.
 */
export function parseImplementationSpecContent(
  input: ImplementationSpecContentInput,
): SpecValidation<ImplementationSpecContent> {
  const title = normalizeSpecText(input.title, 'title')
  if (!title.ok) {
    return title
  }

  const behavior = normalizeSpecText(input.behavior, 'behavior')
  if (!behavior.ok) {
    return behavior
  }

  const lists = narrowStatementLists(input)
  if (!lists.ok) {
    return lists
  }

  return ok({ title: title.value, behavior: behavior.value, ...lists.value })
}

// ── Deterministic validation ──────────────────────────────────────────────────

export const SpecValidationCode = {
  MISSING_SCOPE: 'MISSING_SCOPE',
  MISSING_NON_GOALS: 'MISSING_NON_GOALS',
  MISSING_ACCEPTANCE_CRITERIA: 'MISSING_ACCEPTANCE_CRITERIA',
} as const
export type SpecValidationCode = typeof SpecValidationCode[keyof typeof SpecValidationCode]

export interface SpecValidationFinding {
  readonly code: SpecValidationCode
  readonly field: StatementField
  readonly message: string
}

export interface SpecValidationOutcome {
  readonly valid: boolean
  /** The rule-set version that produced this verdict. */
  readonly rulesVersion: typeof SPEC_LIFECYCLE_VERSION
  /** Empty when valid; otherwise ordered by the fixed rule order below, never by discovery order. */
  readonly findings: readonly SpecValidationFinding[]
}

/**
 * The three lists a specification must actually populate to be approvable.
 *
 * `title` and `behavior` are absent from this table because
 * `parseImplementationSpecContent` already rejects a blank one — a
 * specification with no expected behaviour is not an incomplete draft, it is
 * a malformed body.
 *
 * The remaining five lists — constraints, dependencies, risks, interfaces
 * and validation strategy — are RIC-E07A's *"quando aplicável"* fields. They
 * are always recorded and may legitimately be empty, so an empty one is
 * never a finding.
 */
const REQUIRED_STATEMENT_RULES = [
  { field: 'scope', code: SpecValidationCode.MISSING_SCOPE, message: 'scope must declare at least one statement' },
  { field: 'nonGoals', code: SpecValidationCode.MISSING_NON_GOALS, message: 'nonGoals must declare at least one statement' },
  {
    field: 'acceptanceCriteria',
    code: SpecValidationCode.MISSING_ACCEPTANCE_CRITERIA,
    message: 'acceptanceCriteria must declare at least one verifiable criterion',
  },
] as const satisfies readonly { field: StatementField, code: SpecValidationCode, message: string }[]

/**
 * The deterministic approvability verdict: same content in, same findings
 * out, in the same order, with no clock, randomness or external lookup
 * involved.
 *
 * RIC-E07A's exit criterion is that no implementation advances without a
 * valid specification and *verifiable* criteria, which is why an empty
 * `acceptanceCriteria` is a hard finding rather than a warning.
 */
export function validateImplementationSpec(content: ImplementationSpecContent): SpecValidationOutcome {
  const findings: SpecValidationFinding[] = []

  for (const rule of REQUIRED_STATEMENT_RULES) {
    if (content[rule.field].length === 0) {
      findings.push({ code: rule.code, field: rule.field, message: rule.message })
    }
  }

  return { valid: findings.length === 0, rulesVersion: SPEC_LIFECYCLE_VERSION, findings }
}

// ── Canonical serialisation for content hashing ───────────────────────────────

/**
 * A stable, fully ordered serialisation of specification content.
 *
 * The digest itself is computed by `@rick/database`, which owns the hashing
 * primitive; the domain owns only *what* is hashed, so the two can never
 * disagree about the byte sequence. Keys are emitted in a fixed literal
 * order, so the output depends on content alone.
 *
 * This describes *what a specification says*, not *which specification it
 * is* — identity is `(projectId, code, version)`. Two revisions whose bodies
 * are identical therefore share a hash, which is exactly the signal that a
 * revision changed nothing.
 *
 * It is not, and must not be mistaken for, an Execution Contract hash
 * (P0-043).
 */
export function canonicalSpecContent(content: ImplementationSpecContent): string {
  return JSON.stringify({
    rulesVersion: SPEC_LIFECYCLE_VERSION,
    title: content.title,
    behavior: content.behavior,
    scope: content.scope,
    nonGoals: content.nonGoals,
    acceptanceCriteria: content.acceptanceCriteria,
    constraints: content.constraints,
    dependencies: content.dependencies,
    risks: content.risks,
    interfaces: content.interfaces,
    validationStrategy: content.validationStrategy,
  })
}

// ── Execution eligibility ─────────────────────────────────────────────────────

/**
 * Why a Task has no specification an Execution Contract may be derived from.
 *
 * This is a computed projection, never a persisted status — the DEC-RIC-005
 * §5 rule applied to the specification layer. P1-038 states the predicate;
 * the later Execution Contract generator (P0-041) is what must consult it.
 * Nothing here generates, validates or blocks a contract, because no
 * contract exists yet.
 */
export const SpecEligibilityReason = {
  /** No specification is bound to the Task at all. */
  MISSING: 'MISSING',
  /** A specification exists but is still DRAFT or was REJECTED. */
  NOT_APPROVED: 'NOT_APPROVED',
  /** The specification has been superseded and is no longer the authority. */
  SUPERSEDED: 'SUPERSEDED',
  /** The stored body is not a well-formed specification, or would not pass validation today. */
  INVALID_CONTENT: 'INVALID_CONTENT',
  /** Approved strategic truth the specification was traced to has since moved on. */
  STALE_STRATEGIC_TRUTH: 'STALE_STRATEGIC_TRUTH',
} as const
export type SpecEligibilityReason = typeof SpecEligibilityReason[keyof typeof SpecEligibilityReason]

export interface SpecEligibilityFinding {
  readonly reason: SpecEligibilityReason
  readonly message: string
  /** The linked requirement or decision that made the specification stale, when the reason is STALE_STRATEGIC_TRUTH. */
  readonly subjectId?: string
}

/** The persisted specification state the evaluator reads. `contentValid` is the outcome of `validateImplementationSpec` re-run against the stored body, never a stored verdict. */
export interface SpecEligibilitySpecInput {
  readonly status: ImplementationSpecStatus
  readonly contentValid: boolean
}

export interface SpecEligibilityInput {
  /** `null` when the Task has no specification bound to it. */
  readonly spec: SpecEligibilitySpecInput | null
  readonly linkedRequirements: readonly { readonly id: string, readonly status: RequirementStatus }[]
  readonly linkedDecisions: readonly { readonly id: string, readonly status: DecisionStatus }[]
}

export interface SpecEligibilityOutcome {
  readonly eligible: boolean
  readonly rulesVersion: typeof SPEC_LIFECYCLE_VERSION
  /** Empty when eligible; otherwise every applicable reason, in the fixed order evaluated below. */
  readonly findings: readonly SpecEligibilityFinding[]
}

function lifecycleFinding(status: ImplementationSpecStatus): SpecEligibilityFinding | null {
  if (status === ImplementationSpecStatus.SUPERSEDED) {
    return { reason: SpecEligibilityReason.SUPERSEDED, message: 'the specification has been superseded' }
  }
  if (status !== ImplementationSpecStatus.APPROVED) {
    return {
      reason: SpecEligibilityReason.NOT_APPROVED,
      message: `the specification is ${status}, not APPROVED`,
    }
  }
  return null
}

/**
 * Every linked requirement must still be ACTIVE and every linked decision
 * must still be APPROVED. A SUPERSEDED requirement, or a decision that is
 * PROPOSED, REJECTED or SUPERSEDED, means the specification was written
 * against strategic truth that has since moved — the specification is stale
 * and must be revised, not silently executed.
 */
function staleTruthFindings(input: SpecEligibilityInput): SpecEligibilityFinding[] {
  const findings: SpecEligibilityFinding[] = []

  for (const requirement of input.linkedRequirements) {
    if (requirement.status !== RequirementStatus.ACTIVE) {
      findings.push({
        reason: SpecEligibilityReason.STALE_STRATEGIC_TRUTH,
        message: `linked requirement is ${requirement.status}`,
        subjectId: requirement.id,
      })
    }
  }

  for (const decision of input.linkedDecisions) {
    if (decision.status !== DecisionStatus.APPROVED) {
      findings.push({
        reason: SpecEligibilityReason.STALE_STRATEGIC_TRUTH,
        message: `linked decision is ${decision.status}`,
        subjectId: decision.id,
      })
    }
  }

  return findings
}

/**
 * Whether a Task currently has a specification an Execution Contract could
 * legitimately be derived from. Returns every applicable reason rather than
 * only the first, so a caller sees the whole picture in one pass.
 */
export function evaluateSpecExecutionEligibility(input: SpecEligibilityInput): SpecEligibilityOutcome {
  const { spec } = input

  if (spec === null) {
    return {
      eligible: false,
      rulesVersion: SPEC_LIFECYCLE_VERSION,
      findings: [{
        reason: SpecEligibilityReason.MISSING,
        message: 'no implementation specification is bound to the task',
      }],
    }
  }

  const findings: SpecEligibilityFinding[] = []
  const lifecycle = lifecycleFinding(spec.status)

  if (lifecycle !== null) {
    findings.push(lifecycle)
  }

  if (!spec.contentValid) {
    findings.push({
      reason: SpecEligibilityReason.INVALID_CONTENT,
      message: 'the stored specification body does not satisfy the current validation rules',
    })
  }

  findings.push(...staleTruthFindings(input))

  return { eligible: findings.length === 0, rulesVersion: SPEC_LIFECYCLE_VERSION, findings }
}
