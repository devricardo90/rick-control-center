/**
 * Integration tests for the governed SDD specification persistence surface.
 *
 * Runs against a real, disposable local PostgreSQL instance. That matters
 * here for the same reason it matters for the operational backlog: the
 * invariants this slice depends on — same-project ownership through
 * composite foreign keys, deterministic version identity, and above all the
 * PARTIAL unique index that permits exactly one APPROVED specification per
 * Task — are database-enforced properties. Several tests below deliberately
 * bypass the persistence layer with raw SQL or a direct Prisma write to
 * prove the database rejects what the application layer also rejects; a mock
 * could only prove the application half.
 *
 * No test here touches the network, and no Execution Contract is created,
 * derived or asserted on anywhere — P0-040 through P0-043 do not exist yet.
 *
 * Test files run in parallel against one database and nothing is truncated
 * between tests, so every test creates its own project and scopes its
 * assertions to rows it created. The one shared row is the singleton
 * `Operator`, which these tests read and only create when absent — they
 * never overwrite an existing operator, so they cannot disturb the
 * authentication suites running alongside them.
 *
 * NDERCC-23 / DEC-RIC-010: governed SDD specification lifecycle (P1-038).
 */
import { createHash } from 'node:crypto'
import type { PrismaClient, Project, Task } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import {
  canonicalSpecContent,
  ImplementationSpecStatus,
  SPEC_LIFECYCLE_VERSION,
  SpecEligibilityReason,
  SpecValidationCode,
} from '@rick/domain'
import type { ImplementationSpecContentInput } from '@rick/domain'
import { recordDocumentSnapshotSync } from './document-snapshot.js'
import { createDocumentSource } from './document-source.js'
import {
  ArchivedProjectReadOnlyError,
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
  ProjectNotFoundError,
  TaskNotFoundError,
} from './errors.js'
import {
  approveImplementationSpec,
  createImplementationSpec,
  findApprovedImplementationSpecForTask,
  findImplementationSpecForProject,
  listImplementationSpecDecisionIds,
  listImplementationSpecLineage,
  listImplementationSpecRequirementIds,
  listImplementationSpecsForTask,
  readImplementationSpecContent,
  rejectImplementationSpec,
  resolveImplementationSpecExecutionEligibility,
  reviseImplementationSpec,
  updateImplementationSpecDraft,
  validateImplementationSpecById,
} from './implementation-spec.js'
import { getPrimaryOperator, upsertPrimaryOperator } from './operator.js'
import { createProject, transitionProjectLifecycle } from './project.js'
import { createSprint } from './sprint.js'
import { extractStrategicTruth } from './strategic-truth.js'
import { createTask } from './task.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client: PrismaClient = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function content(overrides: Partial<ImplementationSpecContentInput> = {}): ImplementationSpecContentInput {
  return {
    title: 'Governed specification',
    behavior: 'The specification is approved before anything is derived from it.',
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

async function seedTask(prefix: string): Promise<{ project: Project, task: Task }> {
  const project = await createProject(client, { key: uniqueSlug(prefix), name: `${prefix} project` })
  const sprint = await createSprint(client, {
    projectId: project.id,
    code: uniqueSlug('spr'),
    title: 'Sprint',
    sequence: 0,
  })
  const task = await createTask(client, {
    projectId: project.id,
    sprintId: sprint.id,
    code: uniqueSlug('tsk'),
    type: 'TASK',
    title: 'Governed unit of work',
    priority: 'P0',
    sequence: 0,
  })

  return { project, task }
}

/**
 * Reads the installation's singleton operator, creating one only when the
 * database has none. It never rewrites an existing operator's credentials,
 * so a parallel authentication suite that owns that row is unaffected.
 */
async function approverId(): Promise<string> {
  const existing = await getPrimaryOperator(client)

  if (existing) {
    return existing.id
  }

  const created = await upsertPrimaryOperator(client, {
    username: uniqueSlug('spec-approver'),
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder',
  })

  return created.id
}

const TRUTH_SOURCE = [
  '# Strategic source',
  'REQ-900: [P0] A specification precedes execution.',
  '',
  '## DEC-RIC-900 — Specification authority',
  '- Status: APPROVED',
  '- Decision: The approved specification is the execution authority.',
].join('\n')

/** Seeds one ACTIVE requirement and one APPROVED decision through the real extraction path. */
async function seedStrategicTruth(projectId: string): Promise<{ requirementId: string, decisionId: string }> {
  const source = await createDocumentSource(client, {
    projectId,
    provider: 'GOOGLE_DRIVE',
    externalFileId: uniqueSlug('spec-truth-file'),
    documentType: 'PRD',
    title: 'Specification source',
    url: 'https://docs.google.com/document/d/ndercc23/edit',
    approvalStatus: 'APPROVED',
  })
  const synced = await recordDocumentSnapshotSync(client, {
    projectId,
    documentSourceId: source.id,
    providerVersion: '1',
    contentText: TRUTH_SOURCE,
    checksum: createHash('sha256').update(Buffer.from(TRUTH_SOURCE, 'utf8')).digest('hex'),
    providerModifiedAt: new Date('2026-09-02T00:00:00.000Z'),
    syncedAt: new Date(),
  })

  await extractStrategicTruth(client, {
    projectId,
    documentSourceId: source.id,
    sourceSnapshotId: synced.snapshot.id,
  })

  const requirement = await client.requirement.findFirstOrThrow({ where: { projectId, code: 'REQ-900' } })
  const decision = await client.decision.findFirstOrThrow({ where: { projectId, code: 'DEC-RIC-900' } })

  return { requirementId: requirement.id, decisionId: decision.id }
}

// ── Creation ──────────────────────────────────────────────────────────────────

describe('specification creation', () => {
  it('opens a new lineage in DRAFT with a recomputed content hash', async () => {
    const { project, task } = await seedTask('spec-create')

    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: ' ric-spec-create-001 ',
      version: '1.0.0',
      content: content(),
    })

    expect(spec).toMatchObject({
      projectId: project.id,
      taskId: task.id,
      code: 'RIC-SPEC-CREATE-001',
      version: '1.0.0',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      status: ImplementationSpecStatus.DRAFT,
      rulesVersion: SPEC_LIFECYCLE_VERSION,
      approvedAt: null,
      approvedByOperatorId: null,
      supersedesSpecId: null,
    })

    const stored = readImplementationSpecContent(spec)
    expect(stored.ok).toBe(true)
    expect(stored.ok && spec.contentHash).toBe(
      createHash('sha256')
        .update(Buffer.from(stored.ok ? canonicalSpecContent(stored.value) : '', 'utf8'))
        .digest('hex'),
    )
  })

  it('accepts an incomplete draft — approvability is decided at approval time', async () => {
    const { project, task } = await seedTask('spec-incomplete')

    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-incomplete'),
      version: '0.1.0',
      content: content({ acceptanceCriteria: [] }),
    })

    expect(spec.status).toBe(ImplementationSpecStatus.DRAFT)
    const outcome = await validateImplementationSpecById(client, project.id, spec.id)
    expect(outcome.valid).toBe(false)
  })

  it('rejects a malformed version, code or body', async () => {
    const { project, task } = await seedTask('spec-malformed')
    const base = { projectId: project.id, taskId: task.id, content: content() }

    await expect(createImplementationSpec(client, { ...base, code: 'RIC-SPEC-A', version: 'v1.0.0' }))
      .rejects.toBeInstanceOf(InvalidImplementationSpecInputError)
    await expect(createImplementationSpec(client, { ...base, code: '   ', version: '1.0.0' }))
      .rejects.toBeInstanceOf(InvalidImplementationSpecInputError)
    await expect(createImplementationSpec(client, {
      ...base,
      code: 'RIC-SPEC-B',
      version: '1.0.0',
      content: content({ behavior: '  ' }),
    })).rejects.toBeInstanceOf(InvalidImplementationSpecInputError)
  })

  it('refuses a duplicate lineage code in the same project', async () => {
    const { project, task } = await seedTask('spec-dup')
    const code = uniqueSlug('ric-spec-dup')
    const base = { projectId: project.id, taskId: task.id, code, content: content() }

    await createImplementationSpec(client, { ...base, version: '1.0.0' })

    await expect(createImplementationSpec(client, { ...base, version: '2.0.0' }))
      .rejects.toBeInstanceOf(DuplicateImplementationSpecCodeError)
  })

  it('refuses to govern a task from another project', async () => {
    const [own, other] = await Promise.all([seedTask('spec-own'), seedTask('spec-other')])

    await expect(createImplementationSpec(client, {
      projectId: own.project.id,
      taskId: other.task.id,
      code: uniqueSlug('ric-spec-cross'),
      version: '1.0.0',
      content: content(),
    })).rejects.toBeInstanceOf(TaskNotFoundError)
  })

  it('refuses to write into an archived project', async () => {
    const { project, task } = await seedTask('spec-archived')
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-arch'),
      version: '1.0.0',
      content: content(),
    })).rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })

  it('refuses an unknown project', async () => {
    await expect(createImplementationSpec(client, {
      projectId: UNKNOWN_UUID,
      taskId: UNKNOWN_UUID,
      code: uniqueSlug('ric-spec-nop'),
      version: '1.0.0',
      content: content(),
    })).rejects.toBeInstanceOf(ProjectNotFoundError)
  })
})

