/**
 * P0-041 — generate a canonical Execution Contract from an eligible
 * Implementation Spec.
 *
 * ## What this module derives, and what it refuses to invent
 *
 * An Implementation Spec is prose: statements of scope, non-goals, acceptance
 * criteria and validation strategy. An Execution Contract is an operational
 * authority document carrying repository SHAs, command policy, git policy and
 * risk findings. Most contract sections therefore have **no source** in a
 * specification, and inventing them would be exactly the "hidden inference"
 * that makes a generated contract untrustworthy.
 *
 * So this generator splits its input in two, and the split is the point:
 *
 *   - **Derived** — computed deterministically from the specification:
 *     objectives, non-goals, the approved-specification identity reference, the
 *     strategic-truth references, and one evidence requirement per acceptance
 *     criterion.
 *   - **Supplied** — everything the specification cannot know: repository
 *     facts, scope paths, command/git/jira policy, retry, recovery, completion.
 *     These are *required* inputs. There are no defaults, because a default
 *     here would be a fabricated authority.
 *
 * Nothing is read from Git, the network, an LLM, or the environment. The same
 * input produces the same contract.
 *
 * ## Scope boundary
 *
 * P0-041 is generation only. Completeness evaluation (P0-042) and contract
 * hashing/versioning (P0-043) are deliberately absent: `contentHash` is emitted
 * as `null`, which is the schema's own "not yet sealed" value. The structural
 * check performed here is `parseExecutionContract` — the existing P0-040
 * schema — so generation cannot emit a contract the canonical parser rejects.
 * That is conformance to an existing schema, not a completeness gate.
 */
import type {
  ExecutionActorKind,
  ExecutionContract,
  ExecutionContractStatus,
  ExecutionMode,
  ExecutionScope,
  ExecutionCommandPolicy,
  ExecutionCompletionPolicy,
  ExecutionEvidenceRequirement,
  ExecutionGitPolicy,
  ExecutionJiraPolicy,
  ExecutionRecoveryPolicy,
  ExecutionRetryPolicy,
  ExecutionRiskAssessment,
  ExecutionSourceSnapshot,
  SourceDecisionReference,
  SourceRequirementReference,
} from './execution-contract.js'
import { EXECUTION_CONTRACT_SCHEMA_VERSION, parseExecutionContract } from './execution-contract.js'
import type { ImplementationSpecContent, SpecEligibilityOutcome } from './implementation-spec.js'

export const EXECUTION_CONTRACT_GENERATOR_VERSION = 'P0_041_V1' as const

/** Why generation refused. Mirrors the fail-closed convention used by the specification lifecycle. */
export const ContractGenerationRefusal = {
  /** The specification is not execution-eligible. Carries the eligibility findings verbatim. */
  SPEC_NOT_ELIGIBLE: 'SPEC_NOT_ELIGIBLE',
  /** The assembled contract did not satisfy the canonical P0-040 schema. */
  SCHEMA_INVALID: 'SCHEMA_INVALID',
} as const
export type ContractGenerationRefusal = typeof ContractGenerationRefusal[keyof typeof ContractGenerationRefusal]

export interface ContractGenerationFailure {
  readonly refusal: ContractGenerationRefusal
  readonly message: string
  /** Present when the refusal is SPEC_NOT_ELIGIBLE — the reasons, unmodified. */
  readonly eligibility?: SpecEligibilityOutcome
}

export type ContractGenerationResult =
  | { readonly ok: true, readonly contract: ExecutionContract }
  | { readonly ok: false, readonly failure: ContractGenerationFailure }

/** The approved specification being derived from. `content` is the already-parsed body. */
export interface GenerationSpecInput {
  readonly specId: string
  readonly projectId: string
  readonly lineageCode: string
  readonly version: string
  readonly approvedByOperatorId: string
  readonly approvedAt: string
  readonly content: ImplementationSpecContent
}

/** Contract identity the caller assigns. Not derivable from a specification. */
export interface GenerationIdentityInput {
  readonly contractId: string
  readonly sprintId: string
  readonly taskId: string
  readonly createdAt: string
  readonly createdByKind: ExecutionActorKind
  readonly createdById: string
  readonly status: ExecutionContractStatus
}

/**
 * Operational facts and policy the specification cannot know. Every field is
 * required: a missing value must be a caller error, never a silent default.
 */
export interface GenerationEnvironmentInput {
  readonly executionMode: ExecutionMode
  readonly sourceSnapshot: Omit<ExecutionSourceSnapshot, 'requirements' | 'decisions'>
  readonly scope: ExecutionScope
  readonly commandPolicy: ExecutionCommandPolicy
  readonly riskAssessment: ExecutionRiskAssessment
  readonly gitPolicy: ExecutionGitPolicy
  readonly jiraPolicy: ExecutionJiraPolicy
  readonly retryPolicy: ExecutionRetryPolicy
  readonly recoveryPolicy: ExecutionRecoveryPolicy
  readonly completionPolicy: ExecutionCompletionPolicy
}

/** Strategic truth the specification is traced to, resolved by the caller from the link tables. */
export interface GenerationTraceabilityInput {
  readonly requirements: readonly SourceRequirementReference[]
  readonly decisions: readonly SourceDecisionReference[]
}

