import { describe, expect, it } from 'vitest'
import {
  EXECUTION_CONTRACT_SCHEMA_VERSION,
  ExecutionContractStatus,
  ExecutionMode,
  parseExecutionContract,
  serializeExecutionContract,
} from './execution-contract.js'
import type { ExecutionContract, ExecutionContractValidation } from './execution-contract.js'

type ContractFixture = {
  [key: string]: unknown
  identity: {
    contractId: string
    contractVersion: string
    projectId: string
    sprintId: string
    taskIds: string[]
    createdAt: string
    createdBy: { kind: string, id: string }
    sourceSnapshotId: string
    contentHash: string | null
    status: string
    approvedImplementationSpec: {
      specId: string
      projectId: string
      lineageCode: string
      version: string
      approvedByOperatorId: string
      approvedAt: string
    }
  }
  sourceSnapshot: {
    [key: string]: unknown
    snapshotId: string
    requirements: { requirementId: string, projectId: string, code: string, status: string }[]
    decisions: { decisionId: string, projectId: string, code: string, status: string }[]
  }
  objectives: {
    [key: string]: unknown
    taskObjectives: { taskId: string, objective: string }[]
  }
}

function validContract(): ContractFixture {
  return {
    identity: {
      contractId: 'RIC-EC-NDERCC-37-001',
      contractVersion: EXECUTION_CONTRACT_SCHEMA_VERSION,
      projectId: 'project-rcc',
      sprintId: 'sprint-3',
      taskIds: ['NDERCC-37'],
      createdAt: '2026-09-02T10:00:00.000Z',
      createdBy: { kind: 'USER', id: 'operator-1' },
      sourceSnapshotId: 'snapshot-1',
      contentHash: null,
      status: ExecutionContractStatus.DRAFT,
      approvedImplementationSpec: {
        specId: 'spec-1',
        projectId: 'project-rcc',
        lineageCode: 'RIC-SPEC-NDERCC-37-001',
        version: '1.0.0',
        approvedByOperatorId: 'operator-1',
        approvedAt: '2026-09-02T09:00:00.000Z',
      },
    },
    sourceSnapshot: {
      snapshotId: 'snapshot-1',
      approvedDocuments: [],
      jiraIssues: [],
      repository: {
        repository: 'devricardo90/rick-control-center',
        defaultBranch: 'main',
        headSha: 'd1a82b121fa735e3a9c00c79824eeff0b04748cc',
        workingTreeCondition: 'clean',
      },
      requirements: [],
      decisions: [],
      exceptions: [],
      environmentProfile: {},
      agentVersions: [],
      skillVersions: [],
      protocolVersion: '1.0.0',
      riskEngineVersion: 'not-yet-implemented',
    },
    objectives: {
      productObjective: 'Execute only governed work.',
      phaseObjective: 'Establish the contract schema.',
      sprintObjective: 'Deliver the Execution Contract Engine foundation.',
      taskObjectives: [{ taskId: 'NDERCC-37', objective: 'Define the canonical schema.' }],
      nonGoals: ['Do not generate contracts.'],
    },
    scope: {
      allowed: {
        repositoryPaths: ['packages/domain/**'],
        filePatterns: ['*.ts'],
        services: [],
        databaseSchemas: [],
        jiraIssues: ['NDERCC-37'],
        commands: ['pnpm test'],
        integrations: [],
        documentationTargets: [],
      },
      denied: {
        repositoryPaths: [],
        filePatterns: [],
        services: [],
        databaseSchemas: [],
        jiraIssues: [],
        commands: [],
        integrations: [],
        documentationTargets: [],
      },
      dirtyWorktreePolicy: 'stop and report; never discard pre-existing work',
    },
    executionMode: ExecutionMode.SUPERVISED,
    agents: [],
    preconditions: [],
    workUnits: [],
    commandPolicy: {
      allowedClasses: ['READ_ONLY'],
      commandPatterns: ['pnpm test'],
      timeoutSeconds: 120,
      retryLimits: 0,
      workingDirectories: ['repository root'],
      environmentVariableReferences: [],
      outputCaptureRules: ['capture exit code and output'],
    },
    riskAssessment: { findings: [] },
    validations: [],
    evidenceRequirements: [],
    approvalGates: [],
    gitPolicy: {
      repository: 'devricardo90/rick-control-center',
      remote: 'origin',
      baseBranch: 'main',
      expectedBaseSha: 'd1a82b121fa735e3a9c00c79824eeff0b04748cc',
      executionBranchPattern: 'feat/*',
      branchCreationRequired: true,
      stagingRules: ['stage only authorized files'],
      allowedCommitPaths: ['packages/domain/**'],
      commitMessagePattern: 'feat: define canonical execution contract schema',
      signingRequired: false,
      pushTarget: 'origin/feat/NDERCC-37-canonical-execution-contract-schema',
      forcePushAllowed: false,
      pullRequestRequired: true,
      mergeStrategy: 'governed pull request',
    },
    jiraPolicy: {
      permittedIssueKeys: ['NDERCC-37'],
      permittedFields: ['status'],
      permittedComments: ['implementation evidence'],
      permittedTransitions: ['Em análise'],
    },
    retryPolicy: {
      commandMaxAttempts: 1,
      validationMaxAttempts: 1,
      integrationMaxAttempts: 0,
      workUnitMaxAttempts: 1,
      backoffSeconds: 0,
    },
    recoveryPolicy: {
      checkpointRequired: true,
      checkpointContents: ['branch', 'commit', 'validation evidence'],
      sourceCompatibilityChecks: ['verify baseline SHA'],
      resumeRules: ['resume only from a verified checkpoint'],
      rollbackRules: ['preserve evidence and stop'],
      cancellationRules: ['preserve local changes'],
    },
    completionPolicy: {
      requiredWorkUnitIds: [],
      requiredValidationIds: [],
      requiredEvidenceIds: [],
      requiredApprovalIds: [],
      requireGitOperations: true,
      requireJiraOperations: true,
      blockOnResidualRisk: true,
      finalSummaryRequired: true,
      auditRecordRequired: true,
    },
    signatures: [],
  }
}

