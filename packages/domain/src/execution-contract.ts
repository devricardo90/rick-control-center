/**
 * Canonical Execution Contract shape (RIC-011 / RIC-E06 / P0-040).
 *
 * This module owns the contract's vocabulary and structural invariants. It
 * deliberately does not generate a contract, decide whether one is complete,
 * calculate a digest, or implement a lifecycle state machine. Those are
 * P0-041, P0-042 and P0-043 (and later kernel work).
 *
 * The contract references an approved ImplementationSpec; it does not copy
 * the specification body. The approved specification remains the authority
 * for expected behaviour, scope, acceptance criteria and its traceability.
 */
import { err, ok } from '@rick/shared'
import type { Result } from '@rick/shared'

export const ExecutionContractStatus = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  SUPERSEDED: 'SUPERSEDED',
} as const
export type ExecutionContractStatus = typeof ExecutionContractStatus[keyof typeof ExecutionContractStatus]

export const ExecutionMode = {
  SUPERVISED: 'SUPERVISED',
  CONTROLLED_AUTONOMOUS: 'CONTROLLED_AUTONOMOUS',
  DRY_RUN: 'DRY_RUN',
  RECOVERY: 'RECOVERY',
} as const
export type ExecutionMode = typeof ExecutionMode[keyof typeof ExecutionMode]

export const ExecutionCommandClass = {
  READ_ONLY: 'READ_ONLY',
  LOCAL_WRITE: 'LOCAL_WRITE',
  EXTERNAL_WRITE: 'EXTERNAL_WRITE',
  DESTRUCTIVE: 'DESTRUCTIVE',
} as const
export type ExecutionCommandClass = typeof ExecutionCommandClass[keyof typeof ExecutionCommandClass]

export const ExecutionActorKind = {
  USER: 'USER',
  SYSTEM: 'SYSTEM',
  AGENT: 'AGENT',
} as const
export type ExecutionActorKind = typeof ExecutionActorKind[keyof typeof ExecutionActorKind]

export const ExecutionAgentRole = {
  PRIMARY: 'PRIMARY',
  SPECIALIST: 'SPECIALIST',
} as const
export type ExecutionAgentRole = typeof ExecutionAgentRole[keyof typeof ExecutionAgentRole]

export const ExecutionPreconditionResult = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
  WAIVED: 'WAIVED',
} as const
export type ExecutionPreconditionResult = typeof ExecutionPreconditionResult[keyof typeof ExecutionPreconditionResult]

export const ExecutionRiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const
export type ExecutionRiskLevel = typeof ExecutionRiskLevel[keyof typeof ExecutionRiskLevel]

/** RIC-011 schema version represented by this P0-040 structural contract. */
export const EXECUTION_CONTRACT_SCHEMA_VERSION = '1.0.0'

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject

export interface ExecutionActorReference {
  readonly kind: ExecutionActorKind
  readonly id: string
}

export interface ApprovedImplementationSpecReference {
  /** Immutable persisted row identity. */
  readonly specId: string
  /** Owning project, repeated to make the authority boundary explicit. */
  readonly projectId: string
  /** Immutable `(projectId, code)` lineage identity from P1-038. */
  readonly lineageCode: string
  /** Exact approved version used by the contract. */
  readonly version: string
  /** Approval evidence inherited from the persisted specification row. */
  readonly approvedByOperatorId: string
  readonly approvedAt: string
}

export interface SourceDocumentReference {
  readonly documentId: string
  readonly revision: string
}

export interface SourceJiraReference {
  readonly issueKey: string
  readonly version: string
  readonly status: string
}

export interface SourceRepositorySnapshot {
  readonly repository: string
  readonly defaultBranch: string
  readonly headSha: string
  readonly workingTreeCondition: string
}

export interface SourceRequirementReference {
  readonly requirementId: string
  readonly projectId: string
  readonly code: string
  readonly status: string
}

export interface SourceDecisionReference {
  readonly decisionId: string
  readonly projectId: string
  readonly code: string
  readonly status: string
}

export interface VersionedToolReference {
  readonly name: string
  readonly version: string
}

export interface ExecutionSourceSnapshot {
  readonly snapshotId: string
  readonly approvedDocuments: readonly SourceDocumentReference[]
  readonly jiraIssues: readonly SourceJiraReference[]
  readonly repository: SourceRepositorySnapshot
  readonly requirements: readonly SourceRequirementReference[]
  readonly decisions: readonly SourceDecisionReference[]
  readonly exceptions: readonly string[]
  readonly environmentProfile: JsonObject
  readonly agentVersions: readonly VersionedToolReference[]
  readonly skillVersions: readonly VersionedToolReference[]
  readonly protocolVersion: string
  readonly riskEngineVersion: string
}

export interface ExecutionContractIdentity {
  readonly contractId: string
  /** Semantic version of the contract schema, not an instance hash/version algorithm. */
  readonly contractVersion: string
  readonly projectId: string
  readonly sprintId: string
  /** Ordered Jira or internal task identities. P1-038 integration uses one entry. */
  readonly taskIds: readonly string[]
  readonly createdAt: string
  readonly createdBy: ExecutionActorReference
  readonly sourceSnapshotId: string
  /** Null is permitted for an unsealed structural draft; P0-043 owns sealing. */
  readonly contentHash: string | null
  readonly status: ExecutionContractStatus
  readonly approvedImplementationSpec: ApprovedImplementationSpecReference
}

export interface ExecutionObjectives {
  readonly productObjective: string
  readonly phaseObjective: string
  readonly sprintObjective: string
  readonly taskObjectives: readonly { readonly taskId: string, readonly objective: string }[]
  readonly nonGoals: readonly string[]
}

export interface ExecutionScopeTargets {
  readonly repositoryPaths: readonly string[]
  readonly filePatterns: readonly string[]
  readonly services: readonly string[]
  readonly databaseSchemas: readonly string[]
  readonly jiraIssues: readonly string[]
  readonly commands: readonly string[]
  readonly integrations: readonly string[]
  readonly documentationTargets: readonly string[]
}

export interface ExecutionScope {
  readonly allowed: ExecutionScopeTargets
  readonly denied: ExecutionScopeTargets
  /** Explicit policy for pre-existing uncommitted work. */
  readonly dirtyWorktreePolicy: string
}

export interface ExecutionAgentAssignment {
  readonly agentId: string
  readonly role: ExecutionAgentRole
  readonly model: string
  readonly runtimeVersion: string
  readonly permittedMcpServers: readonly string[]
  readonly permittedTools: readonly string[]
  readonly permittedSkills: readonly string[]
  readonly maxParallelAgents: number
  readonly ownedWorkUnitIds: readonly string[]
  readonly handoffFormat: string
  readonly escalationRules: readonly string[]
}

