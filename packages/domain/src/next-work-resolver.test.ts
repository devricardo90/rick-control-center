/* eslint-disable max-lines-per-function -- existing exhaustive resolver fixture. */
import { describe, expect, it } from 'vitest'
import {
  NEXT_WORK_RESOLVER_VERSION,
  resolveNextWork,
} from './next-work-resolver.js'
import type {
  NextWorkResolverInput,
  ResolverTaskInput,
} from './next-work-resolver.js'

function baseInput(): NextWorkResolverInput {
  return {
    projectId: 'project-a',
    resolverVersion: 'P0_031_V1',
    project: { id: 'project-a', status: 'ACTIVE' },
    sprints: [{
      id: 'sprint-a', projectId: 'project-a', code: 'SPR-A', sequence: 0,
      status: 'ACTIVE', archivedAt: null,
    }],
    epics: [],
    tasks: [{
      id: 'task-a', projectId: 'project-a', sprintId: 'sprint-a', epicId: null,
      code: 'TASK-A', priority: 'P1', sequence: 0, status: 'TODO',
      acceptanceCriteria: ['done'], archivedAt: null,
    }],
    dependencies: [],
    requirements: [],
    decisions: [],
    strategicSources: [],
    strategicContexts: [{
      taskId: 'task-a', applicabilityEstablished: true,
      requirementIds: [], decisionIds: [], sourceIds: [],
    }],
  }
}

function replaceTask(
  input: NextWorkResolverInput,
  changes: Partial<ResolverTaskInput>,
): NextWorkResolverInput {
  const task = input.tasks[0]
  if (!task) throw new Error('fixture requires a task')
  return { ...input, tasks: [{ ...task, ...changes }] }
}

function addTask(
  input: NextWorkResolverInput,
  task: ResolverTaskInput,
  applicabilityEstablished = true,
): NextWorkResolverInput {
  return {
    ...input,
    tasks: [...input.tasks, task],
    strategicContexts: [...input.strategicContexts, {
      taskId: task.id,
      applicabilityEstablished,
      requirementIds: [],
      decisionIds: [],
      sourceIds: [],
    }],
  }
}

function selectedTaskId(input: NextWorkResolverInput): string | null {
  const result = resolveNextWork(input)
  return result.kind === 'SELECTED' ? result.task.id : null
}

function safeStrategicInput(): NextWorkResolverInput {
  const input = baseInput()
  return {
    ...input,
    requirements: [{
      id: 'req-a', projectId: 'project-a', status: 'ACTIVE',
      documentSourceId: 'source-a', sourceSnapshotId: 'snapshot-a',
    }],
    decisions: [{
      id: 'dec-a', projectId: 'project-a', status: 'APPROVED',
      documentSourceId: 'source-a', sourceSnapshotId: 'snapshot-a',
    }],
    strategicSources: [{
      id: 'source-a', projectId: 'project-a', approvalStatus: 'APPROVED',
      syncStatus: 'SYNCED', revision: '7', checksum: 'abc',
      currentSnapshotId: 'snapshot-a', currentSnapshotProviderVersion: '7',
      currentSnapshotChecksum: 'abc',
    }],
    strategicContexts: [{
      taskId: 'task-a', applicabilityEstablished: true,
      requirementIds: ['req-a'], decisionIds: ['dec-a'], sourceIds: ['source-a'],
    }],
  }
}

describe('resolver identity and result contract', () => {
  it('emits the frozen resolver version and selected evidence', () => {
    const result = resolveNextWork(baseInput())
    expect(NEXT_WORK_RESOLVER_VERSION).toBe('P0_031_V1')
    expect(result).toEqual({
      kind: 'SELECTED',
      projectId: 'project-a',
      resolverVersion: 'P0_031_V1',
      diagnosticsVersion: 'P0_032_V1',
      diagnostics: [],
      task: { id: 'task-a', code: 'TASK-A', priority: 'P1', sequence: 0 },
      sprint: { id: 'sprint-a', code: 'SPR-A', sequence: 0 },
      epic: null,
      ranking: [0, 1, 0, 'TASK-A', 'task-a'],
      prerequisites: { count: 0, satisfiedCount: 0, items: [] },
      strategicContext: {
        applicabilityEstablished: true,
        safe: true,
        requirementIds: [],
        decisions: [],
        sources: [],
      },
    })
  })

  it('has only the two canonical top-level result kinds', () => {
    const selected = resolveNextWork(baseInput())
    const none = resolveNextWork({ ...baseInput(), tasks: [] })
    expect([selected.kind, none.kind].sort()).toEqual(['NO_ELIGIBLE_WORK', 'SELECTED'])
  })

  it('fails closed when the normalized input carries another resolver version', () => {
    const result = resolveNextWork({ ...baseInput(), resolverVersion: 'P0_031_V2' })
    expect(result).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      resolverVersion: 'P0_031_V1',
      reasons: ['NO_ELIGIBLE_WORK'],
    })
  })
})

