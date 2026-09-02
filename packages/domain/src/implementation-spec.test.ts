/**
 * Unit tests for the deterministic SDD specification rules.
 *
 * Pure functions only — no database, no clock, no network. Every assertion
 * here is about a decision the domain layer must make identically every
 * time, which is the property the persistence layer relies on when it
 * re-runs validation inside a transaction instead of trusting a stored
 * verdict.
 *
 * NDERCC-23 / DEC-RIC-010: governed SDD specification lifecycle (P1-038).
 */
import { describe, expect, it } from 'vitest'
import {
  canonicalSpecContent,
  canTransitionImplementationSpecStatus,
  compareSpecVersions,
  evaluateSpecExecutionEligibility,
  formatSpecVersion,
  ImplementationSpecStatus,
  isImplementationSpecContentMutable,
  isSpecVersionGreater,
  isTerminalImplementationSpecStatus,
  normalizeSpecCode,
  normalizeSpecText,
  parseImplementationSpecContent,
  parseSpecVersion,
  SPEC_LIFECYCLE_VERSION,
  SpecEligibilityReason,
  SpecValidationCode,
  validateImplementationSpec,
  validateSpecStatements,
} from './implementation-spec.js'
import type { ImplementationSpecContent, ImplementationSpecContentInput, SpecVersion } from './implementation-spec.js'

const ALL_STATUSES = [
  ImplementationSpecStatus.DRAFT,
  ImplementationSpecStatus.APPROVED,
  ImplementationSpecStatus.REJECTED,
  ImplementationSpecStatus.SUPERSEDED,
] as const

function version(major: number, minor: number, patch: number): SpecVersion {
  return { major, minor, patch }
}

function contentInput(overrides: Partial<ImplementationSpecContentInput> = {}): ImplementationSpecContentInput {
  return {
    title: 'Governed SDD specification lifecycle',
    behavior: 'A specification must be approved before a contract may be derived from it.',
    scope: ['persist the specification aggregate'],
    nonGoals: ['no Execution Contract schema'],
    acceptanceCriteria: ['an invalid specification cannot become APPROVED'],
    constraints: [],
    dependencies: [],
    risks: [],
    interfaces: [],
    validationStrategy: [],
    ...overrides,
  }
}

function parsedContent(overrides: Partial<ImplementationSpecContentInput> = {}): ImplementationSpecContent {
  const parsed = parseImplementationSpecContent(contentInput(overrides))

  if (!parsed.ok) {
    throw new Error(`fixture is not parseable: ${parsed.error}`)
  }

  return parsed.value
}

describe('implementation specification lifecycle', () => {
  it('allows only approval and rejection out of DRAFT', () => {
    expect(canTransitionImplementationSpecStatus('DRAFT', 'APPROVED')).toBe(true)
    expect(canTransitionImplementationSpecStatus('DRAFT', 'REJECTED')).toBe(true)
    expect(canTransitionImplementationSpecStatus('DRAFT', 'SUPERSEDED')).toBe(false)
    expect(canTransitionImplementationSpecStatus('DRAFT', 'DRAFT')).toBe(false)
  })

  it('lets an approved specification only be superseded, never retracted', () => {
    expect(canTransitionImplementationSpecStatus('APPROVED', 'SUPERSEDED')).toBe(true)
    expect(canTransitionImplementationSpecStatus('APPROVED', 'REJECTED')).toBe(false)
    expect(canTransitionImplementationSpecStatus('APPROVED', 'DRAFT')).toBe(false)
  })

  it('permits no transition at all out of a terminal state', () => {
    for (const terminal of [ImplementationSpecStatus.REJECTED, ImplementationSpecStatus.SUPERSEDED]) {
      expect(isTerminalImplementationSpecStatus(terminal)).toBe(true)

      for (const target of ALL_STATUSES) {
        expect(canTransitionImplementationSpecStatus(terminal, target)).toBe(false)
      }
    }
  })

  it('treats DRAFT and APPROVED as non-terminal', () => {
    expect(isTerminalImplementationSpecStatus('DRAFT')).toBe(false)
    expect(isTerminalImplementationSpecStatus('APPROVED')).toBe(false)
  })

  it('freezes content everywhere except DRAFT', () => {
    expect(isImplementationSpecContentMutable('DRAFT')).toBe(true)
    expect(isImplementationSpecContentMutable('APPROVED')).toBe(false)
    expect(isImplementationSpecContentMutable('REJECTED')).toBe(false)
    expect(isImplementationSpecContentMutable('SUPERSEDED')).toBe(false)
  })
})

