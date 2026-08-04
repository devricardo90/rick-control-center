/**
 * Narrows an unknown request body into typed project-creation input.
 * Request bodies are untrusted input — this is the boundary where that
 * `unknown` gets validated before anything downstream touches it.
 *
 * Enum fields are validated against the exact runtime enum values
 * @rick/database re-exports from Prisma, so this validator can never drift
 * from the actual persisted enum set.
 *
 * Split into a validate step (type predicate, no casts) and a build step
 * (plain construction) to keep each function's branching within the
 * repository's complexity limit.
 *
 * NDERCC-7: minimal project interface.
 */
import { AutonomyPolicy, BranchPolicy, type CreateProjectInput } from '@rick/database'

const AUTONOMY_POLICY_VALUES: readonly string[] = Object.values(AutonomyPolicy)
const BRANCH_POLICY_VALUES: readonly string[] = Object.values(BranchPolicy)

interface ValidatedCreateProjectCandidate {
  key: string
  name: string
  description: string | undefined
  autonomyPolicy: AutonomyPolicy | undefined
  defaultBranchPolicy: BranchPolicy | undefined
  workspacePath: string | undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value)
}

function isValidOptionalAutonomyPolicy(value: unknown): value is AutonomyPolicy | undefined {
  return value === undefined || (typeof value === 'string' && AUTONOMY_POLICY_VALUES.includes(value))
}

function isValidOptionalBranchPolicy(value: unknown): value is BranchPolicy | undefined {
  return value === undefined || (typeof value === 'string' && BRANCH_POLICY_VALUES.includes(value))
}

function isValidCreateProjectCandidate(
  candidate: Record<string, unknown>,
): candidate is Record<string, unknown> & ValidatedCreateProjectCandidate {
  const { key, name, description, autonomyPolicy, defaultBranchPolicy, workspacePath } = candidate

  return (
    isNonEmptyString(key)
    && isNonEmptyString(name)
    && isValidOptionalString(description)
    && isValidOptionalString(workspacePath)
    && isValidOptionalAutonomyPolicy(autonomyPolicy)
    && isValidOptionalBranchPolicy(defaultBranchPolicy)
  )
}

function buildCreateProjectInput(candidate: ValidatedCreateProjectCandidate): CreateProjectInput {
  const { key, name, description, autonomyPolicy, defaultBranchPolicy, workspacePath } = candidate

  return {
    key,
    name,
    ...(description !== undefined ? { description } : {}),
    ...(autonomyPolicy !== undefined ? { autonomyPolicy } : {}),
    ...(defaultBranchPolicy !== undefined ? { defaultBranchPolicy } : {}),
    ...(workspacePath !== undefined ? { workspacePath } : {}),
  }
}

export function parseCreateProjectInput(raw: unknown): CreateProjectInput | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const candidate = raw as Record<string, unknown>

  if (!isValidCreateProjectCandidate(candidate)) {
    return null
  }

  return buildCreateProjectInput(candidate)
}