export interface ExecutionPrecondition {
  readonly preconditionId: string
  readonly description: string
  readonly required: boolean
  readonly result: ExecutionPreconditionResult
  readonly evidenceReferences: readonly string[]
  readonly evaluatedBy: ExecutionActorReference
}

export interface ExecutionWorkUnit {
  readonly workUnitId: string
  readonly objective: string
  readonly inputDependencies: readonly string[]
  readonly allowedPaths: readonly string[]
  readonly expectedOutputs: readonly string[]
  readonly commands: readonly string[]
  readonly validationGateIds: readonly string[]
  readonly rollbackCheckpoint: string
  readonly completionCondition: string
}

export interface ExecutionCommandPolicy {
  readonly allowedClasses: readonly ExecutionCommandClass[]
  readonly commandPatterns: readonly string[]
  readonly timeoutSeconds: number
  readonly retryLimits: number
  readonly workingDirectories: readonly string[]
  /** Names and references only; secret values are never contract content. */
  readonly environmentVariableReferences: readonly string[]
  readonly outputCaptureRules: readonly string[]
}

export interface ExecutionRiskFinding {
  readonly riskId: string
  readonly level: ExecutionRiskLevel
  readonly confidence: number
  readonly affectedResources: readonly string[]
  readonly mitigations: readonly string[]
  readonly approvalLevel: string
  readonly residualRisk: string
  readonly blockingDecision: string
}

export interface ExecutionRiskAssessment {
  readonly findings: readonly ExecutionRiskFinding[]
}

export interface ExecutionValidationGate {
  readonly validationId: string
  readonly kind: string
  readonly command: string
  readonly timeoutSeconds: number
  readonly expectedResult: string
  readonly requiredEvidenceIds: readonly string[]
  readonly failurePolicy: string
  readonly retryAllowed: boolean
}

export interface ExecutionEvidenceRequirement {
  readonly evidenceId: string
  readonly kind: string
  readonly required: boolean
  readonly producer: string
  readonly relatedWorkUnitId: string | null
  readonly relatedValidationId: string | null
}

export interface ExecutionApprovalGate {
  readonly approvalId: string
  readonly triggerState: string
  readonly requiredRole: string
  readonly decisionOptions: readonly string[]
  readonly minimumEvidenceIds: readonly string[]
  readonly expiresAt: string | null
  readonly commentsRequired: boolean
  readonly authorizesTransition: string
}

export interface ExecutionGitPolicy {
  readonly repository: string
  readonly remote: string
  readonly baseBranch: string
  readonly expectedBaseSha: string
  readonly executionBranchPattern: string
  readonly branchCreationRequired: boolean
  readonly stagingRules: readonly string[]
  readonly allowedCommitPaths: readonly string[]
  readonly commitMessagePattern: string
  readonly signingRequired: boolean
  readonly pushTarget: string
  readonly forcePushAllowed: boolean
  readonly pullRequestRequired: boolean
  readonly mergeStrategy: string
}

export interface ExecutionJiraPolicy {
  readonly permittedIssueKeys: readonly string[]
  readonly permittedFields: readonly string[]
  readonly permittedComments: readonly string[]
  readonly permittedTransitions: readonly string[]
}

export interface ExecutionRetryPolicy {
  readonly commandMaxAttempts: number
  readonly validationMaxAttempts: number
  readonly integrationMaxAttempts: number
  readonly workUnitMaxAttempts: number
  readonly backoffSeconds: number
}

export interface ExecutionRecoveryPolicy {
  readonly checkpointRequired: boolean
  readonly checkpointContents: readonly string[]
  readonly sourceCompatibilityChecks: readonly string[]
  readonly resumeRules: readonly string[]
  readonly rollbackRules: readonly string[]
  readonly cancellationRules: readonly string[]
}

export interface ExecutionCompletionPolicy {
  readonly requiredWorkUnitIds: readonly string[]
  readonly requiredValidationIds: readonly string[]
  readonly requiredEvidenceIds: readonly string[]
  readonly requiredApprovalIds: readonly string[]
  readonly requireGitOperations: boolean
  readonly requireJiraOperations: boolean
  readonly blockOnResidualRisk: boolean
  readonly finalSummaryRequired: boolean
  readonly auditRecordRequired: boolean
}

export interface ExecutionSignature {
  readonly signer: ExecutionActorReference
  readonly role: string
  readonly signedAt: string
  readonly signature: string
}

export interface ExecutionContract {
  readonly identity: ExecutionContractIdentity
  readonly sourceSnapshot: ExecutionSourceSnapshot
  readonly objectives: ExecutionObjectives
  readonly scope: ExecutionScope
  readonly executionMode: ExecutionMode
  readonly agents: readonly ExecutionAgentAssignment[]
  readonly preconditions: readonly ExecutionPrecondition[]
  readonly workUnits: readonly ExecutionWorkUnit[]
  readonly commandPolicy: ExecutionCommandPolicy
  readonly riskAssessment: ExecutionRiskAssessment
  readonly validations: readonly ExecutionValidationGate[]
  readonly evidenceRequirements: readonly ExecutionEvidenceRequirement[]
  readonly approvalGates: readonly ExecutionApprovalGate[]
  readonly gitPolicy: ExecutionGitPolicy
  readonly jiraPolicy: ExecutionJiraPolicy
  readonly retryPolicy: ExecutionRetryPolicy
  readonly recoveryPolicy: ExecutionRecoveryPolicy
  readonly completionPolicy: ExecutionCompletionPolicy
  readonly signatures: readonly ExecutionSignature[]
}

export type ExecutionContractValidation<T> = Result<T, string>

const CONTRACT_STATUSES = Object.values(ExecutionContractStatus)
const EXECUTION_MODES = Object.values(ExecutionMode)
const COMMAND_CLASSES = Object.values(ExecutionCommandClass)
const ACTOR_KINDS = Object.values(ExecutionActorKind)
const AGENT_ROLES = Object.values(ExecutionAgentRole)
const PRECONDITION_RESULTS = Object.values(ExecutionPreconditionResult)
const RISK_LEVELS = Object.values(ExecutionRiskLevel)

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, path: string): ExecutionContractValidation<UnknownRecord> {
  return isRecord(value) ? ok(value) : err(`${path} must be an object`)
}

function valueAt(input: UnknownRecord, key: string, path: string): ExecutionContractValidation<unknown> {
  if (!Object.prototype.hasOwnProperty.call(input, key)) {
    return err(`${path}.${key} is required`)
  }
  return ok(input[key])
}

/** The callers use this only after checking every member of a fixed result list. */
function validated<T>(result: ExecutionContractValidation<T> | undefined): T {
  if (result === undefined || !result.ok) {
    throw new Error(result === undefined ? 'missing validation result' : result.error)
  }
  return result.value
}

