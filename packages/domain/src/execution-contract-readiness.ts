/**
 * P0-042 — deterministic readiness evaluation for a schema 2.0.0 Execution
 * Contract candidate (RIC-SPEC-NDERCC-39-001, AC-01 through AC-08, AC-10).
 *
 * This module answers exactly one question: "does canonical state, read
 * fresh, currently agree with what this candidate claims?" It is pure and
 * infrastructure-free, exactly like `evaluateSpecExecutionEligibility` — the
 * canonical re-reads themselves are `@rick/database`'s job
 * (`execution-contract-readiness.ts` there), run inside the same transaction
 * that already holds the project lock. This module never sees a database
 * connection and trusts nothing the candidate itself asserts; every claimed
 * fact is checked against a separately supplied canonical fact.
 *
 * ## What this is not
 *
 * A PASS here is a readiness finding, not an authorization: it conveys no
 * permission to implement, commit, push, merge, write Jira, run a command or
 * mutate the filesystem (AC-14). It is also not a persisted contract field —
 * `ExecutionContractV2` does not carry or trust its own verdict; the verdict
 * is this function's return value, evaluated fresh every time (AC-06: a prior
 * PASS can never be reused after canonical state has moved on).
 *
 * ## GAP-07 boundary
 *
 * `EligibilitySignal` includes `INCONCLUSIVE` so this classifier can never
 * collapse a three-state upstream signal into PASS/BLOCKED/FAIL if one is
 * ever supplied. Nothing in the repository produces that value today —
 * `SpecEligibilityOutcome.eligible` is still a plain boolean, and giving it a
 * third state is GAP-07, explicitly scheduled before P0-047, not here. The
 * database boundary that calls this module always maps today's boolean
 * outcome to `ELIGIBLE`/`INELIGIBLE`; only a direct unit test of this
 * classifier exercises the `INCONCLUSIVE` branch.
 */
import { err, ok } from '@rick/shared'
import type { Result } from '@rick/shared'

export const EXECUTION_CONTRACT_READINESS_VERSION = 'P0_042_V1' as const

export const ReadinessResult = {
  PASS: 'PASS',
  BLOCKED: 'BLOCKED',
  FAIL: 'FAIL',
  INCONCLUSIVE: 'INCONCLUSIVE',
} as const
export type ReadinessResult = typeof ReadinessResult[keyof typeof ReadinessResult]

/**
 * The canonical eligibility trust boundary's answer, in the caller's own
 * vocabulary rather than a raw boolean, so this module can carry a third
 * state through without redefining what produces it. See the GAP-07 note
 * above: only `ELIGIBLE`/`INELIGIBLE` are reachable through today's database
 * boundary.
 */
export const EligibilitySignal = {
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  INCONCLUSIVE: 'INCONCLUSIVE',
} as const
export type EligibilitySignal = typeof EligibilitySignal[keyof typeof EligibilitySignal]

export const ReadinessFindingCode = {
  /** The eligibility signal was neither ELIGIBLE nor a recognized ineligible/inconclusive value. */
  UNKNOWN_ELIGIBILITY_SIGNAL: 'UNKNOWN_ELIGIBILITY_SIGNAL',
  /** A known-ineligible canonical state (e.g. spec not APPROVED) — blocks, never passes. */
  INELIGIBLE: 'INELIGIBLE',
  /** A claimed identity field disagrees with the freshly read canonical value — forged or stale. */
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  /** A canonical status value this evaluator does not recognize at all. */
  MALFORMED_STATUS: 'MALFORMED_STATUS',
  /** The claimed and canonical traceability sets are not the same set (missing, additional, substituted, reordered-with-a-difference, or status-changed member). */
  TRACEABILITY_SET_MISMATCH: 'TRACEABILITY_SET_MISMATCH',
  /** The canonical traceability set is empty, which eligibility already excludes; a defensive backstop, not the primary enforcement point. */
  EMPTY_TRACEABILITY: 'EMPTY_TRACEABILITY',
} as const
export type ReadinessFindingCode = typeof ReadinessFindingCode[keyof typeof ReadinessFindingCode]

export interface ReadinessFinding {
  readonly code: ReadinessFindingCode
  readonly field: string
  readonly message: string
}

export interface ReadinessEvaluationOutcome {
  readonly result: ReadinessResult
  readonly rulesVersion: typeof EXECUTION_CONTRACT_READINESS_VERSION
  /** Empty exactly when `result` is `PASS`. */
  readonly findings: readonly ReadinessFinding[]
}

/** One exact identity fact as both the contract claims it and canonical state currently shows it. */
export interface IdentityFactPair {
  readonly field: string
  readonly claimed: string
  readonly canonical: string
}

/** One canonical traceability link, as read fresh — never as the contract claims it. */
export interface CanonicalTraceabilityLink {
  readonly linkType: string
  readonly targetId: string
  readonly status: string
  readonly freshnessToken: string
}

export interface ReadinessEvaluationInput {
  readonly eligibilitySignal: EligibilitySignal
  /** The known-eligible statuses a spec/requirement/decision must show. Unrecognized values are MALFORMED_STATUS, not BLOCKED (AC-08). */
  readonly knownIneligibleStatuses: readonly string[]
  readonly specStatus: string
  readonly identity: readonly IdentityFactPair[]
  readonly claimedRequirements: readonly CanonicalTraceabilityLink[]
  readonly canonicalRequirements: readonly CanonicalTraceabilityLink[]
  readonly claimedDecisions: readonly CanonicalTraceabilityLink[]
  readonly canonicalDecisions: readonly CanonicalTraceabilityLink[]
}

function linkKey(link: CanonicalTraceabilityLink): string {
  return `${link.linkType}:${link.targetId}`
}

