/**
 * GAP-04 structured authorization tests (AC-12).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AuthorizationDecision,
  AuthorizationReasonCode,
  authorizeExecutionCommand,
  parseExecutionCommandRequest,
  PathAccessMode,
  validatePathDeclaration,
} from './execution-contract-authorization.js'
import type { ExecutionAuthorizationPolicy, ExecutionCommandRequest } from './execution-contract-authorization.js'

function policy(): ExecutionAuthorizationPolicy {
  return {
    workspaceId: 'workspace-1',
    projectId: 'project-rcc',
    allowedCommands: [{ commandId: 'run-tests', executable: 'pnpm', args: ['test'] }],
    allowedWorkingDirectories: ['packages/domain'],
    allowedPaths: [{ path: 'packages/domain/src', accessMode: PathAccessMode.READ }],
    deniedPaths: [{ path: 'packages/domain/src/secrets.ts', accessMode: PathAccessMode.WRITE }],
  }
}

function request(): ExecutionCommandRequest {
  return {
    workspaceId: 'workspace-1',
    projectId: 'project-rcc',
    command: { commandId: 'run-tests', executable: 'pnpm', args: ['test'] },
    workingDirectory: 'packages/domain',
    paths: [{ path: 'packages/domain/src', accessMode: PathAccessMode.READ }],
  }
}

describe('layer A: structural path validation', () => {
  it.each([
    ['/absolute/path'],
    ['C:/drive/prefixed'],
    ['C:\\drive\\prefixed'],
    ['//unc/share'],
    ['\\\\unc\\share'],
    ['a/../b'],
    ['a//b'],
    ['a\0b'],
    [' leading-space'],
  ])('rejects %s', (input) => {
    expect(validatePathDeclaration(input, 'field').ok).toBe(false)
  })

  it('accepts a workspace-relative forward-slash path', () => {
    expect(validatePathDeclaration('packages/domain/src/index.ts', 'field')).toEqual({ ok: true, value: 'packages/domain/src/index.ts' })
  })

  it('parses a well-formed request', () => {
    expect(parseExecutionCommandRequest(request()).ok).toBe(true)
  })

  it('rejects a request with an unsafe path lexically, before any authorization decision', () => {
    const malformed = { ...request(), paths: [{ path: '../escape', accessMode: PathAccessMode.READ }] }
    expect(parseExecutionCommandRequest(malformed).ok).toBe(false)
  })

  it('rejects a malformed access mode', () => {
    const malformed = { ...request(), paths: [{ path: 'a', accessMode: 'EXECUTE' }] }
    expect(parseExecutionCommandRequest(malformed).ok).toBe(false)
  })
})

describe('layer B: pure deterministic authorization', () => {
  it('defaults to DENY for a path operation absent from both lists', () => {
    const outcome = authorizeExecutionCommand({ ...request(), paths: [{ path: 'unlisted/path', accessMode: PathAccessMode.READ }] }, policy())
    expect(outcome.decision).toBe(AuthorizationDecision.DENY)
    expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNLISTED_PATH_OPERATION)
  })

  it('an explicit deny overrides a matching allow', () => {
    const conflictingPolicy: ExecutionAuthorizationPolicy = {
      ...policy(),
      allowedPaths: [...policy().allowedPaths, { path: 'packages/domain/src/secrets.ts', accessMode: PathAccessMode.WRITE }],
    }
    const outcome = authorizeExecutionCommand(
      { ...request(), paths: [{ path: 'packages/domain/src/secrets.ts', accessMode: PathAccessMode.WRITE }] },
      conflictingPolicy,
    )
    expect(outcome.decision).toBe(AuthorizationDecision.DENY)
    expect(outcome.reasonCode).toBe(AuthorizationReasonCode.EXPLICIT_DENY)
  })

  it('denies an unlisted command', () => {
    const outcome = authorizeExecutionCommand({ ...request(), command: { commandId: 'rm', executable: 'rm', args: [] } }, policy())
    expect(outcome.decision).toBe(AuthorizationDecision.DENY)
    expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNLISTED_COMMAND)
  })

  describe('argument vector is bound exactly, not by prefix/substring (finding 1)', () => {
    it('allows the exact authorized argument vector', () => {
      const outcome = authorizeExecutionCommand(request(), policy())
      expect(outcome.decision).toBe(AuthorizationDecision.ALLOW)
    })

    it('denies a different argument in the same position', () => {
      const outcome = authorizeExecutionCommand(
        { ...request(), command: { ...request().command, args: ['publish'] } },
        policy(),
      )
      expect(outcome.decision).toBe(AuthorizationDecision.DENY)
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNAUTHORIZED_ARGUMENTS)
    })

    it('denies an additional argument appended to an otherwise-authorized vector', () => {
      const outcome = authorizeExecutionCommand(
        { ...request(), command: { ...request().command, args: ['test', '--force'] } },
        policy(),
      )
      expect(outcome.decision).toBe(AuthorizationDecision.DENY)
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNAUTHORIZED_ARGUMENTS)
    })

    it('denies a missing argument from an otherwise-authorized vector', () => {
      const multiArgPolicy: ExecutionAuthorizationPolicy = {
        ...policy(),
        allowedCommands: [{ commandId: 'run-tests', executable: 'pnpm', args: ['test', '--run'] }],
      }
      const outcome = authorizeExecutionCommand(
        { ...request(), command: { ...request().command, args: ['test'] } },
        multiArgPolicy,
      )
      expect(outcome.decision).toBe(AuthorizationDecision.DENY)
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNAUTHORIZED_ARGUMENTS)
    })

    it('denies the same arguments in a different order, because order changes command semantics', () => {
      const multiArgPolicy: ExecutionAuthorizationPolicy = {
        ...policy(),
        allowedCommands: [{ commandId: 'run-tests', executable: 'pnpm', args: ['--filter', '@rick/domain', 'test'] }],
      }
      const outcome = authorizeExecutionCommand(
        { ...request(), command: { ...request().command, args: ['test', '--filter', '@rick/domain'] } },
        multiArgPolicy,
      )
      expect(outcome.decision).toBe(AuthorizationDecision.DENY)
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNAUTHORIZED_ARGUMENTS)
    })

    it('still denies via UNLISTED_COMMAND, not UNAUTHORIZED_ARGUMENTS, when the identity itself is unlisted', () => {
      const outcome = authorizeExecutionCommand(
        { ...request(), command: { commandId: 'publish', executable: 'pnpm', args: ['test'] } },
        policy(),
      )
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNLISTED_COMMAND)
    })
  })

  describe('working directory is authorized explicitly (finding 2)', () => {
    it('allows a request from an authorized working directory', () => {
      const outcome = authorizeExecutionCommand(request(), policy())
      expect(outcome.decision).toBe(AuthorizationDecision.ALLOW)
    })

    it('denies a lexically valid but unauthorized working directory', () => {
      const outcome = authorizeExecutionCommand({ ...request(), workingDirectory: 'packages/database' }, policy())
      expect(outcome.decision).toBe(AuthorizationDecision.DENY)
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.UNAUTHORIZED_WORKING_DIRECTORY)
    })

    it('a workspace mismatch is still reported as WORKSPACE_MISMATCH, not UNAUTHORIZED_WORKING_DIRECTORY', () => {
      const outcome = authorizeExecutionCommand({ ...request(), workspaceId: 'other-workspace' }, policy())
      expect(outcome.reasonCode).toBe(AuthorizationReasonCode.WORKSPACE_MISMATCH)
    })

    it('a malformed working directory is rejected at structural validation, before authorization ever runs', () => {
      const malformed = { ...request(), workingDirectory: '../escape' }
      expect(parseExecutionCommandRequest(malformed).ok).toBe(false)
    })
  })

  it('denies a workspace mismatch', () => {
    const outcome = authorizeExecutionCommand({ ...request(), workspaceId: 'other-workspace' }, policy())
    expect(outcome.decision).toBe(AuthorizationDecision.DENY)
    expect(outcome.reasonCode).toBe(AuthorizationReasonCode.WORKSPACE_MISMATCH)
  })

  it('denies a project mismatch', () => {
    const outcome = authorizeExecutionCommand({ ...request(), projectId: 'other-project' }, policy())
    expect(outcome.decision).toBe(AuthorizationDecision.DENY)
    expect(outcome.reasonCode).toBe(AuthorizationReasonCode.PROJECT_MISMATCH)
  })

  it('allows a request matching workspace, project, command and every path operation', () => {
    const outcome = authorizeExecutionCommand(request(), policy())
    expect(outcome.decision).toBe(AuthorizationDecision.ALLOW)
  })

  it('is deterministic for identical inputs', () => {
    const first = authorizeExecutionCommand(request(), policy())
    const second = authorizeExecutionCommand(request(), policy())
    expect(first).toEqual(second)
  })

  it('does not mutate its inputs', () => {
    const req = request()
    const pol = policy()
    const reqSnapshot = structuredClone(req)
    const polSnapshot = structuredClone(pol)

    authorizeExecutionCommand(req, pol)

    expect(req).toEqual(reqSnapshot)
    expect(pol).toEqual(polSnapshot)
  })
})

describe('AC-12: no runtime executor or filesystem API is invoked by this module', () => {
  it('imports nothing from node:child_process, node:fs or node:fs/promises', () => {
    const modulePath = fileURLToPath(new URL('./execution-contract-authorization.ts', import.meta.url))
    const source = readFileSync(modulePath, 'utf8')

    expect(source).not.toMatch(/from\s+['"]node:child_process['"]/)
    expect(source).not.toMatch(/from\s+['"]node:fs(\/promises)?['"]/)
    expect(source).not.toMatch(/require\(\s*['"](node:)?(child_process|fs)['"]\s*\)/)
  })
})