type ValidationValues<T extends readonly ExecutionContractValidation<unknown>[]> = {
  [K in keyof T]: T[K] extends ExecutionContractValidation<infer Value> ? Value : never
}

function parseAll<T extends readonly ExecutionContractValidation<unknown>[]>(...results: T): ExecutionContractValidation<ValidationValues<T>> {
  for (const result of results) {
    if (!result.ok) return result as ExecutionContractValidation<ValidationValues<T>>
  }
  return ok(results.map(result => validated(result)) as ValidationValues<T>)
}

function text(value: unknown, path: string): ExecutionContractValidation<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return err(`${path} must be a non-empty string`)
  }
  return ok(value.trim())
}

function nullableText(value: unknown, path: string): ExecutionContractValidation<string | null> {
  if (value === null) {
    return ok(null)
  }
  return text(value, path)
}

function booleanValue(value: unknown, path: string): ExecutionContractValidation<boolean> {
  return typeof value === 'boolean' ? ok(value) : err(`${path} must be a boolean`)
}

function numberValue(value: unknown, path: string): ExecutionContractValidation<number> {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? ok(value)
    : err(`${path} must be a finite non-negative number`)
}

function integerValue(value: unknown, path: string): ExecutionContractValidation<number> {
  const result = numberValue(value, path)
  return !result.ok
    ? result
    : Number.isInteger(result.value) ? result : err(`${path} must be an integer`)
}

function oneOf<T extends string>(value: unknown, path: string, values: readonly T[]): ExecutionContractValidation<T> {
  return typeof value === 'string' && values.includes(value as T)
    ? ok(value as T)
    : err(`${path} must be one of ${values.join(', ')}`)
}

function stringArray(value: unknown, path: string): ExecutionContractValidation<readonly string[]> {
  if (!Array.isArray(value)) {
    return err(`${path} must be an array`)
  }

  const result: string[] = []
  for (const [index, entry] of value.entries()) {
    const item = text(entry, `${path}[${String(index)}]`)
    if (!item.ok) {
      return item
    }
    result.push(item.value)
  }
  return ok(result)
}

function jsonArray(value: readonly unknown[], path: string): ExecutionContractValidation<readonly JsonValue[]> {
  const output: JsonValue[] = []
  for (const [index, entry] of value.entries()) {
    const parsed = jsonValue(entry, `${path}[${String(index)}]`)
    if (!parsed.ok) return parsed
    output.push(parsed.value)
  }
  return ok(output)
}

function jsonRecord(value: UnknownRecord, path: string): ExecutionContractValidation<JsonObject> {
  const output: Record<string, JsonValue> = {}
  for (const [key, entry] of Object.entries(value)) {
    const parsed = jsonValue(entry, `${path}.${key}`)
    if (!parsed.ok) return parsed
    output[key] = parsed.value
  }
  return ok(output)
}

function jsonValue(value: unknown, path: string): ExecutionContractValidation<JsonValue> {
  if (value === null) return ok(null)
  if (typeof value === 'string' || typeof value === 'boolean') return ok(value)
  if (typeof value === 'number') {
    return Number.isFinite(value) ? ok(value) : err(`${path} must not contain NaN or Infinity`)
  }
  if (Array.isArray(value)) return jsonArray(value, path)
  if (isRecord(value)) return jsonRecord(value, path)
  return err(`${path} must contain only JSON values`)
}

function jsonObject(value: unknown, path: string): ExecutionContractValidation<JsonObject> {
  if (!isRecord(value)) {
    return err(`${path} must be a JSON object`)
  }
  return jsonValue(value, path) as ExecutionContractValidation<JsonObject>
}

function isoTimestamp(value: unknown, path: string): ExecutionContractValidation<string> {
  const result = text(value, path)
  if (!result.ok) {
    return result
  }
  return Number.isNaN(Date.parse(result.value)) ? err(`${path} must be an ISO-8601 timestamp`) : result
}

function semver(value: unknown, path: string): ExecutionContractValidation<string> {
  const result = text(value, path)
  if (!result.ok) {
    return result
  }
  return /^\d+\.\d+\.\d+$/.test(result.value) ? result : err(`${path} must use major.minor.patch`)
}

function actor(value: unknown, path: string): ExecutionContractValidation<ExecutionActorReference> {
  const input = record(value, path)
  if (!input.ok) return input
  const kind = valueAt(input.value, 'kind', path)
  if (!kind.ok) return kind
  const id = valueAt(input.value, 'id', path)
  if (!id.ok) return id
  const parsedKind = oneOf(validated(kind), `${path}.kind`, ACTOR_KINDS)
  if (!parsedKind.ok) return parsedKind
  const parsedId = text(validated(id), `${path}.id`)
  if (!parsedId.ok) return parsedId
  return ok({ kind: parsedKind.value, id: parsedId.value })
}

function objectArray<T>(value: unknown, path: string, parse: (value: unknown, path: string) => ExecutionContractValidation<T>): ExecutionContractValidation<readonly T[]> {
  if (!Array.isArray(value)) return err(`${path} must be an array`)
  const output: T[] = []
  for (const [index, entry] of value.entries()) {
    const parsed = parse(entry, `${path}[${String(index)}]`)
    if (!parsed.ok) return parsed
    output.push(parsed.value)
  }
  return ok(output)
}

function approvedSpec(value: unknown, path: string): ExecutionContractValidation<ApprovedImplementationSpecReference> {
  const input = record(value, path)
  if (!input.ok) return input
  const specId = valueAt(input.value, 'specId', path)
  const projectId = valueAt(input.value, 'projectId', path)
  const lineageCode = valueAt(input.value, 'lineageCode', path)
  const version = valueAt(input.value, 'version', path)
  const approvedByOperatorId = valueAt(input.value, 'approvedByOperatorId', path)
  const approvedAt = valueAt(input.value, 'approvedAt', path)
  for (const field of [specId, projectId, lineageCode, version, approvedByOperatorId, approvedAt]) {
    if (!field.ok) return field
  }
  const parsedVersion = semver(validated(version), `${path}.version`)
  if (!parsedVersion.ok) return parsedVersion
  const parsedAt = isoTimestamp(validated(approvedAt), `${path}.approvedAt`)
  if (!parsedAt.ok) return parsedAt
  const parsedText = [
    text(validated(specId), `${path}.specId`),
    text(validated(projectId), `${path}.projectId`),
    text(validated(lineageCode), `${path}.lineageCode`),
    text(validated(approvedByOperatorId), `${path}.approvedByOperatorId`),
  ]
  for (const field of parsedText) if (!field.ok) return field
  return ok({
    specId: validated(parsedText[0]),
    projectId: validated(parsedText[1]),
    lineageCode: validated(parsedText[2]),
    version: parsedVersion.value,
    approvedByOperatorId: validated(parsedText[3]),
    approvedAt: parsedAt.value,
  })
}