export interface ExecutionContractGenerationInput {
  /**
   * The authoritative eligibility decision. The generator consults this rather
   * than recomputing it, so exactly one eligibility implementation exists in
   * the system and generation can never disagree with the gate.
   */
  readonly eligibility: SpecEligibilityOutcome
  readonly spec: GenerationSpecInput
  readonly identity: GenerationIdentityInput
  readonly traceability: GenerationTraceabilityInput
  readonly environment: GenerationEnvironmentInput
}

/** Stable evidence identity: acceptance criterion N of this specification lineage. */
function evidenceIdFor(lineageCode: string, index: number): string {
  return `${lineageCode}-AC-${String(index + 1).padStart(3, '0')}`
}

/**
 * One evidence requirement per acceptance criterion.
 *
 * This is the one place the specification's own content becomes an executable
 * obligation: RIC-E07A requires *verifiable* criteria, so every criterion the
 * specification declares becomes evidence the execution must produce. Order
 * follows the specification body, so the mapping is stable across runs.
 */
function deriveEvidenceRequirements(spec: GenerationSpecInput): ExecutionEvidenceRequirement[] {
  return spec.content.acceptanceCriteria.map((_criterion, index) => ({
    evidenceId: evidenceIdFor(spec.lineageCode, index),
    kind: 'ACCEPTANCE_CRITERION',
    required: true,
    producer: 'execution',
    relatedWorkUnitId: null,
    relatedValidationId: null,
  }))
}

function deriveObjectives(spec: GenerationSpecInput, taskId: string): ExecutionContract['objectives'] {
  return {
    productObjective: spec.content.title,
    phaseObjective: spec.content.behavior,
    sprintObjective: spec.content.title,
    taskObjectives: [{ taskId, objective: spec.content.behavior }],
    nonGoals: spec.content.nonGoals,
  }
}

/**
 * Completion requires every derived evidence id, on top of whatever the caller
 * already requires. Without this an execution could complete while leaving an
 * acceptance criterion unevidenced — the same vacuous-coverage failure GAP-03
 * closed on the eligibility side, one layer further on.
 */
function mergeCompletionPolicy(
  supplied: ExecutionCompletionPolicy,
  evidenceIds: readonly string[],
): ExecutionCompletionPolicy {
  const required = [...new Set([...supplied.requiredEvidenceIds, ...evidenceIds])]
  return { ...supplied, requiredEvidenceIds: required }
}

function assemble(input: ExecutionContractGenerationInput): unknown {
  const { spec, identity, environment, traceability } = input
  const evidenceRequirements = deriveEvidenceRequirements(spec)
  const evidenceIds = evidenceRequirements.map(requirement => requirement.evidenceId)

  return {
    identity: {
      contractId: identity.contractId,
      contractVersion: EXECUTION_CONTRACT_SCHEMA_VERSION,
      projectId: spec.projectId,
      sprintId: identity.sprintId,
      taskIds: [identity.taskId],
      createdAt: identity.createdAt,
      createdBy: { kind: identity.createdByKind, id: identity.createdById },
      sourceSnapshotId: environment.sourceSnapshot.snapshotId,
      // P0-043 owns sealing. `null` is the schema's own "not yet hashed" value.
      contentHash: null,
      status: identity.status,
      approvedImplementationSpec: {
        specId: spec.specId,
        projectId: spec.projectId,
        lineageCode: spec.lineageCode,
        version: spec.version,
        approvedByOperatorId: spec.approvedByOperatorId,
        approvedAt: spec.approvedAt,
      },
    },
    sourceSnapshot: {
      ...environment.sourceSnapshot,
      requirements: traceability.requirements,
      decisions: traceability.decisions,
    },
    objectives: deriveObjectives(spec, identity.taskId),
    scope: environment.scope,
    executionMode: environment.executionMode,
    // Agent assignment, work-unit decomposition, preconditions, validations,
    // approval gates and signatures are later-stage concerns. Empty is the
    // schema's representation of "none declared", not a fabricated value.
    agents: [],
    preconditions: [],
    workUnits: [],
    commandPolicy: environment.commandPolicy,
    riskAssessment: environment.riskAssessment,
    validations: [],
    evidenceRequirements,
    approvalGates: [],
    gitPolicy: environment.gitPolicy,
    jiraPolicy: environment.jiraPolicy,
    retryPolicy: environment.retryPolicy,
    recoveryPolicy: environment.recoveryPolicy,
    completionPolicy: mergeCompletionPolicy(environment.completionPolicy, evidenceIds),
    signatures: [],
  }
}

/**
 * Generates a canonical Execution Contract from an eligible Implementation Spec.
 *
 * Fail-closed twice over: it refuses when the supplied eligibility decision is
 * negative, and again when the assembled document does not satisfy the
 * canonical P0-040 parser. It never mutates its input, performs no I/O, and
 * consults no clock or random source — `createdAt` is supplied, not read.
 */
export function generateExecutionContract(
  input: ExecutionContractGenerationInput,
): ContractGenerationResult {
  if (!input.eligibility.eligible) {
    return {
      ok: false,
      failure: {
        refusal: ContractGenerationRefusal.SPEC_NOT_ELIGIBLE,
        message: 'the implementation specification is not execution-eligible',
        eligibility: input.eligibility,
      },
    }
  }

  const parsed = parseExecutionContract(assemble(input))

  if (!parsed.ok) {
    return {
      ok: false,
      failure: { refusal: ContractGenerationRefusal.SCHEMA_INVALID, message: parsed.error },
    }
  }

  return { ok: true, contract: parsed.value }
}
