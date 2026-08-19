import { describe, expect, it } from 'vitest'
import {
  diagnoseReadiness,
  READINESS_DIAGNOSTICS_VERSION,
} from './readiness-diagnostics.js'
import { resolveNextWork } from './next-work-resolver.js'
import type { NextWorkResolverInput, ResolverDecisionInput, ResolverTaskInput } from './next-work-resolver.js'

/* eslint-disable max-lines-per-function -- fixtures intentionally enumerate frozen contract fields. */

function baseInput(): NextWorkResolverInput {
  return {
    projectId: 'project-a',
    resolverVersion: 'P0_031_V1',
    project: { id: 'project-a', status: 'ACTIVE' },
    sprints: [{ id: 'sprint-a', projectId: 'project-a', code: 'SPR-A', sequence: 0, status: 'ACTIVE', archivedAt: null }],
    epics: [],
    tasks: [{
      id: 'task-a', projectId: 'project-a', sprintId: 'sprint-a', epicId: null,
      code: 'TASK-A', priority: 'P1', sequence: 0, status: 'TODO',
      acceptanceCriteria: ['ship'], archivedAt: null,
    }],
    dependencies: [],
    requirements: [],
    decisions: [],
    strategicSources: [],
    strategicContexts: [{ taskId: 'task-a', applicabilityEstablished: true, requirementIds: [], decisionIds: [], sourceIds: [] }],
  }
}

function withTask(input: NextWorkResolverInput, task: ResolverTaskInput): NextWorkResolverInput {
  return {
    ...input,
    tasks: [...input.tasks, task],
    strategicContexts: [...input.strategicContexts, {
      taskId: task.id,
      applicabilityEstablished: true,
      requirementIds: [],
      decisionIds: [],
      sourceIds: [],
    }],
  }
}

function safeTruth(input: NextWorkResolverInput): NextWorkResolverInput {
  return {
    ...input,
    requirements: [{ id: 'req-a', projectId: 'project-a', status: 'ACTIVE', documentSourceId: 'source-a', sourceSnapshotId: 'snapshot-a' }],
    decisions: [{
      id: 'dec-a', projectId: 'project-a', code: 'DEC-A', chosenDecision: 'Use the rule',
      supersedesDecisionId: null, status: 'APPROVED', documentSourceId: 'source-a', sourceSnapshotId: 'snapshot-a',
    }],
    strategicSources: [{
      id: 'source-a', projectId: 'project-a', approvalStatus: 'APPROVED', syncStatus: 'SYNCED',
      revision: '1', checksum: 'sum', currentSnapshotId: 'snapshot-a', currentSnapshotProviderVersion: '1', currentSnapshotChecksum: 'sum',
    }],
    strategicContexts: [{ taskId: 'task-a', applicabilityEstablished: true, requirementIds: ['req-a'], decisionIds: ['dec-a'], sourceIds: ['source-a'] }],
  }
}