function sourceDocument(value: unknown, path: string): ExecutionContractValidation<SourceDocumentReference> {
  return stringFields(value, path, ['documentId', 'revision'] as const)
}

function sourceJira(value: unknown, path: string): ExecutionContractValidation<SourceJiraReference> {
  return stringFields(value, path, ['issueKey', 'version', 'status'] as const)
}

function sourceRepository(value: unknown, path: string): ExecutionContractValidation<SourceRepositorySnapshot> {
  return stringFields(value, path, ['repository', 'defaultBranch', 'headSha', 'workingTreeCondition'] as const)
}

function sourceRequirement(value: unknown, path: string): ExecutionContractValidation<SourceRequirementReference> {
  return stringFields(value, path, ['requirementId', 'projectId', 'code', 'status'] as const)
}

function sourceDecision(value: unknown, path: string): ExecutionContractValidation<SourceDecisionReference> {
  return stringFields(value, path, ['decisionId', 'projectId', 'code', 'status'] as const)
}

function versionedTool(value: unknown, path: string): ExecutionContractValidation<VersionedToolReference> {
  return stringFields(value, path, ['name', 'version'] as const)
}

type StringFieldRecord<T extends readonly string[]> = { readonly [key in T[number]]: string }

function stringFields<T extends readonly string[]>(value: unknown, path: string, fields: T): ExecutionContractValidation<StringFieldRecord<T>> {
  const input = record(value, path)
  if (!input.ok) return input as ExecutionContractValidation<StringFieldRecord<T>>
  const output: Record<string, string> = {}
  for (const field of fields) {
    const raw = valueAt(input.value, field, path)
    if (!raw.ok) return raw as ExecutionContractValidation<StringFieldRecord<T>>
    const parsed = text(raw.value, `${path}.${field}`)
    if (!parsed.ok) return parsed as ExecutionContractValidation<StringFieldRecord<T>>
    output[field] = parsed.value
  }
  return ok(output as StringFieldRecord<T>)
}

function sourceSnapshot(value: unknown, path: string): ExecutionContractValidation<ExecutionSourceSnapshot> {
  const input = record(value, path)
  if (!input.ok) return input
  const fields = ['snapshotId', 'approvedDocuments', 'jiraIssues', 'repository', 'requirements', 'decisions', 'exceptions', 'environmentProfile', 'agentVersions', 'skillVersions', 'protocolVersion', 'riskEngineVersion']
  for (const field of fields) {
    const required = valueAt(input.value, field, path)
    if (!required.ok) return required
  }
  const snapshotId = text(input.value.snapshotId, `${path}.snapshotId`)
  const approvedDocuments = objectArray(input.value.approvedDocuments, `${path}.approvedDocuments`, sourceDocument)
  const jiraIssues = objectArray(input.value.jiraIssues, `${path}.jiraIssues`, sourceJira)
  const repository = sourceRepository(input.value.repository, `${path}.repository`)
  const requirements = objectArray(input.value.requirements, `${path}.requirements`, sourceRequirement)
  const decisions = objectArray(input.value.decisions, `${path}.decisions`, sourceDecision)
  const exceptions = stringArray(input.value.exceptions, `${path}.exceptions`)
  const environmentProfile = jsonObject(input.value.environmentProfile, `${path}.environmentProfile`)
  const agentVersions = objectArray(input.value.agentVersions, `${path}.agentVersions`, versionedTool)
  const skillVersions = objectArray(input.value.skillVersions, `${path}.skillVersions`, versionedTool)
  const protocolVersion = text(input.value.protocolVersion, `${path}.protocolVersion`)
  const riskEngineVersion = text(input.value.riskEngineVersion, `${path}.riskEngineVersion`)
  const parsed = parseAll(snapshotId, approvedDocuments, jiraIssues, repository, requirements, decisions, exceptions, environmentProfile, agentVersions, skillVersions, protocolVersion, riskEngineVersion)
  if (!parsed.ok) return parsed
  return ok({
    snapshotId: parsed.value[0],
    approvedDocuments: parsed.value[1],
    jiraIssues: parsed.value[2],
    repository: parsed.value[3],
    requirements: parsed.value[4],
    decisions: parsed.value[5],
    exceptions: parsed.value[6],
    environmentProfile: parsed.value[7],
    agentVersions: parsed.value[8],
    skillVersions: parsed.value[9],
    protocolVersion: parsed.value[10],
    riskEngineVersion: parsed.value[11],
  })
}

function scopeTargets(value: unknown, path: string): ExecutionContractValidation<ExecutionScopeTargets> {
  const input = record(value, path)
  if (!input.ok) return input
  const fields = ['repositoryPaths', 'filePatterns', 'services', 'databaseSchemas', 'jiraIssues', 'commands', 'integrations', 'documentationTargets'] as const
  const parsed = fields.map(field => stringArray(input.value[field], `${path}.${field}`))
  for (const item of parsed) if (!item.ok) return item
  return ok({
    repositoryPaths: validated(parsed[0]),
    filePatterns: validated(parsed[1]),
    services: validated(parsed[2]),
    databaseSchemas: validated(parsed[3]),
    jiraIssues: validated(parsed[4]),
    commands: validated(parsed[5]),
    integrations: validated(parsed[6]),
    documentationTargets: validated(parsed[7]),
  })
}

function objectives(value: unknown, path: string): ExecutionContractValidation<ExecutionObjectives> {
  const input = record(value, path)
  if (!input.ok) return input
  const productObjective = text(input.value.productObjective, `${path}.productObjective`)
  const phaseObjective = text(input.value.phaseObjective, `${path}.phaseObjective`)
  const sprintObjective = text(input.value.sprintObjective, `${path}.sprintObjective`)
  const taskObjectives = objectArray(input.value.taskObjectives, `${path}.taskObjectives`, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    return stringFields(item.value, itemPath, ['taskId', 'objective'] as const)
  })
  const nonGoals = stringArray(input.value.nonGoals, `${path}.nonGoals`)
  const parsed = parseAll(productObjective, phaseObjective, sprintObjective, taskObjectives, nonGoals)
  if (!parsed.ok) return parsed
  return ok({ productObjective: parsed.value[0], phaseObjective: parsed.value[1], sprintObjective: parsed.value[2], taskObjectives: parsed.value[3], nonGoals: parsed.value[4] })
}

