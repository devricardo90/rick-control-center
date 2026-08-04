/**
 * Narrows an unknown request body into typed project-settings-update
 * input. Request bodies are untrusted input — this is the boundary where
 * that `unknown` gets validated before anything downstream touches it.
 *
 * `key` is never read from the raw body, at any value or type — its mere
 * presence has no effect on the built input, which is how `Project.key`
 * immutability is enforced at this boundary (the same way other
 * non-editable fields like `id`, `status`, and `createdAt` are already
 * silently excluded, rather than causing a distinct rejection path).
 *
 * `description` and `workspacePath` are clearable: an empty string is
 * normalized to `null` (explicit clear) so a plain HTML form/textarea —
 * which can only ever produce a string, never `null` — can clear a field
 * without the client having to special-case anything.
 *
 * NDERCC-10: complete project settings and lifecycle.
 */
import { AutonomyPolicy, BranchPolicy, type UpdateProjectSettingsInput } from '@rick/database'

const AUTONOMY_POLICY_VALUES: readonly string[] = Object.values(AutonomyPolicy)
const BRANCH_POLICY_VALUES: readonly string[] = Object.values(BranchPolicy)

interface ValidatedUpdateProjectCandidate {
  name: string
  description: string | null | undefined
  autonomyPolicy: AutonomyPolicy | undefined
  defaultBranchPolicy: BranchPolicy | undefined
  workspacePath: string | null | undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidClearableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

function isValidOptionalAutonomyPolicy(value: unknown): value is AutonomyPolicy | undefined {
  return value === undefined || (typeof value === 'string' && AUTONOMY_POLICY_VALUES.includes(value))
}

function isValidOptionalBranchPolicy(value: unknown): value is BranchPolicy | undefined {
  return value === undefined || (typeof value === 'string' && BRANCH_POLICY_VALUES.includes(value))
}

function isValidUpdateProjectCandidate(
  candidate: Record<string, unknown>,
): candidate is Record<string, unknown> & ValidatedUpdateProjectCandidate {
  const { name, description, autonomyPolicy, defaultBranchPolicy, workspacePath } = candidate

  return (
    isNonEmptyString(name)
    && isValidClearableString(description)
    && isValidClearableString(workspacePath)
    && isValidOptionalAutonomyPolicy(autonomyPolicy)
    && isValidOptionalBranchPolicy(defaultBranchPolicy)
  )
}

function normalizeClearable(value: string | null): string | null {
  if (value === null) {
    return null
  }
  return value.length > 0 ? value : null
}

function buildUpdateProjectSettingsInput(
  candidate: ValidatedUpdateProjectCandidate,
): UpdateProjectSettingsInput {
  const { name, description, autonomyPolicy, defaultBranchPolicy, workspacePath } = candidate

  return {
    name,
    ...(description !== undefined ? { description: normalizeClearable(description) } : {}),
    ...(autonomyPolicy !== undefined ? { autonomyPolicy } : {}),
    ...(defaultBranchPolicy !== undefined ? { defaultBranchPolicy } : {}),
    ...(workspacePath !== undefined ? { workspacePath: normalizeClearable(workspacePath) } : {}),
  }
}

export function parseUpdateProjectSettingsInput(raw: unknown): UpdateProjectSettingsInput | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const candidate = raw as Record<string, unknown>

  if (!isValidUpdateProjectCandidate(candidate)) {
    return null
  }

  return buildUpdateProjectSettingsInput(candidate)
}