describe('P0-032 readiness diagnostics', () => {
  it('emits the frozen version, severity and canonical fingerprint', () => {
    const diagnostics = diagnoseReadiness(baseInput())
    expect(READINESS_DIAGNOSTICS_VERSION).toBe('P0_032_V1')
    expect(diagnostics).toEqual([])
    const result = resolveNextWork(baseInput())
    expect(result).toMatchObject({ diagnosticsVersion: 'P0_032_V1', diagnostics: [] })
  })

  it('reports invalid project state without evaluating unrelated task records', () => {
    const diagnostics = diagnoseReadiness({ ...baseInput(), project: { id: 'other', status: 'PAUSED' } })
    expect(diagnostics.map(item => item.evidenceKey)).toEqual(['PROJECT_IDENTITY', 'PROJECT_STATUS'])
    expect(diagnostics.every(item => item.code === 'INVALID_PROJECT_STATE' && item.severity === 'ERROR')).toBe(true)
    expect(diagnostics[0]?.fingerprint).toBe(JSON.stringify([
      'P0_032_V1', 'INVALID_PROJECT_STATE', 'PROJECT', 'project-a', 'PROJECT_IDENTITY', [],
    ]))
  })

  it('emits every independent structural missing-input condition', () => {
    const input = {
      ...baseInput(),
      tasks: [{ ...baseInput().tasks[0], sprintId: 'missing', code: undefined, priority: undefined, sequence: undefined, acceptanceCriteria: [] }],
      strategicContexts: [],
    }
    const diagnostics = diagnoseReadiness(input)
    expect(diagnostics.filter(item => item.code === 'MISSING_REQUIRED_INPUT').map(item => item.evidenceKey)).toEqual([
      'ACCEPTANCE_CRITERIA', 'SPRINT_REFERENCE', 'STRATEGIC_CONTEXT', 'TASK_CODE', 'TASK_PRIORITY', 'TASK_SEQUENCE',
    ])
  })

  it('aggregates malformed task identities without inventing an array index', () => {
    const input = { ...baseInput(), tasks: [{ ...baseInput().tasks[0], id: undefined }] }
    const diagnostics = diagnoseReadiness(input)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({ code: 'MISSING_REQUIRED_INPUT', evidenceKey: 'TASK_IDENTITY', subject: { kind: 'PROJECT', id: 'project-a' }, evidence: { invalidRecordCount: 1 } })
    expect(JSON.stringify(diagnostics)).not.toContain('"id":"0"')
  })

  it('combines duplicate ordering and all unsatisfied prerequisites deterministically', () => {
    const input = {
      ...baseInput(),
      tasks: [
        { ...baseInput().tasks[0], sequence: 1 },
        { id: 'task-b', projectId: 'project-a', sprintId: 'sprint-a', epicId: null, code: 'TASK-B', priority: 'P2', sequence: 4, status: 'TODO', acceptanceCriteria: ['ship'], archivedAt: null },
        { id: 'pre-b', projectId: 'project-a', sprintId: 'sprint-a', epicId: null, code: 'PRE-B', priority: 'P3', sequence: 2, status: 'TODO', acceptanceCriteria: ['done'], archivedAt: null },
        { id: 'pre-a', projectId: 'project-a', sprintId: 'sprint-a', epicId: null, code: 'PRE-A', priority: 'P3', sequence: 2, status: 'TODO', acceptanceCriteria: ['done'], archivedAt: null },
      ],
      strategicContexts: [
        { taskId: 'task-a', applicabilityEstablished: true, requirementIds: [], decisionIds: [], sourceIds: [] },
        { taskId: 'task-b', applicabilityEstablished: true, requirementIds: [], decisionIds: [], sourceIds: [] },
        { taskId: 'pre-a', applicabilityEstablished: true, requirementIds: [], decisionIds: [], sourceIds: [] },
        { taskId: 'pre-b', applicabilityEstablished: true, requirementIds: [], decisionIds: [], sourceIds: [] },
      ],
      dependencies: [
        { projectId: 'project-a', taskId: 'task-a', dependsOnTaskId: 'pre-b' },
        { projectId: 'project-a', taskId: 'task-a', dependsOnTaskId: 'pre-a' },
      ],
    }
    const diagnostics = diagnoseReadiness(input)
    expect(diagnostics.some(item => item.evidenceKey === 'DUPLICATE_TASK_SEQUENCE')).toBe(true)
    expect(diagnostics.find(item => item.evidenceKey === 'PREREQUISITES_NOT_DONE')).toMatchObject({
      relatedSubjects: [{ kind: 'TASK', id: 'pre-a' }, { kind: 'TASK', id: 'pre-b' }],
      evidence: { prerequisiteIds: ['pre-a', 'pre-b'] },
    })
  })

  it('scopes unsafe strategic truth to the explicitly applicable task', () => {
    const unsafe = safeTruth(baseInput())
    const input = withTask({
      ...unsafe,
      strategicSources: unsafe.strategicSources.map(source => ({ ...source, syncStatus: 'STALE' })),
    }, { id: 'task-b', projectId: 'project-a', sprintId: 'sprint-a', epicId: null, code: 'TASK-B', priority: 'P3', sequence: 1, status: 'TODO', acceptanceCriteria: ['ship'], archivedAt: null })
    const result = resolveNextWork(input)
    expect(result.kind).toBe('SELECTED')
    expect(result).toMatchObject({ task: { id: 'task-b' }, diagnostics: [{ code: 'STALE_OR_UNAPPROVED_TRUTH', evidenceKey: 'SOURCE_SYNC' }] })
  })

  it('uses only structured decision conflicts and does not infer prose disagreement', () => {
    const input = safeTruth(baseInput())
    const decisions: ResolverDecisionInput[] = [
      { ...input.decisions[0], id: 'dec-a', code: 'DEC-SAME', chosenDecision: 'One' },
      { ...input.decisions[0], id: 'dec-b', code: 'DEC-SAME', chosenDecision: 'Two' },
    ]
    const conflict = diagnoseReadiness({
      ...input,
      decisions,
      strategicContexts: [{ taskId: 'task-a', applicabilityEstablished: true, requirementIds: ['req-a'], decisionIds: ['dec-a', 'dec-b'], sourceIds: ['source-a'] }],
    })
    expect(conflict).toContainEqual(expect.objectContaining({ code: 'STRATEGIC_CONFLICT', evidenceKey: 'DUPLICATE_DECISION_CODE' }))
    const ordinary = diagnoseReadiness({ ...input, decisions: [{ ...decisions[1], code: 'DEC-OTHER', chosenDecision: 'A different sentence' }] })
    expect(ordinary.some(item => item.code === 'STRATEGIC_CONFLICT')).toBe(false)
  })

  it('is independent of collection order and repeated evaluation', () => {
    const input = safeTruth(baseInput())
    const first = diagnoseReadiness(input)
    const second = diagnoseReadiness({
      ...input,
      tasks: [...input.tasks].reverse(),
      strategicContexts: [...input.strategicContexts].reverse(),
      decisions: [...input.decisions].reverse(),
      strategicSources: [...input.strategicSources].reverse(),
    })
    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