function agents(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionAgentAssignment[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const required = ['agentId', 'role', 'model', 'runtimeVersion', 'permittedMcpServers', 'permittedTools', 'permittedSkills', 'maxParallelAgents', 'ownedWorkUnitIds', 'handoffFormat', 'escalationRules']
    for (const field of required) {
      const present = valueAt(item.value, field, itemPath)
      if (!present.ok) return present
    }
    const agentId = text(item.value.agentId, `${itemPath}.agentId`)
    const role = oneOf(item.value.role, `${itemPath}.role`, AGENT_ROLES)
    const model = text(item.value.model, `${itemPath}.model`)
    const runtimeVersion = text(item.value.runtimeVersion, `${itemPath}.runtimeVersion`)
    const permittedMcpServers = stringArray(item.value.permittedMcpServers, `${itemPath}.permittedMcpServers`)
    const permittedTools = stringArray(item.value.permittedTools, `${itemPath}.permittedTools`)
    const permittedSkills = stringArray(item.value.permittedSkills, `${itemPath}.permittedSkills`)
    const maxParallelAgents = integerValue(item.value.maxParallelAgents, `${itemPath}.maxParallelAgents`)
    const ownedWorkUnitIds = stringArray(item.value.ownedWorkUnitIds, `${itemPath}.ownedWorkUnitIds`)
    const handoffFormat = text(item.value.handoffFormat, `${itemPath}.handoffFormat`)
    const escalationRules = stringArray(item.value.escalationRules, `${itemPath}.escalationRules`)
    const parsed = parseAll(agentId, role, model, runtimeVersion, permittedMcpServers, permittedTools, permittedSkills, maxParallelAgents, ownedWorkUnitIds, handoffFormat, escalationRules)
    if (!parsed.ok) return parsed
    return ok({ agentId: parsed.value[0], role: parsed.value[1], model: parsed.value[2], runtimeVersion: parsed.value[3], permittedMcpServers: parsed.value[4], permittedTools: parsed.value[5], permittedSkills: parsed.value[6], maxParallelAgents: parsed.value[7], ownedWorkUnitIds: parsed.value[8], handoffFormat: parsed.value[9], escalationRules: parsed.value[10] })
  })
}

function preconditions(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionPrecondition[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const fields = ['preconditionId', 'description', 'required', 'result', 'evidenceReferences', 'evaluatedBy']
    for (const field of fields) {
      const present = valueAt(item.value, field, itemPath)
      if (!present.ok) return present
    }
    const preconditionId = text(item.value.preconditionId, `${itemPath}.preconditionId`)
    const description = text(item.value.description, `${itemPath}.description`)
    const required = booleanValue(item.value.required, `${itemPath}.required`)
    const result = oneOf(item.value.result, `${itemPath}.result`, PRECONDITION_RESULTS)
    const evidenceReferences = stringArray(item.value.evidenceReferences, `${itemPath}.evidenceReferences`)
    const evaluatedBy = actor(item.value.evaluatedBy, `${itemPath}.evaluatedBy`)
    const parsed = parseAll(preconditionId, description, required, result, evidenceReferences, evaluatedBy)
    if (!parsed.ok) return parsed
    return ok({ preconditionId: parsed.value[0], description: parsed.value[1], required: parsed.value[2], result: parsed.value[3], evidenceReferences: parsed.value[4], evaluatedBy: parsed.value[5] })
  })
}

function workUnits(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionWorkUnit[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const fields = ['workUnitId', 'objective', 'inputDependencies', 'allowedPaths', 'expectedOutputs', 'commands', 'validationGateIds', 'rollbackCheckpoint', 'completionCondition']
    for (const field of fields) {
      const present = valueAt(item.value, field, itemPath)
      if (!present.ok) return present
    }
    const parsed = parseAll(text(item.value.workUnitId, `${itemPath}.workUnitId`), text(item.value.objective, `${itemPath}.objective`), stringArray(item.value.inputDependencies, `${itemPath}.inputDependencies`), stringArray(item.value.allowedPaths, `${itemPath}.allowedPaths`), stringArray(item.value.expectedOutputs, `${itemPath}.expectedOutputs`), stringArray(item.value.commands, `${itemPath}.commands`), stringArray(item.value.validationGateIds, `${itemPath}.validationGateIds`), text(item.value.rollbackCheckpoint, `${itemPath}.rollbackCheckpoint`), text(item.value.completionCondition, `${itemPath}.completionCondition`))
    if (!parsed.ok) return parsed
    return ok({ workUnitId: parsed.value[0], objective: parsed.value[1], inputDependencies: parsed.value[2], allowedPaths: parsed.value[3], expectedOutputs: parsed.value[4], commands: parsed.value[5], validationGateIds: parsed.value[6], rollbackCheckpoint: parsed.value[7], completionCondition: parsed.value[8] })
  })
}

function commandPolicy(value: unknown, path: string): ExecutionContractValidation<ExecutionCommandPolicy> {
  const item = record(value, path)
  if (!item.ok) return item
  const fields = ['allowedClasses', 'commandPatterns', 'timeoutSeconds', 'retryLimits', 'workingDirectories', 'environmentVariableReferences', 'outputCaptureRules']
  for (const field of fields) {
    const present = valueAt(item.value, field, path)
    if (!present.ok) return present
  }
  const allowedClasses = objectArray(item.value.allowedClasses, `${path}.allowedClasses`, (entry, itemPath) => oneOf(entry, itemPath, COMMAND_CLASSES))
  const parsed = parseAll(allowedClasses, stringArray(item.value.commandPatterns, `${path}.commandPatterns`), integerValue(item.value.timeoutSeconds, `${path}.timeoutSeconds`), integerValue(item.value.retryLimits, `${path}.retryLimits`), stringArray(item.value.workingDirectories, `${path}.workingDirectories`), stringArray(item.value.environmentVariableReferences, `${path}.environmentVariableReferences`), stringArray(item.value.outputCaptureRules, `${path}.outputCaptureRules`))
  if (!parsed.ok) return parsed
  return ok({ allowedClasses: parsed.value[0], commandPatterns: parsed.value[1], timeoutSeconds: parsed.value[2], retryLimits: parsed.value[3], workingDirectories: parsed.value[4], environmentVariableReferences: parsed.value[5], outputCaptureRules: parsed.value[6] })
}

function riskAssessment(value: unknown, path: string): ExecutionContractValidation<ExecutionRiskAssessment> {
  const item = record(value, path)
  if (!item.ok) return item
  const findings = objectArray(item.value.findings, `${path}.findings`, (entry, itemPath) => {
    const finding = record(entry, itemPath)
    if (!finding.ok) return finding
    const fields = ['riskId', 'level', 'confidence', 'affectedResources', 'mitigations', 'approvalLevel', 'residualRisk', 'blockingDecision']
    for (const field of fields) {
      const present = valueAt(finding.value, field, itemPath)
      if (!present.ok) return present
    }
    const parsed = parseAll(text(finding.value.riskId, `${itemPath}.riskId`), oneOf(finding.value.level, `${itemPath}.level`, RISK_LEVELS), numberValue(finding.value.confidence, `${itemPath}.confidence`), stringArray(finding.value.affectedResources, `${itemPath}.affectedResources`), stringArray(finding.value.mitigations, `${itemPath}.mitigations`), text(finding.value.approvalLevel, `${itemPath}.approvalLevel`), text(finding.value.residualRisk, `${itemPath}.residualRisk`), text(finding.value.blockingDecision, `${itemPath}.blockingDecision`))
    if (!parsed.ok) return parsed
    return ok({ riskId: parsed.value[0], level: parsed.value[1], confidence: parsed.value[2], affectedResources: parsed.value[3], mitigations: parsed.value[4], approvalLevel: parsed.value[5], residualRisk: parsed.value[6], blockingDecision: parsed.value[7] })
  })
  return findings.ok ? ok({ findings: findings.value }) : findings
}