describe('specification version identity', () => {
  it('parses a canonical three-part version', () => {
    const parsed = parseSpecVersion(' 2.1.0 ')

    expect(parsed).toEqual({ ok: true, value: version(2, 1, 0) })
  })

  it('rejects a v prefix rather than silently stripping it', () => {
    const parsed = parseSpecVersion('v1.0.0')

    expect(parsed.ok).toBe(false)
  })

  it.each([
    ['1.0', 'too few parts'],
    ['1.0.0.1', 'too many parts'],
    ['1.0.x', 'a non-numeric component'],
    ['1..0', 'an empty component'],
    ['01.0.0', 'a leading zero'],
    ['1.00.0', 'a leading zero in the minor'],
    ['-1.0.0', 'a negative component'],
    ['2147483648.0.0', 'a component past the INTEGER bound'],
  ])('rejects %s (%s)', (raw, _description) => {
    expect(parseSpecVersion(raw).ok).toBe(false)
  })

  it('accepts a bare zero component but not a padded one', () => {
    expect(parseSpecVersion('0.0.0').ok).toBe(true)
    expect(parseSpecVersion('0.0.00').ok).toBe(false)
  })

  it('formats back to the exact canonical spelling it parsed', () => {
    expect(formatSpecVersion(version(10, 2, 30))).toBe('10.2.30')
  })

  it('orders by major, then minor, then patch', () => {
    expect(compareSpecVersions(version(1, 0, 0), version(2, 0, 0))).toBeLessThan(0)
    expect(compareSpecVersions(version(1, 9, 9), version(1, 10, 0))).toBeLessThan(0)
    expect(compareSpecVersions(version(1, 0, 1), version(1, 0, 0))).toBeGreaterThan(0)
    expect(compareSpecVersions(version(3, 4, 5), version(3, 4, 5))).toBe(0)
  })

  it('does not treat an equal version as an advance', () => {
    expect(isSpecVersionGreater(version(1, 0, 0), version(1, 0, 0))).toBe(false)
    expect(isSpecVersionGreater(version(1, 0, 0), version(1, 0, 1))).toBe(false)
    expect(isSpecVersionGreater(version(1, 1, 0), version(1, 0, 9))).toBe(true)
  })
})

describe('specification identity and field normalization', () => {
  it('trims and uppercases a lineage code', () => {
    expect(normalizeSpecCode('  ric-spec-ndercc-23-001 ')).toEqual({ ok: true, value: 'RIC-SPEC-NDERCC-23-001' })
  })

  it('rejects an empty code', () => {
    expect(normalizeSpecCode('   ').ok).toBe(false)
  })

  it('trims required text and rejects a blank value', () => {
    expect(normalizeSpecText('  behaviour  ', 'behavior')).toEqual({ ok: true, value: 'behaviour' })
    expect(normalizeSpecText('   ', 'behavior').ok).toBe(false)
  })

  it('accepts an ordered array of non-empty strings and preserves its order', () => {
    expect(validateSpecStatements([' b ', 'a'], 'scope')).toEqual({ ok: true, value: ['b', 'a'] })
  })

  it('accepts an empty list', () => {
    expect(validateSpecStatements([], 'risks')).toEqual({ ok: true, value: [] })
  })

  it.each([
    [null, 'not an array'],
    ['scope', 'a bare string'],
    [[1], 'a non-string entry'],
    [['  '], 'a blank entry'],
  ])('rejects %s (%s)', (value, _description) => {
    expect(validateSpecStatements(value, 'scope').ok).toBe(false)
  })
})

describe('specification content narrowing', () => {
  it('narrows a well-formed body and trims every string', () => {
    const parsed = parseImplementationSpecContent(contentInput({ title: '  Titled  ', scope: [' one '] }))

    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.value.title).toBe('Titled')
    expect(parsed.ok && parsed.value.scope).toEqual(['one'])
  })

  it('rejects a blank title or behavior as a malformed body, not an incomplete draft', () => {
    expect(parseImplementationSpecContent(contentInput({ title: '  ' })).ok).toBe(false)
    expect(parseImplementationSpecContent(contentInput({ behavior: '' })).ok).toBe(false)
  })

  it('rejects a statement list that is not an array', () => {
    expect(parseImplementationSpecContent(contentInput({ risks: 'none' })).ok).toBe(false)
  })
})