// ── Versioning ────────────────────────────────────────────────────────────────

describe('specification versioning', () => {
  it('appends a strictly greater version as a new row and leaves the previous one untouched', async () => {
    const { project, task } = await seedTask('spec-version')
    const code = uniqueSlug('ric-spec-version')

    const first = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code,
      version: '1.0.0',
      content: content(),
    })
    const second = await reviseImplementationSpec(client, {
      projectId: project.id,
      code,
      version: '1.1.0',
      content: content({ risks: ['a newly recorded risk'] }),
    })

    expect(second.id).not.toBe(first.id)
    expect(second.taskId).toBe(first.taskId)
    expect(second.contentHash).not.toBe(first.contentHash)

    const reloadedFirst = await findImplementationSpecForProject(client, project.id, first.id)
    expect(reloadedFirst).toMatchObject({ version: '1.0.0', contentHash: first.contentHash })

    const lineage = await listImplementationSpecLineage(client, project.id, code)
    expect(lineage.map(entry => entry.version)).toEqual(['1.0.0', '1.1.0'])
  })

  it.each(['1.0.0', '0.9.9'])('refuses a revision at %s that does not advance the lineage', async (candidate) => {
    const { project, task } = await seedTask(`spec-noadv-${candidate.replace(/\./gu, '')}`)
    const code = uniqueSlug('ric-spec-noadv')

    await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code,
      version: '1.0.0',
      content: content(),
    })

    await expect(reviseImplementationSpec(client, { projectId: project.id, code, version: candidate, content: content() }))
      .rejects.toBeInstanceOf(ImplementationSpecVersionNotIncreasingError)
  })

  it('refuses a revision of a lineage that does not exist', async () => {
    const { project } = await seedTask('spec-nolineage')

    await expect(reviseImplementationSpec(client, {
      projectId: project.id,
      code: uniqueSlug('ric-spec-absent'),
      version: '1.0.0',
      content: content(),
    })).rejects.toBeInstanceOf(ImplementationSpecNotFoundError)
  })

  it('rejects a duplicate version at the database level even when the pre-check is bypassed', async () => {
    const { project, task } = await seedTask('spec-dbversion')
    const code = uniqueSlug('ric-spec-dbversion')
    const first = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code,
      version: '1.0.0',
      content: content(),
    })

    await expect(client.implementationSpec.create({
      data: {
        projectId: project.id,
        taskId: first.taskId,
        // The stored, normalized code — the module uppercases on write, so
        // the raw fixture string would not collide with the row it created.
        code: first.code,
        version: '1.0.0',
        versionMajor: 1,
        versionMinor: 0,
        versionPatch: 0,
        title: first.title,
        behavior: first.behavior,
        scopeJson: [],
        nonGoalsJson: [],
        acceptanceCriteriaJson: [],
        contentHash: first.contentHash,
        rulesVersion: first.rulesVersion,
      },
    })).rejects.toThrow()
  })
})

