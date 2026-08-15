/**
 * Integration tests for the operational backlog persistence surface.
 *
 * Runs against a real, disposable local PostgreSQL instance. That matters
 * more here than anywhere else in this package: same-project and same-sprint
 * ownership, the uniqueness baseline, the self-dependency CHECK and
 * `ON DELETE RESTRICT` are database-enforced properties, and several tests
 * below deliberately bypass the persistence layer with raw SQL to prove the
 * database rejects what the application layer also rejects. A mock could
 * only prove the application half.
 *
 * No test here touches the network. The optional Jira provenance fields are
 * plain columns — nothing in this slice calls a Jira API — so the whole
 * external-identity contract is testable offline.
 *
 * Test files run in parallel against one database and nothing is truncated
 * between tests, so every test creates its own project and scopes its
 * assertions to rows it created.
 *
 * NDERCC-17 / DEC-RIC-005: canonical operational backlog model.
 */
import type { Epic, PrismaClient, Project, Sprint, Task } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { archiveEpic, createEpic, findEpicForProject, listEpicsForSprint, transitionEpicStatus, updateEpicPlanning } from './epic.js'
import {
  ArchivedProjectReadOnlyError,
  BacklogNotTerminalError,
  BacklogPlanningFrozenError,
  CrossProjectDependencyError,
  DuplicateBacklogCodeError,
  DuplicateBacklogExternalIdError,
  DuplicateBacklogSequenceError,
  DuplicateTaskDependencyError,
  EpicNotFoundError,
  InvalidAcceptanceCriteriaError,
  InvalidBacklogInputError,
  InvalidBacklogTransitionError,
  InvalidEpicSprintOwnershipError,
  ProjectNotFoundError,
  SelfDependencyError,
  SprintNotFoundError,
  TaskDependencyCycleError,
  TaskDependencyFrozenError,
  TaskNotFoundError,
} from './errors.js'
import { createProject, transitionProjectLifecycle } from './project.js'
import {
  archiveSprint,
  createSprint,
  findSprintByCode,
  findSprintForProject,
  listSprintsForProject,
  transitionSprintStatus,
  updateSprintPlanning,
} from './sprint.js'
import {
  addTaskDependency,
  listTaskDependents,
  listTaskPrerequisites,
  removeTaskDependency,
} from './task-dependency.js'
import {
  archiveTask,
  createTask,
  findTaskByCode,
  findTaskForProject,
  listTasksForEpic,
  listTasksForProject,
  listTasksForSprint,
  readTaskAcceptanceCriteria,
  transitionTaskStatus,
  updateTaskPlanning,
} from './task.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client: PrismaClient = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

async function seedProject(prefix: string): Promise<Project> {
  return createProject(client, { key: uniqueSlug(prefix), name: `${prefix} owner` })
}

async function seedSprint(projectId: string, sequence = 0, code = uniqueSlug('spr')): Promise<Sprint> {
  return createSprint(client, { projectId, code, title: 'Sprint', sequence })
}

async function seedEpic(sprint: Sprint, sequence = 0): Promise<Epic> {
  return createEpic(client, {
    projectId: sprint.projectId,
    sprintId: sprint.id,
    code: uniqueSlug('epi'),
    title: 'Epic',
    sequence,
  })
}

async function seedTask(sprint: Sprint, sequence = 0, epicId: string | null = null): Promise<Task> {
  return createTask(client, {
    projectId: sprint.projectId,
    sprintId: sprint.id,
    epicId,
    code: uniqueSlug('tsk'),
    type: 'TASK',
    title: 'Task',
    priority: 'P1',
    sequence,
  })
}

/** Drives a task to DONE through every intermediate state the machine requires. */
async function completeTask(task: Task): Promise<Task> {
  await transitionTaskStatus(client, task.projectId, task.id, 'IN_PROGRESS')
  await transitionTaskStatus(client, task.projectId, task.id, 'IN_REVIEW')
  return transitionTaskStatus(client, task.projectId, task.id, 'DONE')
}

// ── Hierarchy and creation ────────────────────────────────────────────────────

describe('hierarchy', () => {
  it('creates a sprint, an epic inside it, and a task attached to that epic', async () => {
    const project = await seedProject('hier')
    const sprint = await seedSprint(project.id)
    const epic = await seedEpic(sprint)
    const task = await seedTask(sprint, 0, epic.id)

    expect(sprint.status).toBe('PLANNED')
    expect(epic.sprintId).toBe(sprint.id)
    expect(task.sprintId).toBe(sprint.id)
    expect(task.epicId).toBe(epic.id)
    expect(task.status).toBe('TODO')
  })

  it('allows a task with no epic but never without a sprint', async () => {
    const project = await seedProject('hier-noepic')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    expect(task.epicId).toBeNull()
    await expect(createTask(client, {
      projectId: project.id,
      sprintId: UNKNOWN_UUID,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Orphan',
      priority: 'P0',
      sequence: 1,
    })).rejects.toThrow(SprintNotFoundError)
  })
})

describe('hierarchy — cross-boundary ownership', () => {
  it('rejects an epic whose sprint belongs to another project', async () => {
    const owner = await seedProject('hier-own')
    const other = await seedProject('hier-other')
    const sprint = await seedSprint(owner.id)

    await expect(createEpic(client, {
      projectId: other.id,
      sprintId: sprint.id,
      code: uniqueSlug('epi'),
      title: 'Cross',
      sequence: 0,
    })).rejects.toThrow(SprintNotFoundError)
  })

  it('rejects a task naming an epic from a different sprint', async () => {
    const project = await seedProject('hier-epic-sprint')
    const first = await seedSprint(project.id, 0)
    const second = await seedSprint(project.id, 1)
    const epic = await seedEpic(first)

    await expect(createTask(client, {
      projectId: project.id,
      sprintId: second.id,
      epicId: epic.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Mismatched',
      priority: 'P2',
      sequence: 0,
    })).rejects.toThrow(InvalidEpicSprintOwnershipError)
  })
})

