/**
 * P0-041 generation tests, and the GAP-03 regression that motivated them.
 *
 * GAP-03: the RCC × LionClaw audit found that a specification with zero
 * traceability reached `eligible: true`, because staleness is a per-link
 * predicate and a predicate over an empty set reports nothing wrong. The
 * generator consumes that decision, so an unfixed gate would have let an
 * untraceable specification produce a real Execution Contract.
 */
import { describe, expect, it } from 'vitest'
import {
  ContractGenerationRefusal,
  generateExecutionContract,
} from './execution-contract-generation.js'
import type {
  ExecutionContractGenerationInput,
  GenerationEnvironmentInput,
} from './execution-contract-generation.js'
import {
  ExecutionContractStatus,
  ExecutionMode,
  EXECUTION_CONTRACT_SCHEMA_VERSION,
} from './execution-contract.js'
import {
  evaluateSpecExecutionEligibility,
  ImplementationSpecStatus,
  SpecEligibilityReason,
} from './implementation-spec.js'
import type { ImplementationSpecContent } from './implementation-spec.js'
import { DecisionStatus, RequirementStatus } from './strategic-truth.js'

const CONTENT: ImplementationSpecContent = {
  title: 'Generate execution contracts',
  behavior: 'Derive a canonical Execution Contract from an approved specification.',
  scope: ['generation only'],
  nonGoals: ['no hashing', 'no completeness evaluation'],
  acceptanceCriteria: ['refuses an ineligible spec', 'emits a schema-valid contract'],
  constraints: [],
  dependencies: [],
  risks: [],
  interfaces: [],
  validationStrategy: [],
}

function environment(): GenerationEnvironmentInput {
  return {
    executionMode: ExecutionMode.SUPERVISED,
    sourceSnapshot: {
      snapshotId: 'snapshot-1',
      approvedDocuments: [],
      jiraIssues: [],
      repository: {
        repository: 'devricardo90/rick-control-center',
        defaultBranch: 'main',
        headSha: '14f21057589bbf90b6903c6e0a65cee86ec94a42',
        workingTreeCondition: 'clean',
      },
      exceptions: [],
      environmentProfile: {},
      agentVersions: [],
      skillVersions: [],
      protocolVersion: '1.0.0',
      riskEngineVersion: 'not-yet-implemented',
    },
    scope: {
      allowed: {
        repositoryPaths: ['packages/domain/**'],
        filePatterns: ['*.ts'],
        services: [],
        databaseSchemas: [],
        jiraIssues: ['NDERCC-38'],
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
    gitPolicy: {
      repository: 'devricardo90/rick-control-center',
      remote: 'origin',
      baseBranch: 'main',
      expectedBaseSha: '14f21057589bbf90b6903c6e0a65cee86ec94a42',
      executionBranchPattern: 'feat/*',
      branchCreationRequired: true,
      stagingRules: ['stage only authorized files'],
      allowedCommitPaths: ['packages/domain/**'],
      commitMessagePattern: 'feat(execution): generate execution contract',
      signingRequired: false,
      pushTarget: 'origin/feat/NDERCC-38-generate-execution-contract',
      forcePushAllowed: false,
      pullRequestRequired: true,
      mergeStrategy: 'governed pull request',
    },
    jiraPolicy: {
      permittedIssueKeys: ['NDERCC-38'],
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
      checkpointContents: ['branch', 'commit'],
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
  }
}

/** An eligibility outcome computed by the canonical evaluator, never hand-built. */
function eligibilityWith(requirementCount: number) {
  return evaluateSpecExecutionEligibility({
    spec: { status: ImplementationSpecStatus.APPROVED, contentValid: true },
    linkedRequirements: Array.from({ length: requirementCount }, (_unused, index) => ({
      id: `requirement-${String(index)}`,
      status: RequirementStatus.ACTIVE,
    })),
    linkedDecisions: [],
  })
}

function generationInput(requirementCount = 1): ExecutionContractGenerationInput {
  return {
    eligibility: eligibilityWith(requirementCount),
    spec: {
      specId: 'spec-1',
      projectId: 'project-rcc',
      lineageCode: 'RIC-SPEC-NDERCC-38-001',
      version: '1.0.0',
      approvedByOperatorId: 'operator-1',
      approvedAt: '2026-09-07T09:00:00.000Z',
      content: CONTENT,
    },
    identity: {
      contractId: 'RIC-EC-NDERCC-38-001',
      sprintId: 'sprint-3',
      taskId: 'NDERCC-38',
      createdAt: '2026-09-07T10:00:00.000Z',
      createdByKind: 'USER',
      createdById: 'operator-1',
      status: ExecutionContractStatus.DRAFT,
    },
    traceability: {
      requirements: [{ requirementId: 'requirement-0', projectId: 'project-rcc', code: 'REQ-1', status: 'ACTIVE' }],
      decisions: [],
    },
    environment: environment(),
  }
}

// ── GAP-03 ────────────────────────────────────────────────────────────────────

describe('GAP-03: traceability coverage is proven, never assumed', () => {
  it('rejects a specification with zero traceability links', () => {
    const outcome = eligibilityWith(0)

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings.map(finding => finding.reason))
      .toContain(SpecEligibilityReason.MISSING_TRACEABILITY)
  })

  it('does not let an otherwise-perfect specification pass vacuously', () => {
    // APPROVED, content valid, no stale links — every per-link predicate is
    // satisfied precisely because there are no links. This is the exact shape
    // the audit found reaching `eligible: true`.
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status: ImplementationSpecStatus.APPROVED, contentValid: true },
      linkedRequirements: [],
      linkedDecisions: [],
    })

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings).toHaveLength(1)
    expect(outcome.findings[0]?.reason).toBe(SpecEligibilityReason.MISSING_TRACEABILITY)
  })

  it('accepts a specification traced to at least one active requirement', () => {
    const outcome = eligibilityWith(1)

    expect(outcome.eligible).toBe(true)
    expect(outcome.findings).toHaveLength(0)
  })

  it('does not require a decision link, because a decision is a constraint and not a precondition', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status: ImplementationSpecStatus.APPROVED, contentValid: true },
      linkedRequirements: [{ id: 'requirement-0', status: RequirementStatus.ACTIVE }],
      linkedDecisions: [],
    })

    expect(outcome.eligible).toBe(true)
  })

  it('still reports staleness when links exist but have moved on', () => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status: ImplementationSpecStatus.APPROVED, contentValid: true },
      linkedRequirements: [{ id: 'requirement-0', status: RequirementStatus.SUPERSEDED }],
      linkedDecisions: [{ id: 'decision-0', status: DecisionStatus.REJECTED }],
    })

    expect(outcome.eligible).toBe(false)
    const reasons = outcome.findings.map(finding => finding.reason)
    expect(reasons).toContain(SpecEligibilityReason.STALE_STRATEGIC_TRUTH)
    expect(reasons).not.toContain(SpecEligibilityReason.MISSING_TRACEABILITY)
  })

  it.each([
    ['draft', ImplementationSpecStatus.DRAFT, true],
    ['rejected', ImplementationSpecStatus.REJECTED, true],
    ['superseded', ImplementationSpecStatus.SUPERSEDED, true],
  ])('reports both lifecycle and traceability for an unlinked %s specification', (_label, status, _unused) => {
    const outcome = evaluateSpecExecutionEligibility({
      spec: { status, contentValid: true },
      linkedRequirements: [],
      linkedDecisions: [],
    })

    expect(outcome.eligible).toBe(false)
    expect(outcome.findings.map(finding => finding.reason))
      .toContain(SpecEligibilityReason.MISSING_TRACEABILITY)
  })
})