// ── Draft editing and freeze ──────────────────────────────────────────────────

describe('draft editing and content freeze', () => {
  it('rewrites content and its hash while DRAFT', async () => {
    const { project, task } = await seedTask('spec-edit')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-edit'),
      version: '1.0.0',
      content: content({ acceptanceCriteria: [] }),
    })

    const edited = await updateImplementationSpecDraft(client, project.id, spec.id, content())

    expect(edited.contentHash).not.toBe(spec.contentHash)
    expect((await validateImplementationSpecById(client, project.id, spec.id)).valid).toBe(true)
  })

  it('freezes content once the specification leaves DRAFT', async () => {
    const { project, task } = await seedTask('spec-freeze')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-freeze'),
      version: '1.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })

    await expect(updateImplementationSpecDraft(client, project.id, spec.id, content({ risks: ['late edit'] })))
      .rejects.toBeInstanceOf(ImplementationSpecContentFrozenError)
  })

  it('hides a specification that belongs to another project', async () => {
    const [own, other] = await Promise.all([seedTask('spec-hide-a'), seedTask('spec-hide-b')])
    const spec = await createImplementationSpec(client, {
      projectId: other.project.id,
      taskId: other.task.id,
      code: uniqueSlug('ric-spec-hide'),
      version: '1.0.0',
      content: content(),
    })

    expect(await findImplementationSpecForProject(client, own.project.id, spec.id)).toBeNull()
    await expect(updateImplementationSpecDraft(client, own.project.id, spec.id, content()))
      .rejects.toBeInstanceOf(ImplementationSpecNotFoundError)
  })
})