describe('hierarchy — sprint and project state', () => {
  it('rejects adding work to a terminal sprint but allows it while ACTIVE', async () => {
    const project = await seedProject('hier-terminal')
    const sprint = await seedSprint(project.id)

    await transitionSprintStatus(client, project.id, sprint.id, 'ACTIVE')
    await expect(seedTask(sprint, 0)).resolves.toBeDefined()

    await transitionSprintStatus(client, project.id, sprint.id, 'COMPLETED')
    await expect(seedTask(sprint, 1)).rejects.toThrow(BacklogPlanningFrozenError)
    await expect(seedEpic(sprint, 1)).rejects.toThrow(BacklogPlanningFrozenError)
  })

  it('rejects every mutation against an archived project', async () => {
    const project = await seedProject('hier-archived')
    const sprint = await seedSprint(project.id)
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(seedSprint(project.id, 1)).rejects.toThrow(ArchivedProjectReadOnlyError)
    await expect(seedEpic(sprint)).rejects.toThrow(ArchivedProjectReadOnlyError)
    await expect(updateSprintPlanning(client, project.id, sprint.id, { title: 'x' }))
      .rejects.toThrow(ArchivedProjectReadOnlyError)
    // Reads stay available for history.
    await expect(findSprintForProject(client, project.id, sprint.id)).resolves.not.toBeNull()
  })

  it('rejects an unknown project on both reads and writes', async () => {
    await expect(listSprintsForProject(client, UNKNOWN_UUID)).rejects.toThrow(ProjectNotFoundError)
    await expect(createSprint(client, { projectId: UNKNOWN_UUID, code: 'S', title: 'S', sequence: 0 }))
      .rejects.toThrow(ProjectNotFoundError)
  })
})

// ── Identity and project isolation ────────────────────────────────────────────

describe('identity and isolation', () => {
  it('normalizes the local code to trimmed uppercase', async () => {
    const project = await seedProject('id-norm')
    const sprint = await createSprint(client, {
      projectId: project.id,
      code: '  s2-alpha  ',
      title: 'Sprint',
      sequence: 0,
    })

    expect(sprint.code).toBe('S2-ALPHA')
    await expect(findSprintByCode(client, project.id, 's2-alpha')).resolves.toMatchObject({ id: sprint.id })
  })

  it('rejects a duplicate code within one project for each aggregate', async () => {
    const project = await seedProject('id-dup')
    const sprint = await seedSprint(project.id)
    const code = uniqueSlug('dup').toUpperCase()

    await createSprint(client, { projectId: project.id, code, title: 'A', sequence: 1 })
    await expect(createSprint(client, { projectId: project.id, code, title: 'B', sequence: 2 }))
      .rejects.toThrow(DuplicateBacklogCodeError)

    await createEpic(client, { projectId: project.id, sprintId: sprint.id, code, title: 'A', sequence: 0 })
    await expect(createEpic(client, { projectId: project.id, sprintId: sprint.id, code, title: 'B', sequence: 1 }))
      .rejects.toThrow(DuplicateBacklogCodeError)

    await createTask(client, {
      projectId: project.id, sprintId: sprint.id, code, type: 'TASK', title: 'A', priority: 'P0', sequence: 0,
    })
    await expect(createTask(client, {
      projectId: project.id, sprintId: sprint.id, code, type: 'TASK', title: 'B', priority: 'P0', sequence: 1,
    })).rejects.toThrow(DuplicateBacklogCodeError)
  })

  it('allows the same code in a different project', async () => {
    const first = await seedProject('id-scope-a')
    const second = await seedProject('id-scope-b')
    const code = uniqueSlug('shared').toUpperCase()

    const a = await createSprint(client, { projectId: first.id, code, title: 'A', sequence: 0 })
    const b = await createSprint(client, { projectId: second.id, code, title: 'B', sequence: 0 })

    expect(a.code).toBe(b.code)
    expect(a.id).not.toBe(b.id)
  })
})