function validations(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionValidationGate[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const fields = ['validationId', 'kind', 'command', 'timeoutSeconds', 'expectedResult', 'requiredEvidenceIds', 'failurePolicy', 'retryAllowed']
    for (const field of fields) {
      const present = valueAt(item.value, field, itemPath)
      if (!present.ok) return present
    }
    const parsed = parseAll(text(item.value.validationId, `${itemPath}.validationId`), text(item.value.kind, `${itemPath}.kind`), text(item.value.command, `${itemPath}.command`), integerValue(item.value.timeoutSeconds, `${itemPath}.timeoutSeconds`), text(item.value.expectedResult, `${itemPath}.expectedResult`), stringArray(item.value.requiredEvidenceIds, `${itemPath}.requiredEvidenceIds`), text(item.value.failurePolicy, `${itemPath}.failurePolicy`), booleanValue(item.value.retryAllowed, `${itemPath}.retryAllowed`))
    if (!parsed.ok) return parsed
    return ok({ validationId: parsed.value[0], kind: parsed.value[1], command: parsed.value[2], timeoutSeconds: parsed.value[3], expectedResult: parsed.value[4], requiredEvidenceIds: parsed.value[5], failurePolicy: parsed.value[6], retryAllowed: parsed.value[7] })
  })
}

function evidenceRequirements(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionEvidenceRequirement[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const fields = ['evidenceId', 'kind', 'required', 'producer', 'relatedWorkUnitId', 'relatedValidationId']
    for (const field of fields) {
      const present = valueAt(item.value, field, itemPath)
      if (!present.ok) return present
    }
    const parsed = parseAll(text(item.value.evidenceId, `${itemPath}.evidenceId`), text(item.value.kind, `${itemPath}.kind`), booleanValue(item.value.required, `${itemPath}.required`), text(item.value.producer, `${itemPath}.producer`), nullableText(item.value.relatedWorkUnitId, `${itemPath}.relatedWorkUnitId`), nullableText(item.value.relatedValidationId, `${itemPath}.relatedValidationId`))
    if (!parsed.ok) return parsed
    return ok({ evidenceId: parsed.value[0], kind: parsed.value[1], required: parsed.value[2], producer: parsed.value[3], relatedWorkUnitId: parsed.value[4], relatedValidationId: parsed.value[5] })
  })
}

function approvalGates(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionApprovalGate[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const fields = ['approvalId', 'triggerState', 'requiredRole', 'decisionOptions', 'minimumEvidenceIds', 'expiresAt', 'commentsRequired', 'authorizesTransition']
    for (const field of fields) {
      const present = valueAt(item.value, field, itemPath)
      if (!present.ok) return present
    }
    const parsed = parseAll(text(item.value.approvalId, `${itemPath}.approvalId`), text(item.value.triggerState, `${itemPath}.triggerState`), text(item.value.requiredRole, `${itemPath}.requiredRole`), stringArray(item.value.decisionOptions, `${itemPath}.decisionOptions`), stringArray(item.value.minimumEvidenceIds, `${itemPath}.minimumEvidenceIds`), item.value.expiresAt === null ? ok(null) : isoTimestamp(item.value.expiresAt, `${itemPath}.expiresAt`), booleanValue(item.value.commentsRequired, `${itemPath}.commentsRequired`), text(item.value.authorizesTransition, `${itemPath}.authorizesTransition`))
    if (!parsed.ok) return parsed
    return ok({ approvalId: parsed.value[0], triggerState: parsed.value[1], requiredRole: parsed.value[2], decisionOptions: parsed.value[3], minimumEvidenceIds: parsed.value[4], expiresAt: parsed.value[5], commentsRequired: parsed.value[6], authorizesTransition: parsed.value[7] })
  })
}

function gitPolicy(value: unknown, path: string): ExecutionContractValidation<ExecutionGitPolicy> {
  const item = record(value, path)
  if (!item.ok) return item
  const fields = ['repository', 'remote', 'baseBranch', 'expectedBaseSha', 'executionBranchPattern', 'branchCreationRequired', 'stagingRules', 'allowedCommitPaths', 'commitMessagePattern', 'signingRequired', 'pushTarget', 'forcePushAllowed', 'pullRequestRequired', 'mergeStrategy']
  for (const field of fields) {
    const present = valueAt(item.value, field, path)
    if (!present.ok) return present
  }
  const parsed = parseAll(text(item.value.repository, `${path}.repository`), text(item.value.remote, `${path}.remote`), text(item.value.baseBranch, `${path}.baseBranch`), text(item.value.expectedBaseSha, `${path}.expectedBaseSha`), text(item.value.executionBranchPattern, `${path}.executionBranchPattern`), booleanValue(item.value.branchCreationRequired, `${path}.branchCreationRequired`), stringArray(item.value.stagingRules, `${path}.stagingRules`), stringArray(item.value.allowedCommitPaths, `${path}.allowedCommitPaths`), text(item.value.commitMessagePattern, `${path}.commitMessagePattern`), booleanValue(item.value.signingRequired, `${path}.signingRequired`), text(item.value.pushTarget, `${path}.pushTarget`), booleanValue(item.value.forcePushAllowed, `${path}.forcePushAllowed`), booleanValue(item.value.pullRequestRequired, `${path}.pullRequestRequired`), text(item.value.mergeStrategy, `${path}.mergeStrategy`))
  if (!parsed.ok) return parsed
  return ok({ repository: parsed.value[0], remote: parsed.value[1], baseBranch: parsed.value[2], expectedBaseSha: parsed.value[3], executionBranchPattern: parsed.value[4], branchCreationRequired: parsed.value[5], stagingRules: parsed.value[6], allowedCommitPaths: parsed.value[7], commitMessagePattern: parsed.value[8], signingRequired: parsed.value[9], pushTarget: parsed.value[10], forcePushAllowed: parsed.value[11], pullRequestRequired: parsed.value[12], mergeStrategy: parsed.value[13] })
}

