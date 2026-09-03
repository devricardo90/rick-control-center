/**
 * Persistence tests for the P0-040 Execution Contract schema.
 *
 * These tests intentionally write a complete row directly through Prisma: the
 * task is to prove the relational shape and database invariants, not to add a
 * contract constructor or generation workflow. P0-041 owns that flow.
 */
import type { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { approveImplementationSpec, createImplementationSpec } from './implementation-spec.js'
import { getPrimaryOperator, upsertPrimaryOperator } from './operator.js'
import { createProject } from './project.js'
import { createSprint } from './sprint.js'
import { createTask } from './task.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client: PrismaClient = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

async function approverId(): Promise<string> {
  const existing = await getPrimaryOperator(client)
  if (existing) return existing.id

  const created = await upsertPrimaryOperator(client, {
    username: uniqueSlug('contract-approver'),
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder',
  })
  return created.id
}

async function seedContractInputs(prefix: string) {
  const project = await createProject(client, { key: uniqueSlug(prefix), name: `${prefix} project` })
  const sprint = await createSprint(client, {
    projectId: project.id,
    code: uniqueSlug('sprint'),
    title: 'Contract schema sprint',
    sequence: 0,
  })
  const task = await createTask(client, {
    projectId: project.id,
    sprintId: sprint.id,
    code: uniqueSlug('task'),
    type: 'TASK',
    title: 'Contract schema task',
    priority: 'P0',
    sequence: 0,
  })
  const operatorId = await approverId()
  const spec = await createImplementationSpec(client, {
    projectId: project.id,
    taskId: task.id,
    code: uniqueSlug('spec'),
    version: '1.0.0',
    content: {
      title: 'Approved contract authority',
      behavior: 'An approved specification is the authority referenced by a contract.',
      scope: ['the seeded task'],
      nonGoals: ['contract generation'],
      acceptanceCriteria: ['the authority reference remains project-scoped'],
      constraints: [],
      dependencies: [],
      risks: [],
      interfaces: [],
      validationStrategy: [],
    },
  })
  const approvedSpec = await approveImplementationSpec(client, {
    projectId: project.id,
    specId: spec.id,
    approvedByOperatorId: operatorId,
  })

  return { project, sprint, task, approvedSpec }
}

function contractData(input: Awaited<ReturnType<typeof seedContractInputs>>) {
  return {
    projectId: input.project.id,
    sprintId: input.sprint.id,
    contractVersion: '1.0.0',
    status: 'DRAFT' as const,
    executionMode: 'SUPERVISED' as const,
    sourceSnapshotId: uniqueSlug('snapshot'),
    contentHash: null,
    approvedImplementationSpecId: input.approvedSpec.id,
    createdByKind: 'USER' as const,
    createdById: 'operator-test',
    sourceSnapshotJson: { snapshotId: 'snapshot' },
    objectivesJson: { taskObjectives: [{ taskId: input.task.id, objective: 'Define the schema.' }] },
    scopeJson: { allowed: {}, denied: {}, dirtyWorktreePolicy: 'stop' },
    agentsJson: [],
    preconditionsJson: [],
    workUnitsJson: [],
    commandPolicyJson: { allowedClasses: ['READ_ONLY'] },
    riskAssessmentJson: { findings: [] },
    validationsJson: [],
    evidenceRequirementsJson: [],
    approvalGatesJson: [],
    gitPolicyJson: { pullRequestRequired: true },
    jiraPolicyJson: { permittedIssueKeys: ['NDERCC-37'] },
    retryPolicyJson: { commandMaxAttempts: 1 },
    recoveryPolicyJson: { checkpointRequired: true },
    completionPolicyJson: { auditRecordRequired: true },
    signaturesJson: [],
  }
}

describe('Execution Contract persistence schema', { timeout: 30_000 }, () => {
  it('persists relational identity, approved-spec authority and ordered task membership', async () => {
    const input = await seedContractInputs('contract-shape')
    const contract = await client.executionContract.create({ data: contractData(input) })
    await client.executionContractTask.create({
      data: {
        executionContractId: contract.id,
        projectId: input.project.id,
        sprintId: input.sprint.id,
        taskId: input.task.id,
        position: 0,
      },
    })

    const stored = await client.executionContract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        approvedImplementationSpec: true,
        tasks: { orderBy: { position: 'asc' }, include: { task: true } },
      },
    })

    expect(stored).toMatchObject({
      projectId: input.project.id,
      sprintId: input.sprint.id,
      contractVersion: '1.0.0',
      status: 'DRAFT',
      approvedImplementationSpec: {
        id: input.approvedSpec.id,
        projectId: input.project.id,
        version: '1.0.0',
        status: 'APPROVED',
      },
    })
    expect(stored.tasks.map(task => task.taskId)).toEqual([input.task.id])
    expect(stored.tasks.map(task => task.position)).toEqual([0])
  })

  it('rejects a contract whose approved specification belongs to another project', async () => {
    const own = await seedContractInputs('contract-own')
    const other = await seedContractInputs('contract-other')

    await expect(client.executionContract.create({
      data: { ...contractData(own), approvedImplementationSpecId: other.approvedSpec.id },
    })).rejects.toThrow()
  })

  it('rejects cross-project task membership through the composite contract FK', async () => {
    const own = await seedContractInputs('contract-membership-own')
    const other = await seedContractInputs('contract-membership-other')
    const contract = await client.executionContract.create({ data: contractData(own) })

    await expect(client.executionContractTask.create({
      data: {
        executionContractId: contract.id,
        projectId: other.project.id,
        sprintId: other.sprint.id,
        taskId: other.task.id,
        position: 0,
      },
    })).rejects.toThrow()
  })

  it('enforces one ordered membership per position and non-negative positions', async () => {
    const input = await seedContractInputs('contract-position')
    const secondTask = await createTask(client, {
      projectId: input.project.id,
      sprintId: input.sprint.id,
      code: uniqueSlug('second-task'),
      type: 'TASK',
      title: 'Second contract task',
      priority: 'P0',
      sequence: 1,
    })
    const contract = await client.executionContract.create({ data: contractData(input) })

    await client.executionContractTask.create({
      data: {
        executionContractId: contract.id,
        projectId: input.project.id,
        sprintId: input.sprint.id,
        taskId: input.task.id,
        position: 0,
      },
    })

    await expect(client.executionContractTask.create({
      data: {
        executionContractId: contract.id,
        projectId: input.project.id,
        sprintId: input.sprint.id,
        taskId: secondTask.id,
        position: 0,
      },
    })).rejects.toThrow()

    await expect(client.executionContractTask.create({
      data: {
        executionContractId: contract.id,
        projectId: input.project.id,
        sprintId: input.sprint.id,
        taskId: secondTask.id,
        position: -1,
      },
    })).rejects.toThrow()
  })
})