describe('project isolation', () => {
  it('treats another project’s identifiers as not-found rather than confirming them', async () => {
    const owner = await seedProject('id-probe-owner')
    const stranger = await seedProject('id-probe-stranger')
    const sprint = await seedSprint(owner.id)
    const epic = await seedEpic(sprint)
    const task = await seedTask(sprint)

    await expect(findSprintForProject(client, stranger.id, sprint.id)).resolves.toBeNull()
    await expect(findEpicForProject(client, stranger.id, epic.id)).resolves.toBeNull()
    await expect(findTaskForProject(client, stranger.id, task.id)).resolves.toBeNull()
    await expect(listEpicsForSprint(client, stranger.id, sprint.id)).resolves.toEqual([])
    await expect(updateSprintPlanning(client, stranger.id, sprint.id, { title: 'x' }))
      .rejects.toThrow(SprintNotFoundError)
    await expect(transitionTaskStatus(client, stranger.id, task.id, 'IN_PROGRESS'))
      .rejects.toThrow(TaskNotFoundError)
  })

  it('rejects a blank or oversized code', async () => {
    const project = await seedProject('id-invalid')

    await expect(createSprint(client, { projectId: project.id, code: '   ', title: 'S', sequence: 0 }))
      .rejects.toThrow(InvalidBacklogInputError)
    await expect(createSprint(client, { projectId: project.id, code: 'A'.repeat(65), title: 'S', sequence: 1 }))
      .rejects.toThrow(InvalidBacklogInputError)
    await expect(createSprint(client, { projectId: project.id, code: 'OK', title: '  ', sequence: 2 }))
      .rejects.toThrow(InvalidBacklogInputError)
  })
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('sprint and epic lifecycle', () => {
  it('stamps startedAt on ACTIVE and completedAt on COMPLETED', async () => {
    const project = await seedProject('life-sprint')
    const sprint = await seedSprint(project.id)

    const active = await transitionSprintStatus(client, project.id, sprint.id, 'ACTIVE')
    expect(active.startedAt).toBeInstanceOf(Date)
    expect(active.completedAt).toBeNull()

    const completed = await transitionSprintStatus(client, project.id, sprint.id, 'COMPLETED')
    expect(completed.completedAt).toBeInstanceOf(Date)
    expect(completed.startedAt).toEqual(active.startedAt)
  })

  it('never fabricates a completedAt when cancelling', async () => {
    const project = await seedProject('life-cancel')
    const sprint = await seedSprint(project.id)

    const cancelled = await transitionSprintStatus(client, project.id, sprint.id, 'CANCELLED')
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.completedAt).toBeNull()
    expect(cancelled.startedAt).toBeNull()
  })

  it('rejects skipping ACTIVE and rejects leaving a terminal status', async () => {
    const project = await seedProject('life-invalid')
    const sprint = await seedSprint(project.id)

    await expect(transitionSprintStatus(client, project.id, sprint.id, 'COMPLETED'))
      .rejects.toThrow(InvalidBacklogTransitionError)

    await transitionSprintStatus(client, project.id, sprint.id, 'CANCELLED')
    await expect(transitionSprintStatus(client, project.id, sprint.id, 'ACTIVE'))
      .rejects.toThrow(InvalidBacklogTransitionError)
  })
})

describe('sprint and epic freeze and archival', () => {
  it('freezes sprint and epic structural fields once they leave PLANNED', async () => {
    const project = await seedProject('life-freeze')
    const sprint = await seedSprint(project.id)
    const epic = await seedEpic(sprint)

    await expect(updateSprintPlanning(client, project.id, sprint.id, { title: 'ok' })).resolves.toBeDefined()

    await transitionSprintStatus(client, project.id, sprint.id, 'ACTIVE')
    await transitionEpicStatus(client, project.id, epic.id, 'ACTIVE')

    await expect(updateSprintPlanning(client, project.id, sprint.id, { sequence: 9 }))
      .rejects.toThrow(BacklogPlanningFrozenError)
    await expect(updateEpicPlanning(client, project.id, epic.id, { title: 'no' }))
      .rejects.toThrow(BacklogPlanningFrozenError)
  })

  it('archives only terminal records and is idempotent', async () => {
    const project = await seedProject('life-archive')
    const sprint = await seedSprint(project.id)
    const epic = await seedEpic(sprint)

    await expect(archiveSprint(client, project.id, sprint.id)).rejects.toThrow(BacklogNotTerminalError)

    await transitionEpicStatus(client, project.id, epic.id, 'CANCELLED')
    const archived = await archiveEpic(client, project.id, epic.id)
    expect(archived.archivedAt).toBeInstanceOf(Date)

    const again = await archiveEpic(client, project.id, epic.id)
    expect(again.archivedAt).toEqual(archived.archivedAt)
  })
})

describe('task lifecycle', () => {
  it('walks TODO -> IN_PROGRESS -> IN_REVIEW -> DONE with coherent timestamps', async () => {
    const project = await seedProject('life-task')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    const started = await transitionTaskStatus(client, project.id, task.id, 'IN_PROGRESS')
    expect(started.startedAt).toBeInstanceOf(Date)
    expect(started.completedAt).toBeNull()

    await transitionTaskStatus(client, project.id, task.id, 'IN_REVIEW')
    const done = await transitionTaskStatus(client, project.id, task.id, 'DONE')

    expect(done.status).toBe('DONE')
    expect(done.completedAt).toBeInstanceOf(Date)
    expect(done.startedAt).toEqual(started.startedAt)
  })

  it('supports IN_REVIEW -> IN_PROGRESS rework without a new task', async () => {
    const project = await seedProject('life-rework')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    await transitionTaskStatus(client, project.id, task.id, 'IN_PROGRESS')
    await transitionTaskStatus(client, project.id, task.id, 'IN_REVIEW')
    const reworked = await transitionTaskStatus(client, project.id, task.id, 'IN_PROGRESS')

    expect(reworked.status).toBe('IN_PROGRESS')
    expect(reworked.completedAt).toBeNull()
  })

  it('rejects shortcuts and transitions out of a terminal status', async () => {
    const project = await seedProject('life-task-invalid')
    const sprint = await seedSprint(project.id)
    const shortcut = await seedTask(sprint, 0)
    const terminal = await seedTask(sprint, 1)

    await expect(transitionTaskStatus(client, project.id, shortcut.id, 'DONE'))
      .rejects.toThrow(InvalidBacklogTransitionError)
    await expect(transitionTaskStatus(client, project.id, shortcut.id, 'IN_REVIEW'))
      .rejects.toThrow(InvalidBacklogTransitionError)

    await completeTask(terminal)
    await expect(transitionTaskStatus(client, project.id, terminal.id, 'IN_PROGRESS'))
      .rejects.toThrow(InvalidBacklogTransitionError)
  })
})

describe('task freeze, archival and replanning', () => {
  it('freezes planning fields once the task leaves TODO', async () => {
    const project = await seedProject('life-task-freeze')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    await expect(updateTaskPlanning(client, project.id, task.id, { priority: 'P0' })).resolves.toBeDefined()

    await transitionTaskStatus(client, project.id, task.id, 'IN_PROGRESS')

    await expect(updateTaskPlanning(client, project.id, task.id, { priority: 'P3' }))
      .rejects.toThrow(BacklogPlanningFrozenError)
    await expect(updateTaskPlanning(client, project.id, task.id, { title: 'renamed' }))
      .rejects.toThrow(BacklogPlanningFrozenError)
  })

  it('archives a cancelled task and refuses a live one', async () => {
    const project = await seedProject('life-task-archive')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    await expect(archiveTask(client, project.id, task.id)).rejects.toThrow(BacklogNotTerminalError)

    await transitionTaskStatus(client, project.id, task.id, 'CANCELLED')
    const archived = await archiveTask(client, project.id, task.id)

    expect(archived.archivedAt).toBeInstanceOf(Date)
    expect(archived.completedAt).toBeNull()
  })

  it('moves a TODO task between sprints and clears its epic', async () => {
    const project = await seedProject('life-replan')
    const first = await seedSprint(project.id, 0)
    const second = await seedSprint(project.id, 1)
    const epic = await seedEpic(first)
    const task = await seedTask(first, 0, epic.id)

    const moved = await updateTaskPlanning(client, project.id, task.id, {
      sprintId: second.id,
      epicId: null,
      sequence: 5,
    })

    expect(moved.sprintId).toBe(second.id)
    expect(moved.epicId).toBeNull()
    expect(moved.sequence).toBe(5)
  })
})

// ── Priority, sequence and ordering ───────────────────────────────────────────

describe('priority and sequence', () => {
  it('round-trips every priority', async () => {
    const project = await seedProject('prio')
    const sprint = await seedSprint(project.id)
    const priorities = ['P0', 'P1', 'P2', 'P3'] as const

    for (const [index, priority] of priorities.entries()) {
      const task = await createTask(client, {
        projectId: project.id,
        sprintId: sprint.id,
        code: uniqueSlug('tsk'),
        type: 'STORY',
        title: `Priority ${priority}`,
        priority,
        sequence: index,
      })
      expect(task.priority).toBe(priority)
    }
  })

  it('has no database default for priority, so it can never be inferred', async () => {
    const rows: unknown = await client.$queryRaw`
      SELECT column_default, is_nullable
        FROM information_schema.columns
       WHERE table_name = 'tasks' AND column_name = 'priority'
    `
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toEqual([{ column_default: null, is_nullable: 'NO' }])
  })

  it('rejects a negative or non-integer sequence', async () => {
    const project = await seedProject('seq-invalid')
    const sprint = await seedSprint(project.id)

    for (const sequence of [-1, 1.5, Number.NaN]) {
      await expect(createTask(client, {
        projectId: project.id,
        sprintId: sprint.id,
        code: uniqueSlug('tsk'),
        type: 'TASK',
        title: 'Bad sequence',
        priority: 'P1',
        sequence,
      })).rejects.toThrow(InvalidBacklogInputError)
    }
  })
})

describe('sequence uniqueness and ordering', () => {
  it('enforces sequence uniqueness in the right scope', async () => {
    const project = await seedProject('seq-unique')
    const first = await seedSprint(project.id, 0)
    const second = await seedSprint(project.id, 1)

    await expect(seedSprint(project.id, 0)).rejects.toThrow(DuplicateBacklogSequenceError)

    await seedTask(first, 0)
    await expect(seedTask(first, 0)).rejects.toThrow(DuplicateBacklogSequenceError)
    // Per sprint, not per project: the same number is free in another sprint.
    await expect(seedTask(second, 0)).resolves.toBeDefined()
  })

  it('lists in explicit sequence order regardless of creation order', async () => {
    const project = await seedProject('seq-order')
    const sprint = await seedSprint(project.id)

    const third = await seedTask(sprint, 2)
    const first = await seedTask(sprint, 0)
    const second = await seedTask(sprint, 1)

    const listed = await listTasksForSprint(client, project.id, sprint.id)
    expect(listed.map(task => task.id)).toEqual([first.id, second.id, third.id])

    const sprints = await listSprintsForProject(client, project.id)
    expect(sprints.map(entry => entry.sequence)).toEqual([...sprints.map(entry => entry.sequence)].sort((a, b) => a - b))
  })

  it('lists epic-scoped and project-scoped tasks deterministically', async () => {
    const project = await seedProject('seq-scope')
    const sprint = await seedSprint(project.id)
    const epic = await seedEpic(sprint)

    const second = await seedTask(sprint, 1, epic.id)
    const first = await seedTask(sprint, 0, epic.id)
    await seedTask(sprint, 2)

    expect((await listTasksForEpic(client, project.id, epic.id)).map(task => task.id))
      .toEqual([first.id, second.id])
    expect((await listTasksForProject(client, project.id))).toHaveLength(3)
  })
})

// ── Acceptance criteria ───────────────────────────────────────────────────────

describe('acceptance criteria', () => {
  it('round-trips an ordered array of non-empty strings', async () => {
    const project = await seedProject('ac-roundtrip')
    const sprint = await seedSprint(project.id)
    const criteria = ['zebra runs', 'alpha builds', 'beta deploys']

    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'STORY',
      title: 'With criteria',
      priority: 'P0',
      sequence: 0,
      acceptanceCriteria: criteria,
    })

    expect(readTaskAcceptanceCriteria(task)).toEqual(criteria)

    const reloaded = await findTaskForProject(client, project.id, task.id)
    expect(reloaded).not.toBeNull()
    if (reloaded) {
      expect(readTaskAcceptanceCriteria(reloaded)).toEqual(criteria)
    }
  })

  it('defaults to an empty array', async () => {
    const project = await seedProject('ac-default')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    expect(readTaskAcceptanceCriteria(task)).toEqual([])
  })
})

