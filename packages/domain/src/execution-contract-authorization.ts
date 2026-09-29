/**
 * P0-042 — GAP-04 structured command/path authorization
 * (RIC-SPEC-NDERCC-39-001 §7, AC-12).
 *
 * Three layers are kept strictly separate, and only the first two exist in
 * this module:
 *
 *   A. **Structural/schema validation** — `parseExecutionCommandRequest`.
 *      Rejects malformed structures and unsafe lexical path forms before
 *      anything is evaluated for permission.
 *   B. **Pure deterministic authorization decision** — `authorizeExecutionCommand`.
 *      A total function of validated input and policy: default DENY, an
 *      explicit matching deny always overrides an allow, and every branch
 *      returns a stable reason code. It performs no I/O.
 *   C. **Runtime enforcement** — command execution, real filesystem path
 *      resolution, symlink/junction handling, time-of-check/time-of-use
 *      protection, sandboxing — is explicitly outside P0-042 and is not
 *      implemented anywhere in this file. Neither a valid schema nor an ALLOW
 *      decision proves a runtime escape is prevented.
 *
 * This module imports nothing from `node:child_process`, `node:fs` or any
 * other execution/filesystem API — enforced both by review and by
 * `execution-contract-authorization.test.ts`, which scans this file's own
 * source for exactly that.
 */
import { err, ok } from '@rick/shared'
import type { Result } from '@rick/shared'

export const EXECUTION_CONTRACT_AUTHORIZATION_VERSION = 'P0_042_V1' as const

export const PathAccessMode = {
  READ: 'READ',
  WRITE: 'WRITE',
  CREATE: 'CREATE',
  DELETE: 'DELETE',
} as const
export type PathAccessMode = typeof PathAccessMode[keyof typeof PathAccessMode]

const PATH_ACCESS_MODES = Object.values(PathAccessMode)

export type AuthorizationValidation<T> = Result<T, string>

export interface ExecutionCommandIdentity {
  readonly commandId: string
  readonly executable: string
  readonly args: readonly string[]
}

export interface ExecutionPathOperation {
  readonly path: string
  readonly accessMode: PathAccessMode
}

export interface ExecutionCommandRequest {
  readonly workspaceId: string
  readonly projectId: string
  readonly command: ExecutionCommandIdentity
  readonly workingDirectory: string
  readonly paths: readonly ExecutionPathOperation[]
}

export interface ExecutionAuthorizationPolicy {
  readonly workspaceId: string
  readonly projectId: string
  readonly allowedCommands: readonly { readonly commandId: string, readonly executable: string }[]
  readonly allowedPaths: readonly ExecutionPathOperation[]
  /** An explicit deny always overrides a matching allow, regardless of declaration order. */
  readonly deniedPaths: readonly ExecutionPathOperation[]
}

export const AuthorizationDecision = {
  ALLOW: 'ALLOW',
  DENY: 'DENY',
} as const
export type AuthorizationDecision = typeof AuthorizationDecision[keyof typeof AuthorizationDecision]

export const AuthorizationReasonCode = {
  WORKSPACE_MISMATCH: 'WORKSPACE_MISMATCH',
  PROJECT_MISMATCH: 'PROJECT_MISMATCH',
  UNLISTED_COMMAND: 'UNLISTED_COMMAND',
  EXPLICIT_DENY: 'EXPLICIT_DENY',
  UNLISTED_PATH_OPERATION: 'UNLISTED_PATH_OPERATION',
  ALLOWED: 'ALLOWED',
} as const
export type AuthorizationReasonCode = typeof AuthorizationReasonCode[keyof typeof AuthorizationReasonCode]

export interface AuthorizationOutcome {
  readonly decision: AuthorizationDecision
  readonly reasonCode: AuthorizationReasonCode
  readonly message: string
}

// ── A. Structural / schema validation ─────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyText(value: unknown, field: string): AuthorizationValidation<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return err(`${field} must be a non-empty string`)
  }
  return ok(value)
}

/**
 * Rejects at least: absolute paths, traversal segments, drive-prefixed paths
 * (`C:`), UNC paths (`\\host\share`), NUL-containing paths, and paths that
 * are not workspace-relative forward-slash-separated segments. This is
 * lexical rejection only — it proves nothing about the real filesystem, and
 * is not a substitute for runtime canonicalization (outside P0-042).
 */
/** The lexical rejections that apply to the whole path string, before it is split into segments. */
function rejectUnsafePathForm(path: string, field: string): string | null {
  if (path.includes('\0')) return `${field} must not contain a NUL character`
  if (path.includes('\\')) return `${field} must use forward slashes only, not backslashes`
  if (path.startsWith('//') || path.startsWith('\\\\')) return `${field} must not be a UNC path`
  if (/^[A-Za-z]:/.test(path)) return `${field} must not be drive-prefixed`
  if (path.startsWith('/')) return `${field} must be workspace-relative, not absolute`
  return null
}

/** The rejections that apply per path segment, once split on `/`. */
function rejectUnsafeSegments(segments: readonly string[], field: string): string | null {
  if (segments.some(segment => segment === '..')) return `${field} must not contain a traversal segment`
  if (segments.some(segment => segment.length === 0)) return `${field} must not contain an empty segment`
  if (segments.some(segment => segment.trim() !== segment)) return `${field} segments must not have leading or trailing whitespace`
  return null
}

export function validatePathDeclaration(value: unknown, field: string): AuthorizationValidation<string> {
  const parsedText = nonEmptyText(value, field)
  if (!parsedText.ok) return parsedText
  const path = parsedText.value

  const wholeFormError = rejectUnsafePathForm(path, field)
  if (wholeFormError !== null) return err(wholeFormError)

  const segmentError = rejectUnsafeSegments(path.split('/'), field)
  if (segmentError !== null) return err(segmentError)

  return ok(path)
}

