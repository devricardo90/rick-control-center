import { describe, expect, it } from 'vitest'
import { parseCreateProjectInput } from '../../server/utils/parse-project-input'

describe('parseCreateProjectInput', () => {
  it('accepts a minimal well-formed body', () => {
    const result = parseCreateProjectInput({ key: 'proj-x', name: 'Project X' })

    expect(result).toEqual({ key: 'proj-x', name: 'Project X' })
  })

  it('accepts optional fields when valid', () => {
    const result = parseCreateProjectInput({
      key: 'proj-x',
      name: 'Project X',
      description: 'A test project',
      autonomyPolicy: 'SUPERVISED',
      defaultBranchPolicy: 'DIRECT_COMMIT',
      workspacePath: '/tmp/proj-x',
    })

    expect(result).toEqual({
      key: 'proj-x',
      name: 'Project X',
      description: 'A test project',
      autonomyPolicy: 'SUPERVISED',
      defaultBranchPolicy: 'DIRECT_COMMIT',
      workspacePath: '/tmp/proj-x',
    })
  })

  it('rejects null, non-object, and array bodies', () => {
    expect(parseCreateProjectInput(null)).toBeNull()
    expect(parseCreateProjectInput('not-an-object')).toBeNull()
    expect(parseCreateProjectInput(42)).toBeNull()
  })

  it('rejects a body missing key or name', () => {
    expect(parseCreateProjectInput({ name: 'Project X' })).toBeNull()
    expect(parseCreateProjectInput({ key: 'proj-x' })).toBeNull()
    expect(parseCreateProjectInput({})).toBeNull()
  })

  it('rejects empty-string or non-string key/name', () => {
    expect(parseCreateProjectInput({ key: '', name: 'Project X' })).toBeNull()
    expect(parseCreateProjectInput({ key: 'proj-x', name: '' })).toBeNull()
    expect(parseCreateProjectInput({ key: 123, name: 'Project X' })).toBeNull()
  })

  it('rejects a non-string description or workspacePath when provided', () => {
    expect(parseCreateProjectInput({ key: 'proj-x', name: 'Project X', description: 42 })).toBeNull()
    expect(parseCreateProjectInput({ key: 'proj-x', name: 'Project X', workspacePath: 42 })).toBeNull()
  })

  it('rejects an autonomyPolicy or defaultBranchPolicy outside the known enum values', () => {
    expect(
      parseCreateProjectInput({ key: 'proj-x', name: 'Project X', autonomyPolicy: 'NOT_A_REAL_POLICY' }),
    ).toBeNull()
    expect(
      parseCreateProjectInput({ key: 'proj-x', name: 'Project X', defaultBranchPolicy: 'NOT_A_REAL_POLICY' }),
    ).toBeNull()
  })

  it('does not leak extra fields through', () => {
    const result = parseCreateProjectInput({
      key: 'proj-x',
      name: 'Project X',
      status: 'ARCHIVED',
      id: 'attacker-supplied-id',
    })

    expect(result).toEqual({ key: 'proj-x', name: 'Project X' })
  })
})