describe('project and operational lifecycle eligibility', () => {
  it.each(['PAUSED', 'ARCHIVED'])('returns project-not-active for %s', (status) => {
    const input = baseInput()
    const result = resolveNextWork({ ...input, project: { ...input.project, status } })
    expect(result).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      reasons: ['PROJECT_NOT_ACTIVE'],
    })
  })

  it.each(['IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'])(
    'excludes task status %s',
    status => expect(selectedTaskId(replaceTask(baseInput(), { status }))).toBeNull(),
  )

  it.each(['PLANNED', 'COMPLETED', 'CANCELLED'])('requires an ACTIVE sprint, not %s', (status) => {
    const input = baseInput()
    expect(selectedTaskId({
      ...input,
      sprints: input.sprints.map(sprint => ({ ...sprint, status })),
    })).toBeNull()
  })

  it('requires an ACTIVE optional epic in the same sprint', () => {
    const input = replaceTask(baseInput(), { epicId: 'epic-a' })
    const withEpic = (status: string, sprintId = 'sprint-a'): NextWorkResolverInput => ({
      ...input,
      epics: [{
        id: 'epic-a', projectId: 'project-a', sprintId, code: 'EPI-A',
        status, archivedAt: null,
      }],
    })
    expect(selectedTaskId(withEpic('ACTIVE'))).toBe('task-a')
    expect(selectedTaskId(withEpic('PLANNED'))).toBeNull()
    expect(selectedTaskId(withEpic('ACTIVE', 'other-sprint'))).toBeNull()
  })
})

describe('archive and acceptance-criteria eligibility', () => {
  it.each([
    ['task', { task: true, sprint: false, epic: false }],
    ['sprint', { task: false, sprint: true, epic: false }],
    ['epic', { task: false, sprint: false, epic: true }],
  ])('excludes an archived %s', (_name, archived) => {
    let input = replaceTask(baseInput(), {
      archivedAt: archived.task ? new Date(0) : null,
      epicId: archived.epic ? 'epic-a' : null,
    })
    input = {
      ...input,
      sprints: input.sprints.map(sprint => ({
        ...sprint,
        archivedAt: archived.sprint ? new Date(0) : null,
      })),
      epics: archived.epic
        ? [{
            id: 'epic-a', projectId: 'project-a', sprintId: 'sprint-a', code: 'EPI-A',
            status: 'ACTIVE', archivedAt: new Date(0),
          }]
        : [],
    }
    expect(selectedTaskId(input)).toBeNull()
  })

  it.each([[], [''], ['valid', '  '], 'not-an-array'])(
    'rejects invalid or empty acceptance criteria %#',
    (acceptanceCriteria) => {
      expect(selectedTaskId(replaceTask(baseInput(), { acceptanceCriteria }))).toBeNull()
    },
  )
})

describe('dependency eligibility', () => {
  function withPrerequisite(status: string, projectId = 'project-a'): NextWorkResolverInput {
    const input = baseInput()
    return {
      ...input,
      tasks: [...input.tasks, {
        id: 'prerequisite', projectId, sprintId: 'sprint-a', epicId: null,
        code: 'TASK-PRE', priority: 'P3', sequence: 1, status,
        acceptanceCriteria: ['done'], archivedAt: null,
      }],
      dependencies: [{
        projectId: 'project-a', taskId: 'task-a', dependsOnTaskId: 'prerequisite',
      }],
    }
  }

  it('allows zero dependencies and all-DONE prerequisites', () => {
    expect(selectedTaskId(baseInput())).toBe('task-a')
    const result = resolveNextWork(withPrerequisite('DONE'))
    expect(result).toMatchObject({
      kind: 'SELECTED',
      prerequisites: {
        count: 1,
        satisfiedCount: 1,
        items: [{ id: 'prerequisite', status: 'DONE' }],
      },
    })
  })

  it.each(['CANCELLED', 'TODO', 'IN_PROGRESS', 'IN_REVIEW'])(
    'does not satisfy a %s prerequisite',
    status => expect(selectedTaskId(withPrerequisite(status))).toBeNull(),
  )

  it('allows a DONE prerequisite in another sprint of the same project', () => {
    const input = withPrerequisite('DONE')
    expect(selectedTaskId({
      ...input,
      sprints: [...input.sprints, {
        id: 'sprint-b', projectId: 'project-a', code: 'SPR-B', sequence: 1,
        status: 'COMPLETED', archivedAt: null,
      }],
      tasks: input.tasks.map(task => task.id === 'prerequisite'
        ? { ...task, sprintId: 'sprint-b' }
        : task),
    })).toBe('task-a')
  })

  it('fails closed for a cross-project prerequisite', () => {
    expect(selectedTaskId(withPrerequisite('DONE', 'project-b'))).toBeNull()
  })
})