describe('acceptance criteria validation', () => {
  it('rejects blank, non-string and non-array criteria', async () => {
    const project = await seedProject('ac-invalid')
    const sprint = await seedSprint(project.id)
    const invalid: unknown[] = [['ok', '   '], [''], ['ok', 7], [{ text: 'ok' }], 'one', { first: 'one' }, 42]

    for (const acceptanceCriteria of invalid) {
      await expect(createTask(client, {
        projectId: project.id,
        sprintId: sprint.id,
        code: uniqueSlug('tsk'),
        type: 'TASK',
        title: 'Bad criteria',
        priority: 'P1',
        sequence: 0,
        acceptanceCriteria,
      })).rejects.toThrow(InvalidAcceptanceCriteriaError)
    }
  })

  it('replaces criteria wholesale while the task is TODO', async () => {
    const project = await seedProject('ac-update')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    const updated = await updateTaskPlanning(client, project.id, task.id, {
      acceptanceCriteria: ['only remaining criterion'],
    })

    expect(readTaskAcceptanceCriteria(updated)).toEqual(['only remaining criterion'])
  })
})

// ── External identity ─────────────────────────────────────────────────────────

describe('external identity', () => {
  it('round-trips optional Jira provenance without any network call', async () => {
    const project = await seedProject('ext-roundtrip')
    const sprint = await seedSprint(project.id)

    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P0',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId: uniqueSlug('10'),
      externalKey: 'NDERCC-17',
      externalUrl: 'https://example.atlassian.net/browse/NDERCC-17',
    })

    expect(task.externalProvider).toBe('JIRA')
    expect(task.externalKey).toBe('NDERCC-17')
    // Local identity is unaffected by the external identity.
    await expect(findTaskByCode(client, project.id, task.code)).resolves.toMatchObject({ id: task.id })
  })

  it('requires the provider whenever an externalId is present', async () => {
    const project = await seedProject('ext-provider')
    const sprint = await seedSprint(project.id)

    await expect(createEpic(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('epi'),
      title: 'No provider',
      sequence: 0,
      externalId: '10042',
    })).rejects.toThrow(InvalidBacklogInputError)
  })
})