// ── P0-041 generation ─────────────────────────────────────────────────────────

describe('P0-041 generation refuses unless the specification is eligible', () => {
  it('refuses when eligibility is negative, carrying the reasons unmodified', () => {
    const result = generateExecutionContract({ ...generationInput(), eligibility: eligibilityWith(0) })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.SPEC_NOT_ELIGIBLE)
    expect(result.failure.eligibility?.findings.map(finding => finding.reason))
      .toContain(SpecEligibilityReason.MISSING_TRACEABILITY)
  })

  it('a zero-traceability specification cannot produce a contract', () => {
    const result = generateExecutionContract({ ...generationInput(), eligibility: eligibilityWith(0) })

    expect(result.ok).toBe(false)
    expect('contract' in result).toBe(false)
  })

  it('refuses a schema-invalid assembly rather than emitting it', () => {
    const input = generationInput()
    const result = generateExecutionContract({
      ...input,
      identity: { ...input.identity, contractId: '' },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.SCHEMA_INVALID)
  })
})

describe('traceability coherence is enforced at the generation boundary (PR #24 P1)', () => {
  it('refuses a genuine positive eligibility paired with empty requirements', () => {
    // The outcome is computed by the canonical evaluator and is legitimately
    // positive. Nothing is forged. The traceability handed over alongside it
    // simply is not the traceability it was computed from.
    const result = generateExecutionContract({
      ...generationInput(),
      traceability: { requirements: [], decisions: [] },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.INCOHERENT_TRACEABILITY)
    expect(result.failure.message).toContain('at least one traced requirement')
  })

  it('accepts a genuine positive eligibility with coherent non-empty requirements', () => {
    const result = generateExecutionContract(generationInput())

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.sourceSnapshot.requirements).toHaveLength(1)
  })

  it('refuses a traced requirement belonging to another project', () => {
    const input = generationInput()
    const result = generateExecutionContract({
      ...input,
      traceability: {
        requirements: [{ requirementId: 'req-foreign', projectId: 'project-other', code: 'REQ-X', status: 'ACTIVE' }],
        decisions: [],
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.INCOHERENT_TRACEABILITY)
    expect(result.failure.message).toContain('project-other')
  })

  it.each([
    ['SUPERSEDED', 'SUPERSEDED'],
    ['DRAFT', 'DRAFT'],
  ])('refuses a traced requirement that is %s, which a positive outcome excludes', (_label, status) => {
    const input = generationInput()
    const result = generateExecutionContract({
      ...input,
      traceability: {
        requirements: [{ requirementId: 'requirement-0', projectId: 'project-rcc', code: 'REQ-1', status }],
        decisions: [],
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.INCOHERENT_TRACEABILITY)
  })

  it('refuses a traced decision that is not APPROVED', () => {
    const input = generationInput()
    const result = generateExecutionContract({
      ...input,
      traceability: {
        requirements: input.traceability.requirements,
        decisions: [{ decisionId: 'dec-1', projectId: 'project-rcc', code: 'DEC-1', status: 'REJECTED' }],
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.INCOHERENT_TRACEABILITY)
  })

  it('accepts a coherent APPROVED decision alongside the requirement', () => {
    const input = generationInput()
    const result = generateExecutionContract({
      ...input,
      traceability: {
        requirements: input.traceability.requirements,
        decisions: [{ decisionId: 'dec-1', projectId: 'project-rcc', code: 'DEC-1', status: 'APPROVED' }],
      },
    })

    expect(result.ok).toBe(true)
  })

  it('does not mutate the source inputs while rejecting an incoherent pair', () => {
    const input = { ...generationInput(), traceability: { requirements: [], decisions: [] } }
    const snapshot = structuredClone(input)

    generateExecutionContract(input)

    expect(input).toEqual(snapshot)
  })

  it('checks eligibility before coherence, so an ineligible spec reports the eligibility reason', () => {
    const result = generateExecutionContract({
      ...generationInput(),
      eligibility: eligibilityWith(0),
      traceability: { requirements: [], decisions: [] },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected refusal')
    expect(result.failure.refusal).toBe(ContractGenerationRefusal.SPEC_NOT_ELIGIBLE)
  })
})

describe('P0-041 generation output', () => {
  it('generates a contract conforming to the canonical P0-040 schema', () => {
    const result = generateExecutionContract(generationInput())

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.identity.contractVersion).toBe(EXECUTION_CONTRACT_SCHEMA_VERSION)
  })

  it('maps the approved specification identity onto the contract', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.identity.approvedImplementationSpec).toEqual({
      specId: 'spec-1',
      projectId: 'project-rcc',
      lineageCode: 'RIC-SPEC-NDERCC-38-001',
      version: '1.0.0',
      approvedByOperatorId: 'operator-1',
      approvedAt: '2026-09-07T09:00:00.000Z',
    })
  })

  it('carries the traced strategic truth into the source snapshot', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.sourceSnapshot.requirements).toHaveLength(1)
    expect(result.contract.sourceSnapshot.requirements[0]?.requirementId).toBe('requirement-0')
  })

  it('derives non-goals and objectives from the specification body', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.objectives.nonGoals).toEqual(CONTENT.nonGoals)
    expect(result.contract.objectives.taskObjectives).toEqual([
      { taskId: 'NDERCC-38', objective: CONTENT.behavior },
    ])
  })

  it('derives one evidence requirement per acceptance criterion', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.evidenceRequirements.map(requirement => requirement.evidenceId)).toEqual([
      'RIC-SPEC-NDERCC-38-001-AC-001',
      'RIC-SPEC-NDERCC-38-001-AC-002',
    ])
    expect(result.contract.evidenceRequirements.every(requirement => requirement.required)).toBe(true)
  })

  it('requires every derived evidence id for completion', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.completionPolicy.requiredEvidenceIds).toEqual([
      'RIC-SPEC-NDERCC-38-001-AC-001',
      'RIC-SPEC-NDERCC-38-001-AC-002',
    ])
  })

  it('leaves contentHash null, because sealing belongs to P0-043', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.identity.contentHash).toBeNull()
  })

  it('is deterministic: identical input yields an identical contract', () => {
    const first = generateExecutionContract(generationInput())
    const second = generateExecutionContract(generationInput())

    expect(first).toEqual(second)
  })

  it('does not mutate the source specification input', () => {
    const input = generationInput()
    const snapshot = structuredClone(input)

    generateExecutionContract(input)

    expect(input).toEqual(snapshot)
  })

  it('emits no work units, validations, approval gates or signatures — those are later stages', () => {
    const result = generateExecutionContract(generationInput())

    if (!result.ok) throw new Error(result.failure.message)
    expect(result.contract.workUnits).toEqual([])
    expect(result.contract.validations).toEqual([])
    expect(result.contract.approvalGates).toEqual([])
    expect(result.contract.signatures).toEqual([])
  })
})
