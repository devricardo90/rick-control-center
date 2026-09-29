/**
 * Domain-level readiness classifier tests (AC-01, AC-02, AC-04 through AC-08, AC-10).
 *
 * AC-03 (trusted canonical re-evaluation) and AC-11 (concurrency) are proven
 * at the database boundary, where the canonical facts this module consumes
 * are actually read fresh — see `packages/database/src/execution-contract-readiness.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import {
  EligibilitySignal,
  evaluateExecutionContractReadiness,
  parseEligibilitySignal,
  ReadinessFindingCode,
  ReadinessResult,
} from './execution-contract-readiness.js'
import type { CanonicalTraceabilityLink, ReadinessEvaluationInput } from './execution-contract-readiness.js'

const REQUIREMENT: CanonicalTraceabilityLink = { linkType: 'REQUIREMENT', targetId: 'req-1', status: 'ACTIVE', freshnessToken: 't1' }
const DECISION: CanonicalTraceabilityLink = { linkType: 'DECISION', targetId: 'dec-1', status: 'APPROVED', freshnessToken: 'd1' }

function readyInput(): ReadinessEvaluationInput {
  return {
    eligibilitySignal: EligibilitySignal.ELIGIBLE,
    knownIneligibleStatuses: ['DRAFT', 'REJECTED', 'SUPERSEDED'],
    specStatus: 'APPROVED',
    identity: [
      { field: 'projectId', claimed: 'project-rcc', canonical: 'project-rcc' },
      { field: 'contentHash', claimed: 'hash-1', canonical: 'hash-1' },
    ],
    claimedRequirements: [REQUIREMENT],
    canonicalRequirements: [REQUIREMENT],
    claimedDecisions: [DECISION],
    canonicalDecisions: [DECISION],
  }
}

describe('AC-01: deterministic complete readiness', () => {
  it('produces an identical PASS result and empty findings on repeated evaluation', () => {
    const first = evaluateExecutionContractReadiness(readyInput())
    const second = evaluateExecutionContractReadiness(readyInput())

    expect(first).toEqual(second)
    expect(first.result).toBe(ReadinessResult.PASS)
    expect(first.findings).toEqual([])
  })

  it('does not mutate its input', () => {
    const input = readyInput()
    const snapshot = structuredClone(input)

    evaluateExecutionContractReadiness(input)

    expect(input).toEqual(snapshot)
  })
})

describe('AC-02 / AC-08: fail-closed status and fact classification', () => {
  it('FAILs, never BLOCKs, an unrecognized/malformed status', () => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), specStatus: 'NOT_A_REAL_STATUS' })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
    expect(outcome.findings[0]?.code).toBe(ReadinessFindingCode.MALFORMED_STATUS)
  })

  it('BLOCKs a known-but-currently-ineligible status, exactly as the accompanying eligibility signal reports it', () => {
    // The database boundary always derives specStatus and eligibilitySignal
    // from the same eligibility read, so a known ineligible status is always
    // paired with a negative signal — never with ELIGIBLE.
    const outcome = evaluateExecutionContractReadiness({
      ...readyInput(),
      specStatus: 'DRAFT',
      eligibilitySignal: EligibilitySignal.INELIGIBLE,
    })

    expect(outcome.result).toBe(ReadinessResult.BLOCKED)
  })

  it('BLOCKs on a negative eligibility signal alone, with no identity/traceability findings', () => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), eligibilitySignal: EligibilitySignal.INELIGIBLE })

    expect(outcome.result).toBe(ReadinessResult.BLOCKED)
    expect(outcome.findings).toEqual([
      { code: ReadinessFindingCode.INELIGIBLE, field: 'eligibilitySignal', message: 'canonical eligibility is currently negative' },
    ])
  })

  it('reports a stable finding code per fact class rather than one generic rejection', () => {
    const outcome = evaluateExecutionContractReadiness({
      ...readyInput(),
      identity: [{ field: 'contentHash', claimed: 'hash-1', canonical: 'hash-2' }],
    })

    expect(outcome.findings).toHaveLength(1)
    expect(outcome.findings[0]?.code).toBe(ReadinessFindingCode.IDENTITY_MISMATCH)
    expect(outcome.findings[0]?.field).toBe('contentHash')
    expect(outcome.findings[0]?.message).toContain('hash-1')
  })
})

describe('GAP-07 boundary: INCONCLUSIVE is preserved, never collapsed', () => {
  it('returns INCONCLUSIVE unchanged when the signal is INCONCLUSIVE, even with mismatched facts', () => {
    const outcome = evaluateExecutionContractReadiness({
      ...readyInput(),
      eligibilitySignal: EligibilitySignal.INCONCLUSIVE,
      identity: [{ field: 'projectId', claimed: 'a', canonical: 'b' }],
    })

    expect(outcome.result).toBe(ReadinessResult.INCONCLUSIVE)
    expect(outcome.findings).toEqual([])
  })

  it('never reinterprets INCONCLUSIVE as PASS, BLOCKED or FAIL', () => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), eligibilitySignal: EligibilitySignal.INCONCLUSIVE })

    expect([ReadinessResult.PASS, ReadinessResult.BLOCKED, ReadinessResult.FAIL]).not.toContain(outcome.result)
  })
})

describe('AC-04 / AC-07: exact identity binding', () => {
  it.each(['projectId', 'contentHash'])('FAILs when %s disagrees with canonical state', (field) => {
    const outcome = evaluateExecutionContractReadiness({
      ...readyInput(),
      identity: [{ field, claimed: 'claimed-value', canonical: 'canonical-value' }],
    })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
    expect(outcome.findings[0]?.field).toBe(field)
  })

  it('PASSes when every identity fact agrees exactly', () => {
    const outcome = evaluateExecutionContractReadiness(readyInput())
    expect(outcome.result).toBe(ReadinessResult.PASS)
  })
})

describe('AC-05: exact traceability set equality', () => {
  it('FAILs on a missing canonical requirement link', () => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), claimedRequirements: [] })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
    expect(outcome.findings[0]?.code).toBe(ReadinessFindingCode.TRACEABILITY_SET_MISMATCH)
  })

  it('FAILs on an additional claimed link not present canonically', () => {
    const extra: CanonicalTraceabilityLink = { linkType: 'REQUIREMENT', targetId: 'req-2', status: 'ACTIVE', freshnessToken: 't2' }
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), claimedRequirements: [REQUIREMENT, extra] })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
  })

  it('FAILs on a substituted link (same count, different target)', () => {
    const substitute: CanonicalTraceabilityLink = { linkType: 'REQUIREMENT', targetId: 'req-9', status: 'ACTIVE', freshnessToken: 't9' }
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), claimedRequirements: [substitute], canonicalRequirements: [REQUIREMENT] })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
  })

  it('FAILs when a link status changed since the claim was made', () => {
    const stale: CanonicalTraceabilityLink = { ...REQUIREMENT, status: 'SUPERSEDED' }
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), canonicalRequirements: [stale] })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
  })

  it('is order-independent: reordering the same set does not change the result', () => {
    const a: CanonicalTraceabilityLink = { linkType: 'REQUIREMENT', targetId: 'req-a', status: 'ACTIVE', freshnessToken: 'ta' }
    const b: CanonicalTraceabilityLink = { linkType: 'REQUIREMENT', targetId: 'req-b', status: 'ACTIVE', freshnessToken: 'tb' }
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), claimedRequirements: [b, a], canonicalRequirements: [a, b] })

    expect(outcome.result).toBe(ReadinessResult.PASS)
  })

  it('flags an empty canonical requirement set as a defensive backstop', () => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), claimedRequirements: [], canonicalRequirements: [] })

    expect(outcome.result).not.toBe(ReadinessResult.PASS)
    expect(outcome.findings.some(finding => finding.code === ReadinessFindingCode.EMPTY_TRACEABILITY)).toBe(true)
  })

  it('does not require a decision link to PASS', () => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), claimedDecisions: [], canonicalDecisions: [] })
    expect(outcome.result).toBe(ReadinessResult.PASS)
  })
})

describe('AC-10: each negative vector is individually attributable', () => {
  const cases: [string, Partial<ReadinessEvaluationInput>][] = [
    ['forged eligibility (negative signal)', { eligibilitySignal: EligibilitySignal.INELIGIBLE }],
    ['malformed status', { specStatus: 'UNKNOWN_STATUS' }],
    ['missing link', { claimedRequirements: [] }],
    ['additional link', { claimedRequirements: [REQUIREMENT, { linkType: 'REQUIREMENT', targetId: 'req-extra', status: 'ACTIVE', freshnessToken: 'x' }] }],
    ['identity mismatch', { identity: [{ field: 'projectId', claimed: 'a', canonical: 'b' }] }],
  ]

  it.each(cases)('%s does not PASS', (_label, overrides) => {
    const outcome = evaluateExecutionContractReadiness({ ...readyInput(), ...overrides })
    expect(outcome.result).not.toBe(ReadinessResult.PASS)
  })
})

describe('parseEligibilitySignal', () => {
  it('accepts each recognized signal', () => {
    for (const value of Object.values(EligibilitySignal)) {
      expect(parseEligibilitySignal(value)).toEqual({ ok: true, value })
    }
  })

  it('rejects an unrecognized value rather than defaulting', () => {
    const result = parseEligibilitySignal('MAYBE')
    expect(result.ok).toBe(false)
  })
})