describe('external identity uniqueness', () => {
  it('rejects a duplicate external identity inside one project', async () => {
    const project = await seedProject('ext-dup')
    const sprint = await seedSprint(project.id)
    const externalId = uniqueSlug('jira')

    await createEpic(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('epi'),
      title: 'First',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })

    await expect(createEpic(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('epi'),
      title: 'Second',
      sequence: 1,
      externalProvider: 'JIRA',
      externalId,
    })).rejects.toThrow(DuplicateBacklogExternalIdError)
  })

  it('lets many records carry no provenance at all', async () => {
    const project = await seedProject('ext-null')
    const sprint = await seedSprint(project.id)

    await seedTask(sprint, 0)
    await seedTask(sprint, 1)
    const tasks = await listTasksForSprint(client, project.id, sprint.id)

    expect(tasks.every(task => task.externalId === null)).toBe(true)
  })
})

describe('external identity partial updates', () => {
  async function seedTracedTask(prefix: string, externalId: string | null): Promise<Task> {
    const project = await seedProject(prefix)
    const sprint = await seedSprint(project.id)
    return createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })
  }

  it('adds an externalId to a record that already carries a provider', async () => {
    const task = await seedTracedTask('ext-add-id', null)
    const externalId = uniqueSlug('jira')

    const updated = await updateTaskPlanning(client, task.projectId, task.id, { externalId })

    expect(updated.externalProvider).toBe('JIRA')
    expect(updated.externalId).toBe(externalId)
  })

  it('clears provenance and frees the identity for another record', async () => {
    const externalId = uniqueSlug('jira')
    const task = await seedTracedTask('ext-clear', externalId)

    const cleared = await updateTaskPlanning(client, task.projectId, task.id, {
      externalProvider: null,
      externalId: null,
    })
    expect(cleared.externalProvider).toBeNull()
    expect(cleared.externalId).toBeNull()

    // The freed identity is reusable within the same project.
    const reuse = await createTask(client, {
      projectId: task.projectId,
      sprintId: task.sprintId,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Reuses freed identity',
      priority: 'P1',
      sequence: 1,
      externalProvider: 'JIRA',
      externalId,
    })
    expect(reuse.externalId).toBe(externalId)
  })

  it('rejects clearing the provider while an externalId remains', async () => {
    const task = await seedTracedTask('ext-orphan', uniqueSlug('jira'))

    await expect(updateTaskPlanning(client, task.projectId, task.id, { externalProvider: null }))
      .rejects.toThrow(InvalidBacklogInputError)

    const unchanged = await findTaskForProject(client, task.projectId, task.id)
    expect(unchanged?.externalProvider).toBe('JIRA')
  })
})

// IR-NDERCC-17-001 — a blank externalId must never become planning state.
// Covers the shared validator through both aggregates and both write paths.
describe('external identity — blank rejection (IR-NDERCC-17-001)', () => {
  const BLANK_IDS = ['', '   ', '\t', '\n', ' \t\n ']

  it.each(BLANK_IDS)('rejects a blank externalId %j when creating a task without a provider', async (externalId) => {
    const project = await seedProject('ir1-task-noprov')
    const sprint = await seedSprint(project.id)

    await expect(createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Blank id',
      priority: 'P1',
      sequence: 0,
      externalId,
    })).rejects.toThrow(InvalidBacklogInputError)
  })

  it.each(BLANK_IDS)('rejects a blank externalId %j when creating a task with a provider', async (externalId) => {
    const project = await seedProject('ir1-task-prov')
    const sprint = await seedSprint(project.id)

    await expect(createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Blank id',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })).rejects.toThrow(InvalidBacklogInputError)
  })

  it.each(BLANK_IDS)('rejects a blank externalId %j when creating an epic', async (externalId) => {
    const project = await seedProject('ir1-epic')
    const sprint = await seedSprint(project.id)

    await expect(createEpic(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('epi'),
      title: 'Blank id',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })).rejects.toThrow(InvalidBacklogInputError)
  })
})