describe('deterministic specification validation', () => {
  it('accepts a body that declares scope, non-goals and verifiable criteria', () => {
    const outcome = validateImplementationSpec(parsedContent())

    expect(outcome.valid).toBe(true)
    expect(outcome.findings).toEqual([])
    expect(outcome.rulesVersion).toBe(SPEC_LIFECYCLE_VERSION)
  })

  it('does not require the RIC-E07A "quando aplicavel" lists to be populated', () => {
    const outcome = validateImplementationSpec(parsedContent({
      constraints: [],
      dependencies: [],
      risks: [],
      interfaces: [],
      validationStrategy: [],
    }))

    expect(outcome.valid).toBe(true)
  })

  it('reports a missing scope, non-goals list and acceptance criteria in a fixed order', () => {
    const outcome = validateImplementationSpec(parsedContent({ scope: [], nonGoals: [], acceptanceCriteria: [] }))

    expect(outcome.valid).toBe(false)
    expect(outcome.findings.map(finding => finding.code)).toEqual([
      SpecValidationCode.MISSING_SCOPE,
      SpecValidationCode.MISSING_NON_GOALS,
      SpecValidationCode.MISSING_ACCEPTANCE_CRITERIA,
    ])
  })

  it('treats an empty acceptance-criteria list as a hard finding', () => {
    const outcome = validateImplementationSpec(parsedContent({ acceptanceCriteria: [] }))

    expect(outcome.valid).toBe(false)
    expect(outcome.findings).toHaveLength(1)
    expect(outcome.findings[0]?.code).toBe(SpecValidationCode.MISSING_ACCEPTANCE_CRITERIA)
  })

  it('returns the same verdict for the same content every time', () => {
    const content = parsedContent({ scope: [] })

    expect(validateImplementationSpec(content)).toEqual(validateImplementationSpec(content))
  })
})

describe('canonical content serialization', () => {
  /** A rule-set version that is deliberately not the installed one, standing in for a specification authored under earlier rules. */
  const HISTORICAL_RULES = 'P1_038_V0'
  /** A rule-set version standing in for a future bump, so a test can prove an old specification is unaffected by one. */
  const FUTURE_RULES = 'P1_038_V2'

  function canonical(rulesVersion: string, overrides: Partial<ImplementationSpecContentInput> = {}): string {
    return canonicalSpecContent({ rulesVersion, content: parsedContent(overrides) })
  }

  it('is stable across separately constructed but identical content', () => {
    expect(canonical(SPEC_LIFECYCLE_VERSION)).toBe(canonical(SPEC_LIFECYCLE_VERSION))
  })

  it('changes when any content field changes', () => {
    expect(canonical(SPEC_LIFECYCLE_VERSION)).not.toBe(
      canonical(SPEC_LIFECYCLE_VERSION, { risks: ['a newly recorded risk'] }),
    )
  })

  it('ignores the order the input object was built in', () => {
    const straight = parseImplementationSpecContent(contentInput())
    const reordered = parseImplementationSpecContent({
      validationStrategy: [],
      interfaces: [],
      risks: [],
      dependencies: [],
      constraints: [],
      acceptanceCriteria: ['an invalid specification cannot become APPROVED'],
      nonGoals: ['no Execution Contract schema'],
      scope: ['persist the specification aggregate'],
      behavior: 'A specification must be approved before a contract may be derived from it.',
      title: 'Governed SDD specification lifecycle',
    })
    const rulesVersion = SPEC_LIFECYCLE_VERSION

    expect(straight.ok && reordered.ok && canonicalSpecContent({ rulesVersion, content: straight.value })).toBe(
      straight.ok && reordered.ok && canonicalSpecContent({ rulesVersion, content: reordered.value }),
    )
  })

  it('distinguishes statement order, because a specification is an ordered document', () => {
    expect(canonical(SPEC_LIFECYCLE_VERSION, { scope: ['a', 'b'] })).not.toBe(
      canonical(SPEC_LIFECYCLE_VERSION, { scope: ['b', 'a'] }),
    )
  })

  // ── Historical hash determinism ────────────────────────────────────────────

  it('takes the rule-set version from its argument, never from module scope', () => {
    // The serialised form names the version it was given. If the function
    // read SPEC_LIFECYCLE_VERSION internally, this could not hold.
    expect(canonical(HISTORICAL_RULES)).toContain(HISTORICAL_RULES)
    expect(canonical(HISTORICAL_RULES)).not.toContain(SPEC_LIFECYCLE_VERSION)
  })

  it('gives the same result for the same content under the same rule set, every time', () => {
    expect(canonical(HISTORICAL_RULES)).toBe(canonical(HISTORICAL_RULES))
    expect(canonical(FUTURE_RULES)).toBe(canonical(FUTURE_RULES))
  })

  it('does not collapse identical bodies interpreted under different rule sets', () => {
    // Two specifications whose words match but whose governing rules differ
    // are not the same canonical specification: the rules decide what the
    // words mean.
    expect(canonical(HISTORICAL_RULES)).not.toBe(canonical(SPEC_LIFECYCLE_VERSION))
    expect(canonical(SPEC_LIFECYCLE_VERSION)).not.toBe(canonical(FUTURE_RULES))
  })

  it('leaves an older rule set untouched when a newer one exists', () => {
    // The defect this replaces: recomputing an old specification once the
    // installed version had moved on produced a different canonical form.
    // With the version supplied explicitly, the old serialisation is a
    // function of the old inputs alone and cannot move.
    const before = canonical(HISTORICAL_RULES)

    // Serialising under newer rule sets in between must change nothing.
    canonical(SPEC_LIFECYCLE_VERSION)
    canonical(FUTURE_RULES)

    expect(canonical(HISTORICAL_RULES)).toBe(before)
  })
})