function jiraPolicy(value: unknown, path: string): ExecutionContractValidation<ExecutionJiraPolicy> {
  const item = record(value, path)
  if (!item.ok) return item
  const parsed = parseAll(stringArray(item.value.permittedIssueKeys, `${path}.permittedIssueKeys`), stringArray(item.value.permittedFields, `${path}.permittedFields`), stringArray(item.value.permittedComments, `${path}.permittedComments`), stringArray(item.value.permittedTransitions, `${path}.permittedTransitions`))
  if (!parsed.ok) return parsed
  return ok({ permittedIssueKeys: parsed.value[0], permittedFields: parsed.value[1], permittedComments: parsed.value[2], permittedTransitions: parsed.value[3] })
}

function retryPolicy(value: unknown, path: string): ExecutionContractValidation<ExecutionRetryPolicy> {
  const item = record(value, path)
  if (!item.ok) return item
  const parsed = parseAll(integerValue(item.value.commandMaxAttempts, `${path}.commandMaxAttempts`), integerValue(item.value.validationMaxAttempts, `${path}.validationMaxAttempts`), integerValue(item.value.integrationMaxAttempts, `${path}.integrationMaxAttempts`), integerValue(item.value.workUnitMaxAttempts, `${path}.workUnitMaxAttempts`), numberValue(item.value.backoffSeconds, `${path}.backoffSeconds`))
  if (!parsed.ok) return parsed
  return ok({ commandMaxAttempts: parsed.value[0], validationMaxAttempts: parsed.value[1], integrationMaxAttempts: parsed.value[2], workUnitMaxAttempts: parsed.value[3], backoffSeconds: parsed.value[4] })
}

function recoveryPolicy(value: unknown, path: string): ExecutionContractValidation<ExecutionRecoveryPolicy> {
  const item = record(value, path)
  if (!item.ok) return item
  const parsed = parseAll(booleanValue(item.value.checkpointRequired, `${path}.checkpointRequired`), stringArray(item.value.checkpointContents, `${path}.checkpointContents`), stringArray(item.value.sourceCompatibilityChecks, `${path}.sourceCompatibilityChecks`), stringArray(item.value.resumeRules, `${path}.resumeRules`), stringArray(item.value.rollbackRules, `${path}.rollbackRules`), stringArray(item.value.cancellationRules, `${path}.cancellationRules`))
  if (!parsed.ok) return parsed
  return ok({ checkpointRequired: parsed.value[0], checkpointContents: parsed.value[1], sourceCompatibilityChecks: parsed.value[2], resumeRules: parsed.value[3], rollbackRules: parsed.value[4], cancellationRules: parsed.value[5] })
}

function completionPolicy(value: unknown, path: string): ExecutionContractValidation<ExecutionCompletionPolicy> {
  const item = record(value, path)
  if (!item.ok) return item
  const parsed = parseAll(stringArray(item.value.requiredWorkUnitIds, `${path}.requiredWorkUnitIds`), stringArray(item.value.requiredValidationIds, `${path}.requiredValidationIds`), stringArray(item.value.requiredEvidenceIds, `${path}.requiredEvidenceIds`), stringArray(item.value.requiredApprovalIds, `${path}.requiredApprovalIds`), booleanValue(item.value.requireGitOperations, `${path}.requireGitOperations`), booleanValue(item.value.requireJiraOperations, `${path}.requireJiraOperations`), booleanValue(item.value.blockOnResidualRisk, `${path}.blockOnResidualRisk`), booleanValue(item.value.finalSummaryRequired, `${path}.finalSummaryRequired`), booleanValue(item.value.auditRecordRequired, `${path}.auditRecordRequired`))
  if (!parsed.ok) return parsed
  return ok({ requiredWorkUnitIds: parsed.value[0], requiredValidationIds: parsed.value[1], requiredEvidenceIds: parsed.value[2], requiredApprovalIds: parsed.value[3], requireGitOperations: parsed.value[4], requireJiraOperations: parsed.value[5], blockOnResidualRisk: parsed.value[6], finalSummaryRequired: parsed.value[7], auditRecordRequired: parsed.value[8] })
}

function signatures(value: unknown, path: string): ExecutionContractValidation<readonly ExecutionSignature[]> {
  return objectArray(value, path, (entry, itemPath) => {
    const item = record(entry, itemPath)
    if (!item.ok) return item
    const parsed = parseAll(actor(item.value.signer, `${itemPath}.signer`), text(item.value.role, `${itemPath}.role`), isoTimestamp(item.value.signedAt, `${itemPath}.signedAt`), text(item.value.signature, `${itemPath}.signature`))
    if (!parsed.ok) return parsed
    return ok({ signer: parsed.value[0], role: parsed.value[1], signedAt: parsed.value[2], signature: parsed.value[3] })
  })
}

function identity(value: unknown, path: string): ExecutionContractValidation<ExecutionContractIdentity> {
  const item = record(value, path)
  if (!item.ok) return item
  const fields = ['contractId', 'contractVersion', 'projectId', 'sprintId', 'taskIds', 'createdAt', 'createdBy', 'sourceSnapshotId', 'contentHash', 'status', 'approvedImplementationSpec']
  for (const field of fields) {
    const present = valueAt(item.value, field, path)
    if (!present.ok) return present
  }
  const taskIds = stringArray(item.value.taskIds, `${path}.taskIds`)
  if (taskIds.ok && taskIds.value.length === 0) return err(`${path}.taskIds must contain at least one task`)
  if (taskIds.ok && new Set(taskIds.value).size !== taskIds.value.length) return err(`${path}.taskIds must not contain duplicates`)
  const parsed = parseAll(text(item.value.contractId, `${path}.contractId`), semver(item.value.contractVersion, `${path}.contractVersion`), text(item.value.projectId, `${path}.projectId`), text(item.value.sprintId, `${path}.sprintId`), taskIds, isoTimestamp(item.value.createdAt, `${path}.createdAt`), actor(item.value.createdBy, `${path}.createdBy`), text(item.value.sourceSnapshotId, `${path}.sourceSnapshotId`), nullableText(item.value.contentHash, `${path}.contentHash`), oneOf(item.value.status, `${path}.status`, CONTRACT_STATUSES), approvedSpec(item.value.approvedImplementationSpec, `${path}.approvedImplementationSpec`))
  if (!parsed.ok) return parsed
  return ok({ contractId: parsed.value[0], contractVersion: parsed.value[1], projectId: parsed.value[2], sprintId: parsed.value[3], taskIds: parsed.value[4], createdAt: parsed.value[5], createdBy: parsed.value[6], sourceSnapshotId: parsed.value[7], contentHash: parsed.value[8], status: parsed.value[9], approvedImplementationSpec: parsed.value[10] })
}