describe('exact deterministic ranking', () => {
  function competingInput(changes: Partial<ResolverTaskInput>): NextWorkResolverInput {
    return addTask(baseInput(), {
      id: 'task-b', projectId: 'project-a', sprintId: 'sprint-a', epicId: null,
      code: 'TASK-B', priority: 'P1', sequence: 1, status: 'TODO',
      acceptanceCriteria: ['done'], archivedAt: null,
      ...changes,
    })
  }

  it.each([
    ['P0', 'P1', 'task-b'],
    ['P1', 'P2', 'task-b'],
    ['P2', 'P3', 'task-b'],
  ])('orders priority %s before %s', (better, worse, expected) => {
    let input = replaceTask(baseInput(), { priority: worse, sequence: 0 })
    input = addTask(input, {
      id: expected, projectId: 'project-a', sprintId: 'sprint-a', epicId: null,
      code: 'TASK-B', priority: better, sequence: 1, status: 'TODO',
      acceptanceCriteria: ['done'], archivedAt: null,
    })
    expect(selectedTaskId(input)).toBe(expected)
  })

  it('ranks Sprint.sequence before priority and Task.sequence', () => {
    const input = competingInput({
      sprintId: 'sprint-b', priority: 'P0', sequence: 0,
    })
    expect(selectedTaskId({
      ...input,
      sprints: [...input.sprints, {
        id: 'sprint-b', projectId: 'project-a', code: 'SPR-B', sequence: 1,
        status: 'ACTIVE', archivedAt: null,
      }],
    })).toBe('task-a')
  })

  it('ranks Task.sequence before code', () => {
    expect(selectedTaskId(competingInput({ code: 'AAA', sequence: 1 }))).toBe('task-a')
  })

  it('reports duplicate deterministic identity instead of breaking an ambiguous tie', () => {
    const tied = competingInput({ id: 'a-task', code: 'TASK-AA', sequence: 0 })
    expect(resolveNextWork(tied)).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      diagnostics: [{ code: 'AMBIGUOUS_CANDIDATE_ORDERING', evidenceKey: 'DUPLICATE_TASK_SEQUENCE' }],
    })
  })

  it('is independent of collection order and timestamps', () => {
    const input = competingInput({ id: 'a-task', code: 'TASK-AA', sequence: 0 })
    const decoratedTasks = input.tasks.map(task => ({
      ...task,
      createdAt: task.id === 'task-a' ? new Date(0) : new Date(999_999),
      updatedAt: task.id === 'task-a' ? new Date(999_999) : new Date(0),
    }))
    const first = resolveNextWork({ ...input, tasks: decoratedTasks })
    const second = resolveNextWork({
      ...input,
      tasks: [...decoratedTasks].reverse(),
      strategicContexts: [...input.strategicContexts].reverse(),
    })
    expect(second).toEqual(first)
    expect(resolveNextWork({ ...input, tasks: decoratedTasks })).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      diagnostics: [{ code: 'AMBIGUOUS_CANDIDATE_ORDERING', evidenceKey: 'DUPLICATE_TASK_SEQUENCE' }],
    })
  })
})

describe('candidate-scoped strategic safety', () => {
  it('returns sanitized evidence for safe applicable truth', () => {
    const result = resolveNextWork(safeStrategicInput())
    expect(result).toMatchObject({
      kind: 'SELECTED',
      strategicContext: {
        requirementIds: ['req-a'],
        decisions: [{ id: 'dec-a', status: 'APPROVED' }],
        sources: [{
          id: 'source-a', approvalStatus: 'APPROVED', syncStatus: 'SYNCED',
          currentSnapshotId: 'snapshot-a',
        }],
      },
    })
  })

  it('blocks only the candidate with an applicable PROPOSED decision', () => {
    const unsafe = safeStrategicInput()
    const proposed = {
      ...unsafe,
      decisions: unsafe.decisions.map(decision => ({ ...decision, status: 'PROPOSED' })),
    }
    expect(resolveNextWork(proposed)).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      reasons: ['STRATEGIC_TRUTH_UNSAFE', 'NO_ELIGIBLE_WORK'],
      evidence: { strategicTruthUnsafeTaskIds: ['task-a'] },
    })
    const withIndependent = addTask(proposed, {
      id: 'task-b', projectId: 'project-a', sprintId: 'sprint-a', epicId: null,
      code: 'TASK-B', priority: 'P3', sequence: 1, status: 'TODO',
      acceptanceCriteria: ['done'], archivedAt: null,
    })
    expect(selectedTaskId(withIndependent)).toBe('task-b')
  })

  it('does not let an unrelated PROPOSED decision block a candidate', () => {
    const input = baseInput()
    expect(selectedTaskId({
      ...input,
      decisions: [{
        id: 'unrelated', projectId: 'project-a', status: 'PROPOSED',
        documentSourceId: 'missing', sourceSnapshotId: 'missing',
      }],
    })).toBe('task-a')
  })
})