/**
 * Exact set equality (AC-05): every member must match on status and
 * freshness, membership is compared as a set (order-independent), and a
 * missing, additional, substituted or status-changed member is a mismatch.
 * Returns at most one finding per set so a caller sees "requirements
 * mismatch" and "decisions mismatch" as two facts, not one per link.
 */
function traceabilitySetMismatch(
  field: string,
  claimed: readonly CanonicalTraceabilityLink[],
  canonical: readonly CanonicalTraceabilityLink[],
): ReadinessFinding | null {
  const claimedByKey = new Map(claimed.map(link => [linkKey(link), link]))
  const canonicalByKey = new Map(canonical.map(link => [linkKey(link), link]))

  if (claimedByKey.size !== canonicalByKey.size) {
    return { code: ReadinessFindingCode.TRACEABILITY_SET_MISMATCH, field, message: `${field} link count differs from canonical state` }
  }

  for (const [key, canonicalLink] of canonicalByKey) {
    const claimedLink = claimedByKey.get(key)
    if (claimedLink === undefined) {
      return { code: ReadinessFindingCode.TRACEABILITY_SET_MISMATCH, field, message: `${field} is missing canonical link ${key}` }
    }
    if (claimedLink.status !== canonicalLink.status || claimedLink.freshnessToken !== canonicalLink.freshnessToken) {
      return { code: ReadinessFindingCode.TRACEABILITY_SET_MISMATCH, field, message: `${field} link ${key} does not match canonical status/freshness` }
    }
  }

  return null
}

function identityFindings(input: ReadinessEvaluationInput): ReadinessFinding[] {
  const findings: ReadinessFinding[] = []
  for (const fact of input.identity) {
    if (fact.claimed !== fact.canonical) {
      findings.push({
        code: ReadinessFindingCode.IDENTITY_MISMATCH,
        field: fact.field,
        message: `${fact.field} claimed '${fact.claimed}' but canonical state is '${fact.canonical}'`,
      })
    }
  }
  return findings
}

function traceabilityFindings(input: ReadinessEvaluationInput): ReadinessFinding[] {
  const findings: ReadinessFinding[] = []
  const requirementMismatch = traceabilitySetMismatch('traceability.requirements', input.claimedRequirements, input.canonicalRequirements)
  if (requirementMismatch !== null) findings.push(requirementMismatch)
  const decisionMismatch = traceabilitySetMismatch('traceability.decisions', input.claimedDecisions, input.canonicalDecisions)
  if (decisionMismatch !== null) findings.push(decisionMismatch)
  if (input.canonicalRequirements.length === 0) {
    findings.push({
      code: ReadinessFindingCode.EMPTY_TRACEABILITY,
      field: 'traceability.requirements',
      message: 'canonical requirement set is empty; eligibility should already have excluded this state',
    })
  }
  return findings
}

/** AC-08: a status this evaluator does not recognize at all is FAIL, never BLOCKED — BLOCKED is reserved for a status this evaluator understands and knows to be currently ineligible. */
function statusFinding(input: ReadinessEvaluationInput): ReadinessFinding | null {
  if (input.knownIneligibleStatuses.includes(input.specStatus) || input.specStatus === 'APPROVED') {
    return null
  }
  return { code: ReadinessFindingCode.MALFORMED_STATUS, field: 'specStatus', message: `specStatus '${input.specStatus}' is not a recognized status` }
}

/**
 * Evaluates readiness from already-resolved facts. Deterministic and pure:
 * the same input always produces the same result and the same findings, in
 * the same order (AC-01). Never mutates its input.
 */
export function evaluateExecutionContractReadiness(input: ReadinessEvaluationInput): ReadinessEvaluationOutcome {
  if (input.eligibilitySignal === EligibilitySignal.INCONCLUSIVE) {
    return { result: ReadinessResult.INCONCLUSIVE, rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION, findings: [] }
  }

  const malformedStatus = statusFinding(input)
  if (malformedStatus !== null) {
    return { result: ReadinessResult.FAIL, rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION, findings: [malformedStatus] }
  }

  const identity = identityFindings(input)
  if (identity.length > 0) {
    return { result: ReadinessResult.FAIL, rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION, findings: identity }
  }

  const traceability = traceabilityFindings(input)
  if (traceability.some(finding => finding.code === ReadinessFindingCode.TRACEABILITY_SET_MISMATCH)) {
    return { result: ReadinessResult.FAIL, rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION, findings: traceability }
  }
  if (traceability.length > 0) {
    return { result: ReadinessResult.BLOCKED, rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION, findings: traceability }
  }

  if (input.eligibilitySignal === EligibilitySignal.INELIGIBLE) {
    return {
      result: ReadinessResult.BLOCKED,
      rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION,
      findings: [{ code: ReadinessFindingCode.INELIGIBLE, field: 'eligibilitySignal', message: 'canonical eligibility is currently negative' }],
    }
  }

  return { result: ReadinessResult.PASS, rulesVersion: EXECUTION_CONTRACT_READINESS_VERSION, findings: [] }
}

export type ReadinessValidation<T> = Result<T, string>

/**
 * Structural narrowing of an untrusted `eligibilitySignal` value at a
 * boundary (e.g. an HTTP body). Returns a failure for anything outside the
 * three recognized signals rather than defaulting to any of them.
 */
export function parseEligibilitySignal(value: unknown): ReadinessValidation<EligibilitySignal> {
  if (value === EligibilitySignal.ELIGIBLE || value === EligibilitySignal.INELIGIBLE || value === EligibilitySignal.INCONCLUSIVE) {
    return ok(value)
  }
  return err(`eligibilitySignal must be one of ${Object.values(EligibilitySignal).join(', ')}`)
}