// ── Approval ──────────────────────────────────────────────────────────────────

describe('specification approval', () => {
  it('records an explicit, attributed approval', async () => {
    const { project, task } = await seedTask('spec-approve')
    const operatorId = await approverId()
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-approve'),
      version: '1.0.0',
      content: content(),
    })

    const approved = await approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: operatorId,
    })

    expect(approved.status).toBe(ImplementationSpecStatus.APPROVED)
    expect(approved.approvedByOperatorId).toBe(operatorId)
    expect(approved.approvedAt).toBeInstanceOf(Date)
    expect(await findApprovedImplementationSpecForTask(client, project.id, task.id)).toMatchObject({ id: spec.id })
  })

  it('refuses to approve an invalid specification and names the findings', async () => {
    const { project, task } = await seedTask('spec-invalid')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-invalid'),
      version: '1.0.0',
      content: content({ acceptanceCriteria: [], nonGoals: [] }),
    })

    const failure = approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })

    await expect(failure).rejects.toBeInstanceOf(ImplementationSpecNotApprovableError)
    await expect(failure).rejects.toMatchObject({
      findingCodes: [SpecValidationCode.MISSING_NON_GOALS, SpecValidationCode.MISSING_ACCEPTANCE_CRITERIA],
    })

    const unchanged = await findImplementationSpecForProject(client, project.id, spec.id)
    expect(unchanged?.status).toBe(ImplementationSpecStatus.DRAFT)
  })

  it('refuses an approval with no real approver', async () => {
    const { project, task } = await seedTask('spec-noapprover')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-noapprover'),
      version: '1.0.0',
      content: content(),
    })

    await expect(approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: UNKNOWN_UUID,
    })).rejects.toBeInstanceOf(ImplementationSpecApproverNotFoundError)
  })

  it('refuses to re-approve an already approved specification', async () => {
    const { project, task } = await seedTask('spec-reapprove')
    const operatorId = await approverId()
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-reapprove'),
      version: '1.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, { projectId: project.id, specId: spec.id, approvedByOperatorId: operatorId })

    await expect(approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: operatorId,
    })).rejects.toBeInstanceOf(InvalidImplementationSpecTransitionError)
  })
})

// ── Rejection ─────────────────────────────────────────────────────────────────