describe('external identity — blank never reaches the row (IR-NDERCC-17-001)', () => {
  it('never persists a blank externalId, and never silently converts it to null', async () => {
    const project = await seedProject('ir1-nopersist')
    const sprint = await seedSprint(project.id)

    await expect(createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Blank id',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId: '   ',
    })).rejects.toThrow(InvalidBacklogInputError)

    // The create was rejected outright — no row exists at all, so there is
    // neither a blank nor a null-coerced external identity in the database.
    expect(await listTasksForSprint(client, project.id, sprint.id)).toEqual([])
  })

  it('rejects a blank externalId on the task update path and leaves the record unchanged', async () => {
    const project = await seedProject('ir1-task-update')
    const sprint = await seedSprint(project.id)
    const externalId = uniqueSlug('jira')
    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
      externalKey: 'NDERCC-17',
    })

    await expect(updateTaskPlanning(client, project.id, task.id, { externalId: '   ' }))
      .rejects.toThrow(InvalidBacklogInputError)

    const unchanged = await findTaskForProject(client, project.id, task.id)
    expect(unchanged?.externalId).toBe(externalId)
    expect(unchanged?.externalProvider).toBe('JIRA')
    expect(unchanged?.externalKey).toBe('NDERCC-17')
  })
})

describe('external identity — blank rejection on epic update (IR-NDERCC-17-001)', () => {
  it('rejects a blank externalId on the epic update path and leaves the record unchanged', async () => {
    const project = await seedProject('ir1-epic-update')
    const sprint = await seedSprint(project.id)
    const externalId = uniqueSlug('jira')
    const epic = await createEpic(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('epi'),
      title: 'Traced',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })

    await expect(updateEpicPlanning(client, project.id, epic.id, { externalId: '' }))
      .rejects.toThrow(InvalidBacklogInputError)

    const unchanged = await findEpicForProject(client, project.id, epic.id)
    expect(unchanged?.externalId).toBe(externalId)
    expect(unchanged?.externalProvider).toBe('JIRA')
  })

  it('rejects a blank externalId even when the update also clears the provider', async () => {
    const project = await seedProject('ir1-both')
    const sprint = await seedSprint(project.id)
    const externalId = uniqueSlug('jira')
    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })

    await expect(updateTaskPlanning(client, project.id, task.id, {
      externalProvider: null,
      externalId: '  ',
    })).rejects.toThrow(InvalidBacklogInputError)

    const unchanged = await findTaskForProject(client, project.id, task.id)
    expect(unchanged?.externalId).toBe(externalId)
  })
})

describe('external identity — valid cases preserved (IR-NDERCC-17-001)', () => {
  it('still accepts a valid non-empty external identity on create and update', async () => {
    const project = await seedProject('ir1-valid')
    const sprint = await seedSprint(project.id)
    const first = uniqueSlug('jira')
    const second = uniqueSlug('jira')

    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId: first,
    })
    expect(task.externalId).toBe(first)

    const updated = await updateTaskPlanning(client, project.id, task.id, { externalId: second })
    expect(updated.externalId).toBe(second)
    expect(updated.externalProvider).toBe('JIRA')
  })

  it('still accepts explicit null clearing after the blank rule', async () => {
    const project = await seedProject('ir1-clear')
    const sprint = await seedSprint(project.id)
    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId: uniqueSlug('jira'),
    })

    const cleared = await updateTaskPlanning(client, project.id, task.id, {
      externalProvider: null,
      externalId: null,
    })

    expect(cleared.externalProvider).toBeNull()
    expect(cleared.externalId).toBeNull()
  })
})

describe('external identity — partial-update semantics preserved (IR-NDERCC-17-001)', () => {
  it('still treats undefined as "leave unchanged"', async () => {
    const project = await seedProject('ir1-undef')
    const sprint = await seedSprint(project.id)
    const externalId = uniqueSlug('jira')
    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Traced',
      priority: 'P1',
      sequence: 0,
      externalProvider: 'JIRA',
      externalId,
    })

    const retitled = await updateTaskPlanning(client, project.id, task.id, { title: 'Renamed' })

    expect(retitled.title).toBe('Renamed')
    expect(retitled.externalId).toBe(externalId)
    expect(retitled.externalProvider).toBe('JIRA')
  })
})

// ── Dependencies ──────────────────────────────────────────────────────────────

describe('task dependencies', () => {
  it('adds, reads and removes a directed edge', async () => {
    const project = await seedProject('dep-basic')
    const sprint = await seedSprint(project.id)
    const dependent = await seedTask(sprint, 0)
    const prerequisite = await seedTask(sprint, 1)

    const edge = await addTaskDependency(client, project.id, {
      taskId: dependent.id,
      dependsOnTaskId: prerequisite.id,
    })
    expect(edge.projectId).toBe(project.id)

    expect((await listTaskPrerequisites(client, project.id, dependent.id)).map(task => task.id))
      .toEqual([prerequisite.id])
    expect((await listTaskDependents(client, project.id, prerequisite.id)).map(task => task.id))
      .toEqual([dependent.id])
    // The direction is never reversed.
    expect(await listTaskPrerequisites(client, project.id, prerequisite.id)).toEqual([])

    await expect(removeTaskDependency(client, project.id, {
      taskId: dependent.id,
      dependsOnTaskId: prerequisite.id,
    })).resolves.toBe(true)
    expect(await listTaskPrerequisites(client, project.id, dependent.id)).toEqual([])
  })

  it('reports a no-op removal as false', async () => {
    const project = await seedProject('dep-noop')
    const sprint = await seedSprint(project.id)
    const dependent = await seedTask(sprint, 0)
    const other = await seedTask(sprint, 1)

    await expect(removeTaskDependency(client, project.id, {
      taskId: dependent.id,
      dependsOnTaskId: other.id,
    })).resolves.toBe(false)
  })
})