describe('candidate-scoped provenance and applicability', () => {
  it.each([
    ['stale source', { syncStatus: 'STALE' }],
    ['unapproved source', { approvalStatus: 'DRAFT' }],
    ['revision mismatch', { revision: 'old' }],
    ['checksum mismatch', { checksum: 'old' }],
    ['non-current snapshot', { currentSnapshotId: 'other' }],
  ])('blocks candidate-scoped unsafe provenance: %s', (_name, changes) => {
    const input = safeStrategicInput()
    expect(selectedTaskId({
      ...input,
      strategicSources: input.strategicSources.map(source => ({ ...source, ...changes })),
    })).toBeNull()
  })

  it('never infers applicability and requires the explicit discriminant', () => {
    const input = baseInput()
    expect(selectedTaskId({ ...input, strategicContexts: [] })).toBeNull()
    expect(selectedTaskId({
      ...input,
      strategicContexts: input.strategicContexts.map(context => ({
        ...context, applicabilityEstablished: false,
      })),
    })).toBeNull()
  })

  it('fails closed without leaking cross-project strategic identifiers', () => {
    const input = safeStrategicInput()
    const result = resolveNextWork({
      ...input,
      requirements: input.requirements.map(requirement => ({
        ...requirement, projectId: 'project-b',
      })),
    })
    expect(JSON.stringify(result)).not.toContain('project-b')
    expect(result).toMatchObject({ kind: 'NO_ELIGIBLE_WORK' })
  })
})

describe('fail-closed deterministic inputs and isolated invalidity', () => {
  const invalidInputCases: ReadonlyArray<readonly [
    string,
    { readonly task?: Partial<ResolverTaskInput>, readonly sprint?: Readonly<Record<string, unknown>> },
  ]> = [
    ['missing Sprint.sequence', { sprint: { sequence: undefined } }],
    ['invalid Sprint.sequence', { sprint: { sequence: -1 } }],
    ['missing Task.priority', { task: { priority: undefined } }],
    ['invalid Task.priority', { task: { priority: 'P4' } }],
    ['missing Task.sequence', { task: { sequence: undefined } }],
    ['invalid Task.sequence', { task: { sequence: 2_147_483_648 } }],
    ['missing Task.code', { task: { code: undefined } }],
    ['noncanonical Task.code', { task: { code: 'task-a' } }],
    ['malformed Task identity', { task: { id: ' task-a' } }],
    ['cross-project Sprint', { sprint: { projectId: 'project-b' } }],
  ]

  it.each(invalidInputCases)('excludes %s', (_name, changes) => {
    let input = baseInput()
    if (changes.task) input = replaceTask(input, changes.task)
    if (changes.sprint) {
      input = { ...input, sprints: input.sprints.map(sprint => ({ ...sprint, ...changes.sprint })) }
    }
    expect(selectedTaskId(input)).toBeNull()
  })

  it('does not let one invalid candidate contaminate an independent valid candidate', () => {
    let input = replaceTask(baseInput(), { sequence: undefined })
    input = addTask(input, {
      id: 'task-b', projectId: 'project-a', sprintId: 'sprint-a', epicId: null,
      code: 'TASK-B', priority: 'P2', sequence: 1, status: 'TODO',
      acceptanceCriteria: ['done'], archivedAt: null,
    })
    const result = resolveNextWork(input)
    expect(result).toMatchObject({ kind: 'SELECTED', task: { id: 'task-b' } })
  })

  it('keeps no-work reason ordering explicit and stable', () => {
    const input = replaceTask(baseInput(), { sequence: undefined })
    const first = resolveNextWork(input)
    const second = resolveNextWork({
      ...input,
      tasks: [...input.tasks].reverse(),
      strategicContexts: [...input.strategicContexts].reverse(),
    })
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      kind: 'NO_ELIGIBLE_WORK',
      reasons: ['NO_ELIGIBLE_WORK'],
      evidence: { invalidCandidateCount: 1 },
    })
  })
})
