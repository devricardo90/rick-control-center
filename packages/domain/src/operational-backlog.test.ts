/**
 * Unit tests for the pure operational-backlog rules.
 *
 * These need no database: every rule under test is a total function. The
 * database-enforced half of the model (composite ownership keys, uniqueness,
 * cycle rejection under concurrency) is proven separately against real
 * PostgreSQL in `@rick/database`.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import { describe, expect, it } from 'vitest'
import {
  BacklogExternalProvider,
  canTransitionEpicStatus,
  canTransitionSprintStatus,
  canTransitionTaskStatus,
  EpicStatus,
  isDependencySatisfiedBy,
  isEpicPlanningMutable,
  isSprintPlanningMutable,
  isTaskPlanningMutable,
  isTerminalEpicStatus,
  isTerminalSprintStatus,
  isTerminalTaskStatus,
  normalizeBacklogCode,
  normalizeOptionalText,
  normalizeRequiredText,
  planningTransitionEffect,
  SprintStatus,
  TASK_PRIORITY_RANK,
  taskPriorityRank,
  TaskPriority,
  TaskStatus,
  taskTransitionEffect,
  TaskType,
  validateAcceptanceCriteria,
  validateExternalIdentity,
  validateSequence,
} from './operational-backlog.js'

const SPRINT_STATUSES = Object.values(SprintStatus)
const TASK_STATUSES = Object.values(TaskStatus)

describe('sprint and epic lifecycle', () => {
  const allowed: ReadonlyArray<readonly [SprintStatus, SprintStatus]> = [
    ['PLANNED', 'ACTIVE'],
    ['ACTIVE', 'COMPLETED'],
    ['PLANNED', 'CANCELLED'],
    ['ACTIVE', 'CANCELLED'],
  ]

  it.each(allowed)('allows %s -> %s for both Sprint and Epic', (from, to) => {
    expect(canTransitionSprintStatus(from, to)).toBe(true)
    expect(canTransitionEpicStatus(from, to)).toBe(true)
  })

  it('rejects every transition that is not explicitly allowed', () => {
    const allowedKeys = new Set(allowed.map(([from, to]) => `${from}->${to}`))

    for (const from of SPRINT_STATUSES) {
      for (const to of SPRINT_STATUSES) {
        if (allowedKeys.has(`${from}->${to}`)) {
          continue
        }
        expect(canTransitionSprintStatus(from, to)).toBe(false)
        expect(canTransitionEpicStatus(from, to)).toBe(false)
      }
    }
  })

  it('treats COMPLETED and CANCELLED as terminal and PLANNED/ACTIVE as not', () => {
    expect(isTerminalSprintStatus('COMPLETED')).toBe(true)
    expect(isTerminalSprintStatus('CANCELLED')).toBe(true)
    expect(isTerminalSprintStatus('PLANNED')).toBe(false)
    expect(isTerminalSprintStatus('ACTIVE')).toBe(false)
    expect(isTerminalEpicStatus('COMPLETED')).toBe(true)
    expect(isTerminalEpicStatus('ACTIVE')).toBe(false)
  })

  it('never re-enters a state from itself', () => {
    for (const status of SPRINT_STATUSES) {
      expect(canTransitionSprintStatus(status, status)).toBe(false)
    }
  })

  it('freezes structural planning fields once the record leaves PLANNED', () => {
    expect(isSprintPlanningMutable('PLANNED')).toBe(true)
    expect(isEpicPlanningMutable('PLANNED')).toBe(true)

    for (const status of SPRINT_STATUSES.filter(candidate => candidate !== SprintStatus.PLANNED)) {
      expect(isSprintPlanningMutable(status)).toBe(false)
      expect(isEpicPlanningMutable(status)).toBe(false)
    }
  })
})

describe('task lifecycle', () => {
  const allowed: ReadonlyArray<readonly [TaskStatus, TaskStatus]> = [
    ['TODO', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'IN_REVIEW'],
    ['IN_REVIEW', 'IN_PROGRESS'],
    ['IN_REVIEW', 'DONE'],
    ['TODO', 'CANCELLED'],
    ['IN_PROGRESS', 'CANCELLED'],
    ['IN_REVIEW', 'CANCELLED'],
  ]

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(canTransitionTaskStatus(from, to)).toBe(true)
  })

  it('allows IN_REVIEW -> IN_PROGRESS so review rework needs no new Task', () => {
    expect(canTransitionTaskStatus('IN_REVIEW', 'IN_PROGRESS')).toBe(true)
  })

  it('rejects every transition that is not explicitly allowed', () => {
    const allowedKeys = new Set(allowed.map(([from, to]) => `${from}->${to}`))

    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        if (allowedKeys.has(`${from}->${to}`)) {
          continue
        }
        expect(canTransitionTaskStatus(from, to)).toBe(false)
      }
    }
  })

  it('rejects shortcuts that would skip review', () => {
    expect(canTransitionTaskStatus('TODO', 'DONE')).toBe(false)
    expect(canTransitionTaskStatus('TODO', 'IN_REVIEW')).toBe(false)
    expect(canTransitionTaskStatus('IN_PROGRESS', 'DONE')).toBe(false)
  })

  it('treats DONE and CANCELLED as terminal with no way back', () => {
    expect(isTerminalTaskStatus('DONE')).toBe(true)
    expect(isTerminalTaskStatus('CANCELLED')).toBe(true)

    for (const to of TASK_STATUSES) {
      expect(canTransitionTaskStatus('DONE', to)).toBe(false)
      expect(canTransitionTaskStatus('CANCELLED', to)).toBe(false)
    }
  })

  it('freezes task planning fields once the task leaves TODO', () => {
    expect(isTaskPlanningMutable('TODO')).toBe(true)

    for (const status of TASK_STATUSES.filter(candidate => candidate !== TaskStatus.TODO)) {
      expect(isTaskPlanningMutable(status)).toBe(false)
    }
  })
})

describe('lifecycle timestamp effects', () => {
  it('sets startedAt when entering ACTIVE or IN_PROGRESS', () => {
    expect(planningTransitionEffect('ACTIVE')).toEqual({ setStartedAt: true, setCompletedAt: false })
    expect(taskTransitionEffect('IN_PROGRESS')).toEqual({ setStartedAt: true, setCompletedAt: false })
  })

  it('sets completedAt when entering COMPLETED or DONE', () => {
    expect(planningTransitionEffect('COMPLETED')).toEqual({ setStartedAt: false, setCompletedAt: true })
    expect(taskTransitionEffect('DONE')).toEqual({ setStartedAt: false, setCompletedAt: true })
  })

  it('never fabricates a completion timestamp for a cancellation', () => {
    expect(planningTransitionEffect('CANCELLED')).toEqual({ setStartedAt: false, setCompletedAt: false })
    expect(taskTransitionEffect('CANCELLED')).toEqual({ setStartedAt: false, setCompletedAt: false })
  })

  it('sets nothing when returning to IN_PROGRESS is expressed as IN_REVIEW rework', () => {
    expect(taskTransitionEffect('IN_REVIEW')).toEqual({ setStartedAt: false, setCompletedAt: false })
  })
})

describe('priority', () => {
  it('ranks P0 highest through P3 lowest', () => {
    expect(taskPriorityRank('P0')).toBe(0)
    expect(taskPriorityRank('P1')).toBe(1)
    expect(taskPriorityRank('P2')).toBe(2)
    expect(taskPriorityRank('P3')).toBe(3)
  })

  it('exposes exactly four priorities with no UNSPECIFIED member', () => {
    expect(Object.keys(TaskPriority)).toEqual(['P0', 'P1', 'P2', 'P3'])
    expect(Object.keys(TASK_PRIORITY_RANK)).toEqual(['P0', 'P1', 'P2', 'P3'])
  })

  it('sorts deterministically by rank', () => {
    const sorted = ['P3', 'P0', 'P2', 'P1'] as const
    expect([...sorted].sort((a, b) => taskPriorityRank(a) - taskPriorityRank(b)))
      .toEqual(['P0', 'P1', 'P2', 'P3'])
  })
})

describe('enum membership', () => {
  it('keeps resolver outcomes out of the persisted task statuses', () => {
    expect(Object.keys(TaskStatus)).toEqual(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])
    for (const forbidden of ['READY', 'BLOCKED', 'AMBIGUOUS', 'CONFLICT']) {
      expect(Object.keys(TaskStatus)).not.toContain(forbidden)
    }
  })

  it('carries the RIC-006 task types unchanged', () => {
    expect(Object.keys(TaskType)).toEqual(['STORY', 'TASK', 'BUG', 'SPIKE', 'CHORE'])
  })

  it('authorizes JIRA as the only external provider', () => {
    expect(Object.keys(BacklogExternalProvider)).toEqual(['JIRA'])
  })

  it('gives Sprint and Epic the same four states', () => {
    expect(Object.keys(EpicStatus)).toEqual(Object.keys(SprintStatus))
  })
})

describe('normalizeBacklogCode', () => {
  it('trims and uppercases', () => {
    expect(normalizeBacklogCode('  s2-01 ')).toEqual({ ok: true, value: 'S2-01' })
  })

  it('is idempotent', () => {
    const first = normalizeBacklogCode('ric-s2-02')
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(normalizeBacklogCode(first.value)).toEqual({ ok: true, value: first.value })
    }
  })

  it.each(['', '   ', '\t\n'])('rejects blank input %j', (raw) => {
    expect(normalizeBacklogCode(raw).ok).toBe(false)
  })

  it('rejects codes longer than 64 characters', () => {
    expect(normalizeBacklogCode('A'.repeat(64)).ok).toBe(true)
    expect(normalizeBacklogCode('A'.repeat(65)).ok).toBe(false)
  })

  it('rejects control characters', () => {
    expect(normalizeBacklogCode('S2\u0001-01').ok).toBe(false)
    expect(normalizeBacklogCode('S2\u007F01').ok).toBe(false)
  })
})

describe('text normalization', () => {
  it('trims required text and rejects blanks', () => {
    expect(normalizeRequiredText('  Backlog model  ', 'title')).toEqual({ ok: true, value: 'Backlog model' })
    expect(normalizeRequiredText('   ', 'title').ok).toBe(false)
  })

  it('preserves an explicit null as a clear instruction', () => {
    expect(normalizeOptionalText(null, 'objective')).toEqual({ ok: true, value: null })
  })

  it('rejects a blank string rather than silently treating it as a clear', () => {
    expect(normalizeOptionalText('   ', 'objective').ok).toBe(false)
  })
})

describe('validateSequence', () => {
  it.each([0, 1, 42, 2_147_483_647])('accepts non-negative integer %i', (value) => {
    expect(validateSequence(value)).toEqual({ ok: true, value })
  })

  it.each([-1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])(
    'rejects %j',
    (value) => {
      expect(validateSequence(value).ok).toBe(false)
    },
  )
})

describe('validateAcceptanceCriteria', () => {
  it('preserves order exactly', () => {
    const input = ['third last', 'alpha', 'beta']
    expect(validateAcceptanceCriteria(input)).toEqual({ ok: true, value: ['third last', 'alpha', 'beta'] })
  })

  it('trims each entry', () => {
    expect(validateAcceptanceCriteria(['  one  '])).toEqual({ ok: true, value: ['one'] })
  })

  it('accepts an empty array as a not-yet-ready planning record', () => {
    expect(validateAcceptanceCriteria([])).toEqual({ ok: true, value: [] })
  })

  it.each([
    ['a non-array object', { first: 'one' }],
    ['a string', 'one'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 3],
  ])('rejects %s', (_label, value) => {
    expect(validateAcceptanceCriteria(value).ok).toBe(false)
  })

  it.each([
    ['a blank entry', ['ok', '   ']],
    ['an empty entry', ['']],
    ['a non-string entry', ['ok', 7]],
    ['a nested object entry', [{ text: 'ok' }]],
    ['a null entry', ['ok', null]],
  ])('rejects %s', (_label, value) => {
    expect(validateAcceptanceCriteria(value).ok).toBe(false)
  })

  it('names the offending index in the failure reason', () => {
    const result = validateAcceptanceCriteria(['ok', ''])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('[1]')
    }
  })
})

describe('validateExternalIdentity', () => {
  it('accepts no external identity at all', () => {
    expect(validateExternalIdentity({}).ok).toBe(true)
  })

  it('accepts a provider paired with an id', () => {
    expect(validateExternalIdentity({
      externalProvider: BacklogExternalProvider.JIRA,
      externalId: '10042',
    }).ok).toBe(true)
  })

  it('rejects an externalId without a provider', () => {
    expect(validateExternalIdentity({ externalId: '10042' }).ok).toBe(false)
    expect(validateExternalIdentity({ externalProvider: null, externalId: '10042' }).ok).toBe(false)
  })

  it('accepts a provider recorded before its id is known', () => {
    expect(validateExternalIdentity({ externalProvider: BacklogExternalProvider.JIRA }).ok).toBe(true)
  })

  // IR-NDERCC-17-001: a blank string is not "no external identity". It is a
  // malformed one, and a blank value can never be a provider-stable
  // identifier — so it is rejected rather than quietly treated as absent.
  it.each(['', '   ', '\t', '\n', ' \t\n '])('rejects a blank externalId %j with no provider', (externalId) => {
    expect(validateExternalIdentity({ externalId }).ok).toBe(false)
  })

  it.each(['', '   ', '\t\n'])('rejects a blank externalId %j even with a provider', (externalId) => {
    expect(validateExternalIdentity({
      externalProvider: BacklogExternalProvider.JIRA,
      externalId,
    }).ok).toBe(false)
  })

  it('names externalId in the blank-value failure reason', () => {
    const result = validateExternalIdentity({ externalId: '   ' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('externalId')
    }
  })

  it('still accepts an explicit null as a clear instruction', () => {
    expect(validateExternalIdentity({ externalId: null }).ok).toBe(true)
    expect(validateExternalIdentity({ externalProvider: null, externalId: null }).ok).toBe(true)
  })

  it('still accepts undefined as "leave unchanged"', () => {
    expect(validateExternalIdentity({ externalId: undefined }).ok).toBe(true)
    expect(validateExternalIdentity({ externalProvider: BacklogExternalProvider.JIRA, externalId: undefined }).ok)
      .toBe(true)
  })
})

describe('isDependencySatisfiedBy', () => {
  it('is satisfied only by a DONE prerequisite', () => {
    expect(isDependencySatisfiedBy('DONE')).toBe(true)

    for (const status of TASK_STATUSES.filter(candidate => candidate !== TaskStatus.DONE)) {
      expect(isDependencySatisfiedBy(status)).toBe(false)
    }
  })

  it('does not treat a CANCELLED prerequisite as satisfied', () => {
    expect(isDependencySatisfiedBy('CANCELLED')).toBe(false)
  })
})