describe('task dependency rejection rules', () => {
  it('rejects self, duplicate and unknown edges', async () => {
    const project = await seedProject('dep-invalid')
    const sprint = await seedSprint(project.id)
    const dependent = await seedTask(sprint, 0)
    const prerequisite = await seedTask(sprint, 1)

    await expect(addTaskDependency(client, project.id, {
      taskId: dependent.id, dependsOnTaskId: dependent.id,
    })).rejects.toThrow(SelfDependencyError)

    await addTaskDependency(client, project.id, { taskId: dependent.id, dependsOnTaskId: prerequisite.id })
    await expect(addTaskDependency(client, project.id, {
      taskId: dependent.id, dependsOnTaskId: prerequisite.id,
    })).rejects.toThrow(DuplicateTaskDependencyError)

    await expect(addTaskDependency(client, project.id, {
      taskId: dependent.id, dependsOnTaskId: UNKNOWN_UUID,
    })).rejects.toThrow(TaskNotFoundError)
  })

  it('rejects a prerequisite from another project', async () => {
    const owner = await seedProject('dep-cross-owner')
    const other = await seedProject('dep-cross-other')
    const dependent = await seedTask(await seedSprint(owner.id), 0)
    const foreign = await seedTask(await seedSprint(other.id), 0)

    await expect(addTaskDependency(client, owner.id, {
      taskId: dependent.id, dependsOnTaskId: foreign.id,
    })).rejects.toThrow(CrossProjectDependencyError)
  })

  it('allows a cross-sprint and cross-epic edge inside one project', async () => {
    const project = await seedProject('dep-cross-sprint')
    const first = await seedSprint(project.id, 0)
    const second = await seedSprint(project.id, 1)
    const epic = await seedEpic(first)
    const dependent = await seedTask(second, 0)
    const prerequisite = await seedTask(first, 0, epic.id)

    await expect(addTaskDependency(client, project.id, {
      taskId: dependent.id, dependsOnTaskId: prerequisite.id,
    })).resolves.toBeDefined()
  })
})

describe('task dependency cycles', () => {
  it('rejects a direct two-node cycle', async () => {
    const project = await seedProject('dep-cycle-direct')
    const sprint = await seedSprint(project.id)
    const a = await seedTask(sprint, 0)
    const b = await seedTask(sprint, 1)

    await addTaskDependency(client, project.id, { taskId: a.id, dependsOnTaskId: b.id })
    await expect(addTaskDependency(client, project.id, {
      taskId: b.id, dependsOnTaskId: a.id,
    })).rejects.toThrow(TaskDependencyCycleError)
  })

  it('rejects a multi-hop cycle', async () => {
    const project = await seedProject('dep-cycle-multi')
    const sprint = await seedSprint(project.id)
    const a = await seedTask(sprint, 0)
    const b = await seedTask(sprint, 1)
    const c = await seedTask(sprint, 2)
    const d = await seedTask(sprint, 3)

    await addTaskDependency(client, project.id, { taskId: a.id, dependsOnTaskId: b.id })
    await addTaskDependency(client, project.id, { taskId: b.id, dependsOnTaskId: c.id })
    await addTaskDependency(client, project.id, { taskId: c.id, dependsOnTaskId: d.id })

    // d -> a would close a -> b -> c -> d -> a.
    await expect(addTaskDependency(client, project.id, {
      taskId: d.id, dependsOnTaskId: a.id,
    })).rejects.toThrow(TaskDependencyCycleError)

    // A diamond is not a cycle and stays allowed.
    const e = await seedTask(sprint, 4)
    await expect(addTaskDependency(client, project.id, {
      taskId: e.id, dependsOnTaskId: b.id,
    })).resolves.toBeDefined()
    await expect(addTaskDependency(client, project.id, {
      taskId: a.id, dependsOnTaskId: c.id,
    })).resolves.toBeDefined()
  })
})

describe('task dependency freeze and ordering', () => {
  it('freezes the dependency set once the dependent task leaves TODO', async () => {
    const project = await seedProject('dep-freeze')
    const sprint = await seedSprint(project.id)
    const dependent = await seedTask(sprint, 0)
    const first = await seedTask(sprint, 1)
    const second = await seedTask(sprint, 2)

    await addTaskDependency(client, project.id, { taskId: dependent.id, dependsOnTaskId: first.id })
    await transitionTaskStatus(client, project.id, dependent.id, 'IN_PROGRESS')

    await expect(addTaskDependency(client, project.id, {
      taskId: dependent.id, dependsOnTaskId: second.id,
    })).rejects.toThrow(TaskDependencyFrozenError)
    await expect(removeTaskDependency(client, project.id, {
      taskId: dependent.id, dependsOnTaskId: first.id,
    })).rejects.toThrow(TaskDependencyFrozenError)

    // The prerequisite's own progress never freezes anything.
    expect((await listTaskPrerequisites(client, project.id, dependent.id)).map(task => task.id))
      .toEqual([first.id])
  })

  it('orders prerequisites and dependents deterministically', async () => {
    const project = await seedProject('dep-order')
    const sprint = await seedSprint(project.id)
    const dependent = await seedTask(sprint, 0)
    const third = await seedTask(sprint, 3)
    const first = await seedTask(sprint, 1)
    const second = await seedTask(sprint, 2)

    for (const prerequisite of [third, first, second]) {
      await addTaskDependency(client, project.id, {
        taskId: dependent.id,
        dependsOnTaskId: prerequisite.id,
      })
    }

    expect((await listTaskPrerequisites(client, project.id, dependent.id)).map(task => task.sequence))
      .toEqual([1, 2, 3])
  })

  it('leaves a DONE prerequisite recorded without drawing any readiness conclusion', async () => {
    const project = await seedProject('dep-done')
    const sprint = await seedSprint(project.id)
    const dependent = await seedTask(sprint, 0)
    const prerequisite = await seedTask(sprint, 1)

    await addTaskDependency(client, project.id, { taskId: dependent.id, dependsOnTaskId: prerequisite.id })
    const done = await completeTask(prerequisite)

    expect(done.status).toBe('DONE')
    // The dependent is untouched: nothing here promotes it to a "ready" state.
    const reloaded = await findTaskForProject(client, project.id, dependent.id)
    expect(reloaded?.status).toBe('TODO')
  })
})