describe('specification rejection', () => {
  it('records a reason and makes REJECTED terminal', async () => {
    const { project, task } = await seedTask('spec-reject')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-reject'),
      version: '1.0.0',
      content: content(),
    })

    const rejected = await rejectImplementationSpec(client, project.id, spec.id, '  criteria are not verifiable  ')

    expect(rejected).toMatchObject({
      status: ImplementationSpecStatus.REJECTED,
      rejectionReason: 'criteria are not verifiable',
    })
    expect(rejected.rejectedAt).toBeInstanceOf(Date)

    await expect(approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })).rejects.toBeInstanceOf(InvalidImplementationSpecTransitionError)
    await expect(rejectImplementationSpec(client, project.id, spec.id, 'again'))
      .rejects.toBeInstanceOf(InvalidImplementationSpecTransitionError)
  })

  it('refuses a blank rejection reason', async () => {
    const { project, task } = await seedTask('spec-blankreject')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-blankreject'),
      version: '1.0.0',
      content: content(),
    })

    await expect(rejectImplementationSpec(client, project.id, spec.id, '   '))
      .rejects.toBeInstanceOf(InvalidImplementationSpecInputError)
  })
})

// ── Supersession ──────────────────────────────────────────────────────────────

describe('specification supersession', () => {
  async function seedApprovedLineage(prefix: string) {
    const { project, task } = await seedTask(prefix)
    const operatorId = await approverId()
    const code = uniqueSlug(`ric-spec-${prefix}`)
    const first = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code,
      version: '1.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, { projectId: project.id, specId: first.id, approvedByOperatorId: operatorId })
    const second = await reviseImplementationSpec(client, {
      projectId: project.id,
      code,
      version: '2.0.0',
      content: content({ risks: ['revised'] }),
    })

    return { project, task, operatorId, code, first, second }
  }

  it('retires the named predecessor and installs the successor in one transaction', async () => {
    const { project, task, operatorId, first, second } = await seedApprovedLineage('supersede')

    const approved = await approveImplementationSpec(client, {
      projectId: project.id,
      specId: second.id,
      approvedByOperatorId: operatorId,
      supersedesSpecId: first.id,
    })

    expect(approved).toMatchObject({
      status: ImplementationSpecStatus.APPROVED,
      supersedesSpecId: first.id,
    })

    const predecessor = await findImplementationSpecForProject(client, project.id, first.id)
    expect(predecessor?.status).toBe(ImplementationSpecStatus.SUPERSEDED)
    expect(predecessor?.supersededAt).toBeInstanceOf(Date)
    expect(await findApprovedImplementationSpecForTask(client, project.id, task.id)).toMatchObject({ id: second.id })
  })

  it('preserves the superseded specification exactly as it was approved', async () => {
    const { project, operatorId, code, first, second } = await seedApprovedLineage('history')
    await approveImplementationSpec(client, {
      projectId: project.id,
      specId: second.id,
      approvedByOperatorId: operatorId,
      supersedesSpecId: first.id,
    })

    const predecessor = await findImplementationSpecForProject(client, project.id, first.id)
    expect(predecessor).toMatchObject({
      contentHash: first.contentHash,
      version: '1.0.0',
      approvedByOperatorId: operatorId,
    })
    expect(predecessor?.approvedAt).toBeInstanceOf(Date)

    const lineage = await listImplementationSpecLineage(client, project.id, code)
    expect(lineage.map(entry => [entry.version, entry.status])).toEqual([
      ['1.0.0', ImplementationSpecStatus.SUPERSEDED],
      ['2.0.0', ImplementationSpecStatus.APPROVED],
    ])
  })

  it('refuses an approval that does not name the specification it replaces', async () => {
    const { project, operatorId, second } = await seedApprovedLineage('needsuper')

    await expect(approveImplementationSpec(client, {
      projectId: project.id,
      specId: second.id,
      approvedByOperatorId: operatorId,
    })).rejects.toBeInstanceOf(ImplementationSpecSupersessionRequiredError)
  })

  it('refuses to supersede anything other than the task current approved specification', async () => {
    const { project, operatorId, second } = await seedApprovedLineage('wrongsuper')

    await expect(approveImplementationSpec(client, {
      projectId: project.id,
      specId: second.id,
      approvedByOperatorId: operatorId,
      supersedesSpecId: UNKNOWN_UUID,
    })).rejects.toBeInstanceOf(InvalidImplementationSpecSupersessionError)
  })

  it('refuses a supersession target when the task has no approved specification', async () => {
    const { project, task } = await seedTask('spec-nosuper')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-nosuper'),
      version: '1.0.0',
      content: content(),
    })

    await expect(approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
      supersedesSpecId: UNKNOWN_UUID,
    })).rejects.toBeInstanceOf(InvalidImplementationSpecSupersessionError)
  })

  it('lets a different lineage supersede the current authority for the same task', async () => {
    const { project, task, operatorId, first } = await seedApprovedLineage('crosslineage')
    const replacement = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-replacement'),
      version: '1.0.0',
      content: content(),
    })

    const approved = await approveImplementationSpec(client, {
      projectId: project.id,
      specId: replacement.id,
      approvedByOperatorId: operatorId,
      supersedesSpecId: first.id,
    })

    expect(approved.supersedesSpecId).toBe(first.id)
    expect(await findApprovedImplementationSpecForTask(client, project.id, task.id)).toMatchObject({ id: replacement.id })
  })

  it('lets the database reject a second approved specification for one task', async () => {
    const { project, task, operatorId, first, second } = await seedApprovedLineage('dbapproved')

    // Deliberately bypasses the persistence layer: the partial unique index
    // `implementation_specs_task_approved_key` must hold on its own, without
    // the transactional supersession that the module always performs.
    await expect(client.implementationSpec.update({
      where: { id: second.id },
      data: { status: ImplementationSpecStatus.APPROVED, approvedByOperatorId: operatorId, approvedAt: new Date() },
    })).rejects.toThrow()

    expect(await findApprovedImplementationSpecForTask(client, project.id, task.id)).toMatchObject({ id: first.id })
  })

  it('lets the database reject a self-supersession', async () => {
    const { project, task } = await seedTask('spec-selfsuper')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-selfsuper'),
      version: '1.0.0',
      content: content(),
    })

    await expect(client.$executeRaw`
      UPDATE implementation_specs SET supersedes_spec_id = id WHERE id = ${spec.id}::uuid
    `).rejects.toThrow()
  })
})

