import { expect, it } from 'vitest'
import {
  parseStrategicTruth,
  RequirementPriority,
  RequirementType,
} from './strategic-truth.js'

function parseDecisionWithDate(decidedAt: string) {
  return parseStrategicTruth({
    documentSourceId: 'source-a',
    sourceSnapshotId: 'snapshot-a',
    contentText: [
      '## DEC-RIC-031 — Deterministic date',
      '- Status: APPROVED',
      '- Decision: Parse dates independently of the host timezone.',
      `- Decided at: ${decidedAt}`,
    ].join('\n'),
  })
}

it('extracts only explicit requirements, allowed constraints and canonical decisions', () => {
  const candidate = parseStrategicTruth({
    documentSourceId: 'source-a',
    sourceSnapshotId: 'snapshot-a',
    contentText: [
      '# Requirements',
      'REQ-001: [P0] The operator can inspect the project.',
      'NFR-002: Priority: P1 The response is deterministic.',
      'Ordinary prose must not become a requirement.',
      '',
      '## Constraints',
      '- The extractor must not call external providers.',
      '',
      '## Non-goals',
      '- No Jira synchronization is implemented here.',
      '- A future idea is intentionally not a constraint.',
      '',
      '## DEC-RIC-004 — Deterministic extraction',
      '- Status: APPROVED',
      '- Decision: Use deterministic parsing only.',
      '- Consequences: Missing truth remains unresolved.',
      '',
      'This paragraph references DEC-RIC-999 but is not a decision record.',
    ].join('\n'),
  })

  expect(candidate.valid).toBe(true)
  expect(candidate.requirements.filter(item => item.type === RequirementType.CONSTRAINT)).toHaveLength(2)
  expect(candidate.requirements.filter(item => item.type === RequirementType.CONSTRAINT)
    .every(item => /^CON-[0-9A-F]{16}$/.test(item.code))).toBe(true)
  expect(candidate.requirements.find(item => item.code === 'REQ-001')?.priority).toBe(RequirementPriority.P0)
  expect(candidate.requirements.find(item => item.code === 'NFR-002')?.priority).toBe(RequirementPriority.P1)
  expect(candidate.requirements.find(item => item.code.startsWith('CON-'))?.type).toBe(RequirementType.CONSTRAINT)
  expect(candidate.requirements.some(item => item.title.includes('Ordinary prose'))).toBe(false)
  expect(candidate.decisions).toHaveLength(1)
  expect(candidate.decisions[0]?.code).toBe('DEC-RIC-004')
  expect(candidate.decisions[0]?.status).toBe('APPROVED')
})

it('does not infer priority or decisions from ordinary prose', () => {
  const candidate = parseStrategicTruth({
    documentSourceId: 'source-a',
    sourceSnapshotId: 'snapshot-a',
    contentText: [
      'The P0 heading is important but not a requirement.',
      'This paragraph references DEC-RIC-004 and REQ-999.',
      '## Constraints',
      '- A plainly stated rule is explicit only because it is in this section.',
    ].join('\n'),
  })

  expect(candidate.requirements).toHaveLength(1)
  expect(candidate.requirements[0]?.priority).toBe(RequirementPriority.UNSPECIFIED)
  expect(candidate.decisions).toEqual([])
})

it('returns a blocking diagnostic for an incomplete canonical decision', () => {
  const candidate = parseStrategicTruth({
    documentSourceId: 'source-a',
    sourceSnapshotId: 'snapshot-a',
    contentText: [
      '## DEC-RIC-004 — Incomplete record',
      '- Status: APPROVED',
    ].join('\n'),
  })

  expect(candidate.valid).toBe(false)
  expect(candidate.decisions).toEqual([])
  expect(candidate.diagnostics.some(item => item.code === 'AMBIGUOUS_DECISION')).toBe(true)
})

it('keeps synthetic constraint identity stable and changes it when wording changes', () => {
  const base = {
    documentSourceId: 'source-a',
    sourceSnapshotId: 'snapshot-a',
  }
  const first = parseStrategicTruth({ ...base, contentText: '## Rules\n- Preserve exact wording.' })
  const repeat = parseStrategicTruth({ ...base, contentText: '## Rules\n- Preserve exact wording.' })
  const changed = parseStrategicTruth({ ...base, contentText: '## Rules\n- Preserve different wording.' })
  expect(first.requirements[0]?.code).toBe(repeat.requirements[0]?.code)
  expect(first.requirements[0]?.code).not.toBe(changed.requirements[0]?.code)
  expect(first.requirements[0]?.code).toBe('CON-AB693D5AC3499873')
})

it('canonicalizes a timezone-less decision date as UTC under multiple host timezones', () => {
  const previousTimezone = process.env.TZ
  try {
    const canonicalValues = ['UTC', 'Europe/Berlin', 'America/Los_Angeles'].map((timezone) => {
      process.env.TZ = timezone
      const isoCandidate = parseDecisionWithDate('2026-08-20 10:00')
      const legacyCandidate = parseDecisionWithDate('August 20, 2026 10:00 PM')
      expect(isoCandidate.valid).toBe(true)
      expect(legacyCandidate.valid).toBe(true)
      return [
        isoCandidate.decisions[0]?.decidedAt?.toISOString(),
        legacyCandidate.decisions[0]?.decidedAt?.toISOString(),
      ]
    })
    expect(canonicalValues).toEqual([
      ['2026-08-20T10:00:00.000Z', '2026-08-20T22:00:00.000Z'],
      ['2026-08-20T10:00:00.000Z', '2026-08-20T22:00:00.000Z'],
      ['2026-08-20T10:00:00.000Z', '2026-08-20T22:00:00.000Z'],
    ])
  }
  finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ
    }
    else {
      process.env.TZ = previousTimezone
    }
  }
})

it.each([
  ['2026-08-20', '2026-08-20T00:00:00.000Z'],
  ['2026-08-20T10:00:00Z', '2026-08-20T10:00:00.000Z'],
  ['2026-08-20T10:00:00+02:00', '2026-08-20T08:00:00.000Z'],
  ['2026-08-20T10:00:00-0730', '2026-08-20T17:30:00.000Z'],
  ['2026-08-20T24:00:00Z', '2026-08-21T00:00:00.000Z'],
  ['2026-08-20T10:00:00.123456789012Z', '2026-08-20T10:00:00.123Z'],
  ['Thu, 20 Aug 2026 10:00:00 GMT', '2026-08-20T10:00:00.000Z'],
  ['Thu, 20 Aug 2026 10:00:00 UTC', '2026-08-20T10:00:00.000Z'],
  ['Thu, 20 Aug 2026 10:00:00 PST', '2026-08-20T18:00:00.000Z'],
])('preserves the meaning of explicit decision date %s', (value, expected) => {
  const candidate = parseDecisionWithDate(value)
  expect(candidate.valid).toBe(true)
  expect(candidate.decisions[0]?.decidedAt?.toISOString()).toBe(expected)
})

it.each([
  'not-a-date',
  '2026-02-30T10:00',
  '2026-08-20T24:01',
  '2026-08-20T10:00:00+24:00',
])('rejects invalid decision date %s with the existing typed diagnostic', (value) => {
  const candidate = parseDecisionWithDate(value)
  expect(candidate.valid).toBe(false)
  expect(candidate.decisions).toEqual([])
  expect(candidate.diagnostics).toContainEqual(expect.objectContaining({
    code: 'AMBIGUOUS_DECISION',
    severity: 'ERROR',
    message: 'Decision DEC-RIC-031 has an invalid decided-at value.',
  }))
})