describe('execution eligibility', () => {
  const approvedAndValid = { status: ImplementationSpecStatus.APPROVED, contentValid: true }

  it('is eligible for an approved, valid specification traced to current truth', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: approvedAndValid,
      linkedRequirements: [{ id: 'req-1', status: 'ACTIVE' }],
      linkedDecisions: [{ id: 'dec-1', status: 'APPROVED' }],
    })

    expect(outcome).toEqual({ eligible: true, rulesVersion: SPEC_LIFECYCLE_VERSION, findings: [] })
  })

  it('reports MISSING and nothing else when no specification is bound', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: null,
      linkedRequirements: [],
      linkedDecisions: [],
    })

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.MISSING])
  })

  it.each([
    [ImplementationSpecStatus.DRAFT, SpecEligibilityReason.NOT_APPROVED],
    [ImplementationSpecStatus.REJECTED, SpecEligibilityReason.NOT_APPROVED],
    [ImplementationSpecStatus.SUPERSEDED, SpecEligibilityReason.SUPERSEDED],
  ])('blocks a %s specification with %s', (status, reason) => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status, contentValid: true },
      linkedRequirements: [],
      linkedDecisions: [],
    })

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings.map(finding => finding.reason)).toEqual([reason])
  })

  it('blocks an approved specification whose stored body no longer validates', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status: ImplementationSpecStatus.APPROVED, contentValid: false },
      linkedRequirements: [],
      linkedDecisions: [],
    })

    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.INVALID_CONTENT])
  })

  it('blocks when a linked requirement has been superseded', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: approvedAndValid,
      linkedRequirements: [{ id: 'req-1', status: 'ACTIVE' }, { id: 'req-2', status: 'SUPERSEDED' }],
      linkedDecisions: [],
    })

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings).toEqual([{
      reason: SpecEligibilityReason.STALE_STRATEGIC_TRUTH,
      message: 'linked requirement is SUPERSEDED',
      subjectId: 'req-2',
    }])
  })

  it.each(['PROPOSED', 'REJECTED', 'SUPERSEDED'] as const)('blocks when a linked decision is %s', (status) => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: approvedAndValid,
      linkedRequirements: [],
      linkedDecisions: [{ id: 'dec-1', status }],
    })

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings[0]?.reason).toBe(SpecEligibilityReason.STALE_STRATEGIC_TRUTH)
    expect(outcome.findings[0]?.subjectId).toBe('dec-1')
  })

  it('reports every applicable reason in one pass rather than only the first', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status: ImplementationSpecStatus.DRAFT, contentValid: false },
      linkedRequirements: [{ id: 'req-1', status: 'SUPERSEDED' }],
      linkedDecisions: [{ id: 'dec-1', status: 'REJECTED' }],
    })

    expect(outcome.findings.map(finding => finding.reason)).toEqual([
      SpecEligibilityReason.NOT_APPROVED,
      SpecEligibilityReason.INVALID_CONTENT,
      SpecEligibilityReason.STALE_STRATEGIC_TRUTH,
      SpecEligibilityReason.STALE_STRATEGIC_TRUTH,
    ])
  })

  it('returns an identical outcome for identical input', () => {
    const input = {
      spec: { status: ImplementationSpecStatus.DRAFT, contentValid: true },
      linkedRequirements: [{ id: 'req-1', status: 'SUPERSEDED' }],
      linkedDecisions: [],
    } as const

    expect(evaluateSpecExecutionEligibility(input)).toEqual(evaluateSpecExecutionEligibility(input))
  })
})