// ── Traceability ──────────────────────────────────────────────────────────────

describe('specification traceability', () => {
  it('links a specification to the requirements and decisions it was written against', async () => {
    const { project, task } = await seedTask('spec-trace')
    const truth = await seedStrategicTruth(project.id)

    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-trace'),
      version: '1.0.0',
      content: content(),
      requirementIds: [truth.requirementId, truth.requirementId],
      decisionIds: [truth.decisionId],
    })

    expect(await listImplementationSpecRequirementIds(client, project.id, spec.id)).toEqual([truth.requirementId])
    expect(await listImplementationSpecDecisionIds(client, project.id, spec.id)).toEqual([truth.decisionId])
  })

  it('refuses a link to a requirement or decision outside the project', async () => {
    const [own, other] = await Promise.all([seedTask('spec-traceown'), seedTask('spec-traceother')])
    const foreign = await seedStrategicTruth(other.project.id)
    const base = {
      projectId: own.project.id,
      taskId: own.task.id,
      version: '1.0.0',
      content: content(),
    }

    await expect(createImplementationSpec(client, {
      ...base,
      code: uniqueSlug('ric-spec-tracea'),
      requirementIds: [foreign.requirementId],
    })).rejects.toBeInstanceOf(ImplementationSpecTraceTargetNotFoundError)
    await expect(createImplementationSpec(client, {
      ...base,
      code: uniqueSlug('ric-spec-traceb'),
      decisionIds: [foreign.decisionId],
    })).rejects.toBeInstanceOf(ImplementationSpecTraceTargetNotFoundError)
  })

  it('lists every specification governing a task, newest version first', async () => {
    const { project, task } = await seedTask('spec-list')
    const code = uniqueSlug('ric-spec-list')
    await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code,
      version: '1.0.0',
      content: content(),
    })
    await reviseImplementationSpec(client, { projectId: project.id, code, version: '1.2.0', content: content() })
    await reviseImplementationSpec(client, { projectId: project.id, code, version: '10.0.0', content: content() })

    const specs = await listImplementationSpecsForTask(client, project.id, task.id)

    expect(specs.map(spec => spec.version)).toEqual(['10.0.0', '1.2.0', '1.0.0'])
  })
})