function pathOperation(value: unknown, path: string): AuthorizationValidation<ExecutionPathOperation> {
  if (!isRecord(value)) return err(`${path} must be an object`)
  const parsedPath = validatePathDeclaration(value['path'], `${path}.path`)
  if (!parsedPath.ok) return parsedPath
  const mode = value['accessMode']
  if (typeof mode !== 'string' || !PATH_ACCESS_MODES.includes(mode as PathAccessMode)) {
    return err(`${path}.accessMode must be one of ${PATH_ACCESS_MODES.join(', ')}`)
  }
  return ok({ path: parsedPath.value, accessMode: mode as PathAccessMode })
}

function pathOperationArray(value: unknown, path: string): AuthorizationValidation<readonly ExecutionPathOperation[]> {
  if (!Array.isArray(value)) return err(`${path} must be an array`)
  const output: ExecutionPathOperation[] = []
  for (const [index, entry] of value.entries()) {
    const parsed = pathOperation(entry, `${path}[${String(index)}]`)
    if (!parsed.ok) return parsed
    output.push(parsed.value)
  }
  return ok(output)
}

function commandIdentity(value: unknown, path: string): AuthorizationValidation<ExecutionCommandIdentity> {
  if (!isRecord(value)) return err(`${path} must be an object`)
  const commandId = nonEmptyText(value['commandId'], `${path}.commandId`)
  if (!commandId.ok) return commandId
  const executable = nonEmptyText(value['executable'], `${path}.executable`)
  if (!executable.ok) return executable
  const args = value['args']
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    return err(`${path}.args must be an array of strings`)
  }
  return ok({ commandId: commandId.value, executable: executable.value, args })
}

/**
 * Parses an untrusted structured authorization request. This is layer A
 * only: it proves the shape and lexical safety of the input, never whether
 * it is permitted — that is `authorizeExecutionCommand`, a separate step on
 * the parsed result.
 */
export function parseExecutionCommandRequest(input: unknown): AuthorizationValidation<ExecutionCommandRequest> {
  if (!isRecord(input)) return err('request must be an object')

  const workspaceId = nonEmptyText(input['workspaceId'], 'request.workspaceId')
  if (!workspaceId.ok) return workspaceId
  const projectId = nonEmptyText(input['projectId'], 'request.projectId')
  if (!projectId.ok) return projectId
  const command = commandIdentity(input['command'], 'request.command')
  if (!command.ok) return command
  const workingDirectory = validatePathDeclaration(input['workingDirectory'], 'request.workingDirectory')
  if (!workingDirectory.ok) return workingDirectory
  const paths = pathOperationArray(input['paths'], 'request.paths')
  if (!paths.ok) return paths

  return ok({
    workspaceId: workspaceId.value,
    projectId: projectId.value,
    command: command.value,
    workingDirectory: workingDirectory.value,
    paths: paths.value,
  })
}

// ── B. Pure deterministic authorization decision ──────────────────────────────

function deny(reasonCode: AuthorizationReasonCode, message: string): AuthorizationOutcome {
  return { decision: AuthorizationDecision.DENY, reasonCode, message }
}

function pathKey(operation: ExecutionPathOperation): string {
  return `${operation.accessMode}:${operation.path}`
}

/** Every requested path operation must be explicitly allowed and not explicitly denied. Default is deny: an operation absent from both lists is denied, never permitted by omission. */
function pathDecision(request: ExecutionCommandRequest, policy: ExecutionAuthorizationPolicy): AuthorizationOutcome | null {
  const denied = new Set(policy.deniedPaths.map(pathKey))
  const allowed = new Set(policy.allowedPaths.map(pathKey))

  for (const operation of request.paths) {
    const key = pathKey(operation)
    if (denied.has(key)) {
      return deny(AuthorizationReasonCode.EXPLICIT_DENY, `path operation ${key} is explicitly denied`)
    }
    if (!allowed.has(key)) {
      return deny(AuthorizationReasonCode.UNLISTED_PATH_OPERATION, `path operation ${key} is not on the allowlist`)
    }
  }
  return null
}

/**
 * Deterministic pure decision over an already-validated request (AC-12).
 * Default DENY; an explicit matching deny overrides any matching allow;
 * a workspace/project mismatch, an unlisted command, or an unlisted path
 * operation each deny with a stable reason code. Performs no command
 * execution and no filesystem access — it only compares strings.
 */
export function authorizeExecutionCommand(
  request: ExecutionCommandRequest,
  policy: ExecutionAuthorizationPolicy,
): AuthorizationOutcome {
  if (request.workspaceId !== policy.workspaceId) {
    return deny(AuthorizationReasonCode.WORKSPACE_MISMATCH, `workspace '${request.workspaceId}' does not match the authorized workspace`)
  }
  if (request.projectId !== policy.projectId) {
    return deny(AuthorizationReasonCode.PROJECT_MISMATCH, `project '${request.projectId}' does not match the authorized project`)
  }

  const commandAllowed = policy.allowedCommands.some(
    entry => entry.commandId === request.command.commandId && entry.executable === request.command.executable,
  )
  if (!commandAllowed) {
    return deny(AuthorizationReasonCode.UNLISTED_COMMAND, `command '${request.command.commandId}' is not on the allowlist`)
  }

  const pathOutcome = pathDecision(request, policy)
  if (pathOutcome !== null) {
    return pathOutcome
  }

  return { decision: AuthorizationDecision.ALLOW, reasonCode: AuthorizationReasonCode.ALLOWED, message: 'request matches the authorized workspace, command and every declared path operation' }
}