function parsedFixture(): ExecutionContract {
  const parsed = parseExecutionContract(validContract())
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.value
}

/**
 * Splits a rejection into the path that failed and the invariant it broke.
 *
 * `parseExecutionContract` reports failures as `<path> <reason>` strings
 * rather than typed codes, matching the parse convention used throughout the
 * domain package. Asserting the path — and the reason keyword rather than the
 * full sentence — proves an invalid input was rejected by the *intended*
 * invariant instead of merely failing somewhere, without binding the test to
 * human-readable prose or to the membership of an enum.
 */
function rejection(result: ExecutionContractValidation<unknown>): { path: string, reason: string } {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected parseExecutionContract to reject the input')
  const separator = result.error.indexOf(' ')
  if (separator === -1) return { path: result.error, reason: '' }
  return { path: result.error.slice(0, separator), reason: result.error.slice(separator + 1) }
}

const CANONICAL_SECTIONS = [
  'identity', 'sourceSnapshot', 'objectives', 'scope', 'executionMode', 'agents', 'preconditions',
  'workUnits', 'commandPolicy', 'riskAssessment', 'validations', 'evidenceRequirements',
  'approvalGates', 'gitPolicy', 'jiraPolicy', 'retryPolicy', 'recoveryPolicy', 'completionPolicy',
  'signatures',
] as const