function checkTopLevel(input: UnknownRecord): ExecutionContractValidation<void> {
  const required = ['identity', 'sourceSnapshot', 'objectives', 'scope', 'executionMode', 'agents', 'preconditions', 'workUnits', 'commandPolicy', 'riskAssessment', 'validations', 'evidenceRequirements', 'approvalGates', 'gitPolicy', 'jiraPolicy', 'retryPolicy', 'recoveryPolicy', 'completionPolicy', 'signatures']
  for (const field of required) if (!Object.prototype.hasOwnProperty.call(input, field)) return err(`contract.${field} is required`)
  const unexpected = Object.keys(input).find(key => !required.includes(key))
  return unexpected === undefined ? ok(undefined) : err(`contract contains unsupported field ${unexpected}`)
}

function validateCrossReferences(
  contractIdentity: ExecutionContractIdentity,
  sourceSnapshotValue: ExecutionSourceSnapshot,
  contractObjectives: ExecutionObjectives,
): ExecutionContractValidation<void> {
  if (contractIdentity.projectId !== contractIdentity.approvedImplementationSpec.projectId) {
    return err('contract.identity.approvedImplementationSpec.projectId must equal contract.identity.projectId')
  }
  if (contractIdentity.sourceSnapshotId !== sourceSnapshotValue.snapshotId) {
    return err('contract.identity.sourceSnapshotId must equal contract.sourceSnapshot.snapshotId')
  }
  const taskIds = new Set(contractIdentity.taskIds)
  const objectiveTaskIds = contractObjectives.taskObjectives.map(objective => objective.taskId)
  if (objectiveTaskIds.some(taskId => !taskIds.has(taskId))) {
    return err('contract.objectives.taskObjectives must reference contract.identity.taskIds')
  }
  if (new Set(objectiveTaskIds).size !== objectiveTaskIds.length) {
    return err('contract.objectives.taskObjectives must not contain duplicate task IDs')
  }
  if (sourceSnapshotValue.requirements.some(requirement => requirement.projectId !== contractIdentity.projectId)) {
    return err('contract.sourceSnapshot.requirements must belong to contract.identity.projectId')
  }
  if (sourceSnapshotValue.decisions.some(decision => decision.projectId !== contractIdentity.projectId)) {
    return err('contract.sourceSnapshot.decisions must belong to contract.identity.projectId')
  }
  return ok(undefined)
}

/**
 * Parses the structural contract schema from an untrusted boundary.
 * Structural validity is intentionally separate from completeness and
 * execution readiness: empty policy lists can be valid schema values and
 * are evaluated by P0-042 when that gate exists.
 */
export function parseExecutionContract(input: unknown): ExecutionContractValidation<ExecutionContract> {
  const top = record(input, 'contract')
  if (!top.ok) return top
  const shape = checkTopLevel(top.value)
  if (!shape.ok) return shape
  const parsedIdentity = identity(top.value.identity, 'contract.identity')
  const parsedSnapshot = sourceSnapshot(top.value.sourceSnapshot, 'contract.sourceSnapshot')
  const parsedObjectives = objectives(top.value.objectives, 'contract.objectives')
  const scopeInput = record(top.value.scope, 'contract.scope')
  if (!scopeInput.ok) return scopeInput
  const parsedScope = scopeTargets(scopeInput.value.allowed, 'contract.scope.allowed')
  const denied = scopeTargets(scopeInput.value.denied, 'contract.scope.denied')
  const dirtyWorktreePolicy = text(scopeInput.value.dirtyWorktreePolicy, 'contract.scope.dirtyWorktreePolicy')
  const parsedMode = oneOf(top.value.executionMode, 'contract.executionMode', EXECUTION_MODES)
  const parsedAgents = agents(top.value.agents, 'contract.agents')
  const parsedPreconditions = preconditions(top.value.preconditions, 'contract.preconditions')
  const parsedWorkUnits = workUnits(top.value.workUnits, 'contract.workUnits')
  const parsedCommandPolicy = commandPolicy(top.value.commandPolicy, 'contract.commandPolicy')
  const parsedRiskAssessment = riskAssessment(top.value.riskAssessment, 'contract.riskAssessment')
  const parsedValidations = validations(top.value.validations, 'contract.validations')
  const parsedEvidenceRequirements = evidenceRequirements(top.value.evidenceRequirements, 'contract.evidenceRequirements')
  const parsedApprovalGates = approvalGates(top.value.approvalGates, 'contract.approvalGates')
  const parsedGitPolicy = gitPolicy(top.value.gitPolicy, 'contract.gitPolicy')
  const parsedJiraPolicy = jiraPolicy(top.value.jiraPolicy, 'contract.jiraPolicy')
  const parsedRetryPolicy = retryPolicy(top.value.retryPolicy, 'contract.retryPolicy')
  const parsedRecoveryPolicy = recoveryPolicy(top.value.recoveryPolicy, 'contract.recoveryPolicy')
  const parsedCompletionPolicy = completionPolicy(top.value.completionPolicy, 'contract.completionPolicy')
  const parsedSignatures = signatures(top.value.signatures, 'contract.signatures')
  const parsed = parseAll(parsedIdentity, parsedSnapshot, parsedObjectives, parsedScope, denied, dirtyWorktreePolicy, parsedMode, parsedAgents, parsedPreconditions, parsedWorkUnits, parsedCommandPolicy, parsedRiskAssessment, parsedValidations, parsedEvidenceRequirements, parsedApprovalGates, parsedGitPolicy, parsedJiraPolicy, parsedRetryPolicy, parsedRecoveryPolicy, parsedCompletionPolicy, parsedSignatures)
  if (!parsed.ok) return parsed
  const crossReferences = validateCrossReferences(parsed.value[0], parsed.value[1], parsed.value[2])
  if (!crossReferences.ok) return crossReferences
  return ok({
    identity: parsed.value[0],
    sourceSnapshot: parsed.value[1],
    objectives: parsed.value[2],
    scope: { allowed: parsed.value[3], denied: parsed.value[4], dirtyWorktreePolicy: parsed.value[5] },
    executionMode: parsed.value[6],
    agents: parsed.value[7],
    preconditions: parsed.value[8],
    workUnits: parsed.value[9],
    commandPolicy: parsed.value[10],
    riskAssessment: parsed.value[11],
    validations: parsed.value[12],
    evidenceRequirements: parsed.value[13],
    approvalGates: parsed.value[14],
    gitPolicy: parsed.value[15],
    jiraPolicy: parsed.value[16],
    retryPolicy: parsed.value[17],
    recoveryPolicy: parsed.value[18],
    completionPolicy: parsed.value[19],
    signatures: parsed.value[20],
  })
}

function stableValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stableValue)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, stableValue(entry)]))
  }
  return value
}

/** Deterministic structural JSON representation; this is not a contract hash. */
export function serializeExecutionContract(contract: ExecutionContract): string {
  return JSON.stringify(stableValue(contract as unknown as JsonValue))
}