// ── Database-enforced invariants ──────────────────────────────────────────────
//
// These bypass the persistence layer entirely and write raw SQL, proving the
// database rejects the same things the application layer rejects. Without
// them, every guarantee above would rest on application code alone.

describe('database-enforced invariants', () => {
  it('rejects a self-dependency at the CHECK constraint', async () => {
    const project = await seedProject('raw-self')
    const sprint = await seedSprint(project.id)
    const task = await seedTask(sprint)

    await expect(client.$executeRaw`
      INSERT INTO task_dependencies (project_id, task_id, depends_on_task_id)
      VALUES (${project.id}::uuid, ${task.id}::uuid, ${task.id}::uuid)
    `).rejects.toThrow(/task_dependencies_no_self_check/)
  })

  it('rejects a cross-project dependency at the composite foreign key', async () => {
    const owner = await seedProject('raw-cross')
    const other = await seedProject('raw-cross-other')
    const dependent = await seedTask(await seedSprint(owner.id), 0)
    const foreign = await seedTask(await seedSprint(other.id), 0)

    await expect(client.$executeRaw`
      INSERT INTO task_dependencies (project_id, task_id, depends_on_task_id)
      VALUES (${owner.id}::uuid, ${dependent.id}::uuid, ${foreign.id}::uuid)
    `).rejects.toThrow()
  })

  it('rejects a task whose epic belongs to a different sprint', async () => {
    const project = await seedProject('raw-epic')
    const first = await seedSprint(project.id, 0)
    const second = await seedSprint(project.id, 1)
    const epic = await seedEpic(first)

    await expect(client.$executeRaw`
      INSERT INTO tasks (project_id, sprint_id, epic_id, code, type, title, priority, sequence, updated_at)
      VALUES (
        ${project.id}::uuid, ${second.id}::uuid, ${epic.id}::uuid,
        ${uniqueSlug('raw').toUpperCase()}, 'TASK', 'Raw', 'P0', 900, now()
      )
    `).rejects.toThrow()
  })

  it('refuses to delete a project that still owns backlog records', async () => {
    const project = await seedProject('raw-restrict')
    const sprint = await seedSprint(project.id)
    await seedTask(sprint)

    await expect(client.$executeRaw`
      DELETE FROM projects WHERE id = ${project.id}::uuid
    `).rejects.toThrow()
  })
})

describe('database-enforced enum and table shape', () => {
  it('keeps the persisted enums identical to the domain definitions', async () => {
    const expected: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['sprint_status', ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']],
      ['epic_status', ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED']],
      ['task_status', ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED']],
      ['task_type', ['STORY', 'TASK', 'BUG', 'SPIKE', 'CHORE']],
      ['task_priority', ['P0', 'P1', 'P2', 'P3']],
      ['backlog_external_provider', ['JIRA']],
    ]

    for (const [typeName, members] of expected) {
      const rows: unknown = await client.$queryRaw`
        SELECT enumlabel::text AS value
          FROM pg_type AS t
          JOIN pg_enum AS e ON e.enumtypid = t.oid
         WHERE t.typname = ${typeName}
         ORDER BY e.enumsortorder
      `
      expect(rows).toEqual(members.map(value => ({ value })))
    }
  })

  it('persists no readiness state anywhere in the task status enum', async () => {
    const rows: unknown = await client.$queryRaw`
      SELECT enumlabel::text AS value
        FROM pg_type AS t
        JOIN pg_enum AS e ON e.enumtypid = t.oid
       WHERE t.typname = 'task_status'
         AND e.enumlabel IN ('READY', 'BLOCKED', 'AMBIGUOUS', 'CONFLICT')
    `
    expect(rows).toEqual([])
  })

  it('has no roadmap_items table in this slice', async () => {
    const rows: unknown = await client.$queryRaw`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'roadmap_items'
    `
    expect(rows).toEqual([])
  })
})

// ── Not-found semantics ───────────────────────────────────────────────────────

describe('not-found semantics', () => {
  it('raises the aggregate’s own not-found error for unknown identifiers', async () => {
    const project = await seedProject('nf')

    await expect(updateSprintPlanning(client, project.id, UNKNOWN_UUID, { title: 'x' }))
      .rejects.toThrow(SprintNotFoundError)
    await expect(transitionEpicStatus(client, project.id, UNKNOWN_UUID, 'ACTIVE'))
      .rejects.toThrow(EpicNotFoundError)
    await expect(archiveTask(client, project.id, UNKNOWN_UUID))
      .rejects.toThrow(TaskNotFoundError)
  })

  it('returns null rather than throwing for unknown reads', async () => {
    const project = await seedProject('nf-read')

    await expect(findSprintForProject(client, project.id, UNKNOWN_UUID)).resolves.toBeNull()
    await expect(findEpicForProject(client, project.id, UNKNOWN_UUID)).resolves.toBeNull()
    await expect(findTaskForProject(client, project.id, UNKNOWN_UUID)).resolves.toBeNull()
  })
})