describe('canonical Execution Contract schema', () => {
  it('accepts the complete structural shape while leaving completeness to P0-042', () => {
    const parsed = parseExecutionContract(validContract())

    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.value.identity.projectId).toBe('project-rcc')
    expect(parsed.ok && parsed.value.identity.taskIds).toEqual(['NDERCC-37'])
    expect(parsed.ok && parsed.value.workUnits).toEqual([])
    expect(parsed.ok && parsed.value.validations).toEqual([])
  })

  it.each(CANONICAL_SECTIONS)('requires the canonical top-level section %s', (section) => {
    const incomplete = Object.fromEntries(
      Object.entries(validContract()).filter(([key]) => key !== section),
    )

    // Each section must be rejected by its own presence check, so a missing
    // section can never be masked by an unrelated failure elsewhere.
    const failure = rejection(parseExecutionContract(incomplete))
    expect(failure.path).toBe(`contract.${section}`)
    expect(failure.reason).toBe('is required')
  })

  it('rejects null and unknown enum values in required fields', () => {
    const nullMode = validContract()
    nullMode.executionMode = null
    const modeFailure = rejection(parseExecutionContract(nullMode))
    expect(modeFailure.path).toBe('contract.executionMode')
    expect(modeFailure.reason).toContain('must be one of')

    const unknownStatus = validContract()
    unknownStatus.identity.status = 'ISSUED'
    const statusFailure = rejection(parseExecutionContract(unknownStatus))
    expect(statusFailure.path).toBe('contract.identity.status')
    expect(statusFailure.reason).toContain('must be one of')
  })

  it('requires an approved ImplementationSpec reference', () => {
    const input = validContract()
    delete (input.identity as Record<string, unknown>).approvedImplementationSpec

    const failure = rejection(parseExecutionContract(input))
    expect(failure.path).toBe('contract.identity.approvedImplementationSpec')
    expect(failure.reason).toBe('is required')
  })

  it('rejects cross-project approved-spec and source trace references', () => {
    const specFromAnotherProject = validContract()
    specFromAnotherProject.identity.approvedImplementationSpec.projectId = 'other-project'
    const specFailure = rejection(parseExecutionContract(specFromAnotherProject))
    expect(specFailure.path).toBe('contract.identity.approvedImplementationSpec.projectId')
    expect(specFailure.reason).toBe('must equal contract.identity.projectId')

    const requirementFromAnotherProject = validContract()
    requirementFromAnotherProject.sourceSnapshot.requirements.push({
      requirementId: 'requirement-1',
      projectId: 'other-project',
      code: 'REQ-1',
      status: 'ACTIVE',
    })
    const requirementFailure = rejection(parseExecutionContract(requirementFromAnotherProject))
    expect(requirementFailure.path).toBe('contract.sourceSnapshot.requirements')
    expect(requirementFailure.reason).toBe('must belong to contract.identity.projectId')
  })

  it('requires objective task references to belong to the contract task set', () => {
    const input = validContract()
    const [objective] = input.objectives.taskObjectives
    if (!objective) throw new Error('fixture must contain a task objective')
    objective.taskId = 'NDERCC-999'

    const failure = rejection(parseExecutionContract(input))
    expect(failure.path).toBe('contract.objectives.taskObjectives')
    expect(failure.reason).toBe('must reference contract.identity.taskIds')
  })

  it('serializes the same structure deterministically regardless of object insertion order', () => {
    const contract = parsedFixture()
    const input = validContract()
    const reordered = {
      ...input,
      identity: Object.fromEntries(Object.entries(input.identity).reverse()),
      sourceSnapshot: Object.fromEntries(Object.entries(input.sourceSnapshot).reverse()),
    } as unknown as ContractFixture
    const reorderedParsed = parseExecutionContract(reordered)

    expect(reorderedParsed.ok).toBe(true)
    expect(reorderedParsed.ok && serializeExecutionContract(reorderedParsed.value)).toBe(serializeExecutionContract(contract))
  })

  it('preserves ordered task identity as part of the structural representation', () => {
    const contract = parsedFixture()
    const second = validContract()
    second.identity.taskIds.push('NDERCC-38')
    second.objectives.taskObjectives.push({ taskId: 'NDERCC-38', objective: 'A second unit.' })
    const secondParsed = parseExecutionContract(second)

    expect(secondParsed.ok).toBe(true)
    expect(secondParsed.ok && serializeExecutionContract(secondParsed.value)).not.toBe(serializeExecutionContract(contract))
  })
})