// ── Execution eligibility ─────────────────────────────────────────────────────

describe('execution eligibility', () => {
  it('reports MISSING for a task with no specification', async () => {
    const { project, task } = await seedTask('elig-missing')

    const outcome = await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.MISSING])
  })

  it('reports NOT_APPROVED for a task whose only specification is a draft', async () => {
    const { project, task } = await seedTask('elig-draft')
    await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-eligdraft'),
      version: '1.0.0',
      content: content(),
    })

    const outcome = await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)

    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.NOT_APPROVED])
  })

  it('is eligible once an approved specification traces to current strategic truth', async () => {
    const { project, task } = await seedTask('elig-ok')
    const truth = await seedStrategicTruth(project.id)
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-eligok'),
      version: '1.0.0',
      content: content(),
      requirementIds: [truth.requirementId],
      decisionIds: [truth.decisionId],
    })
    await approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })

    const outcome = await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)

    expect(outcome).toEqual({ eligible: true, rulesVersion: SPEC_LIFECYCLE_VERSION, findings: [] })
  })

  it('becomes stale when a traced requirement is superseded after approval', async () => {
    const { project, task } = await seedTask('elig-stale')
    const truth = await seedStrategicTruth(project.id)
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-eligstale'),
      version: '1.0.0',
      content: content(),
      requirementIds: [truth.requirementId],
    })
    await approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })

    // Set up the stale case directly rather than re-running an extraction:
    // what is under test is the eligibility rule, not how a requirement came
    // to be superseded.
    await client.requirement.update({ where: { id: truth.requirementId }, data: { status: 'SUPERSEDED' } })

    const outcome = await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings).toEqual([{
      reason: SpecEligibilityReason.STALE_STRATEGIC_TRUTH,
      message: 'linked requirement is SUPERSEDED',
      subjectId: truth.requirementId,
    }])
  })

  it('reports SUPERSEDED once the approved specification has been replaced and then retired again', async () => {
    const { project, task } = await seedTask('elig-superseded')
    const operatorId = await approverId()
    const code = uniqueSlug('ric-spec-eligsup')
    const first = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code,
      version: '1.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, { projectId: project.id, specId: first.id, approvedByOperatorId: operatorId })
    const second = await reviseImplementationSpec(client, {
      projectId: project.id,
      code,
      version: '2.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, {
      projectId: project.id,
      specId: second.id,
      approvedByOperatorId: operatorId,
      supersedesSpecId: first.id,
    })

    // The successor is now the authority, so the task is eligible again.
    expect((await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)).eligible).toBe(true)

    // Retire it without a replacement, which only a direct write can do —
    // the module always installs a successor in the same transaction.
    await client.implementationSpec.update({
      where: { id: second.id },
      data: { status: ImplementationSpecStatus.SUPERSEDED, supersededAt: new Date() },
    })

    const outcome = await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)
    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.SUPERSEDED])
  })

  it('reports INVALID_CONTENT when an approved specification body is corrupted underneath it', async () => {
    const { project, task } = await seedTask('elig-corrupt')
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug('ric-spec-eligcorrupt'),
      version: '1.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })

    // Only a writer bypassing this module can produce this state; the check
    // exists so a corrupted row blocks derivation instead of passing
    // silently.
    await client.implementationSpec.update({ where: { id: spec.id }, data: { acceptanceCriteriaJson: [] } })

    const outcome = await resolveImplementationSpecExecutionEligibility(client, project.id, task.id)

    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.INVALID_CONTENT])
  })

  it('keeps eligibility scoped to its own project', async () => {
    const [own, other] = await Promise.all([seedTask('elig-iso-a'), seedTask('elig-iso-b')])
    const spec = await createImplementationSpec(client, {
      projectId: other.project.id,
      taskId: other.task.id,
      code: uniqueSlug('ric-spec-eligiso'),
      version: '1.0.0',
      content: content(),
    })
    await approveImplementationSpec(client, {
      projectId: other.project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })

    const outcome = await resolveImplementationSpecExecutionEligibility(client, own.project.id, other.task.id)

    expect(outcome.findings.map(finding => finding.reason)).toEqual([SpecEligibilityReason.MISSING])
  })
})
