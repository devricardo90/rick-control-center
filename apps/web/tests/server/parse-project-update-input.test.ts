import { describe, expect, it } from 'vitest'
import { parseUpdateProjectSettingsInput } from '../../server/utils/parse-project-update-input'

describe('parseUpdateProjectSettingsInput — acceptance', () => {
  it('accepts a minimal well-formed body with only name', () => {
    expect(parseUpdateProjectSettingsInput({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
  })

  it('accepts all editable fields when valid', () => {
    const result = parseUpdateProjectSettingsInput({
      name: 'Renamed',
      description: 'New description',
      autonomyPolicy: 'SUPERVISED',
      defaultBranchPolicy: 'DIRECT_COMMIT',
      workspacePath: '/tmp/renamed',
    })

    expect(result).toEqual({
      name: 'Renamed',
      description: 'New description',
      autonomyPolicy: 'SUPERVISED',
      defaultBranchPolicy: 'DIRECT_COMMIT',
      workspacePath: '/tmp/renamed',
    })
  })

  it('omits description/workspacePath from the result when absent from the body (leave-untouched semantics)', () => {
    const result = parseUpdateProjectSettingsInput({ name: 'X' })

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('description')
    expect(result).not.toHaveProperty('workspacePath')
  })
})

describe('parseUpdateProjectSettingsInput — rejection', () => {
  it('rejects null, non-object, and array bodies', () => {
    expect(parseUpdateProjectSettingsInput(null)).toBeNull()
    expect(parseUpdateProjectSettingsInput('not-an-object')).toBeNull()
    expect(parseUpdateProjectSettingsInput(42)).toBeNull()
  })

  it('rejects a missing or empty name', () => {
    expect(parseUpdateProjectSettingsInput({})).toBeNull()
    expect(parseUpdateProjectSettingsInput({ name: '' })).toBeNull()
    expect(parseUpdateProjectSettingsInput({ name: 123 })).toBeNull()
  })

  it('rejects an autonomyPolicy or defaultBranchPolicy outside the known enum values', () => {
    expect(parseUpdateProjectSettingsInput({ name: 'X', autonomyPolicy: 'NOT_REAL' })).toBeNull()
    expect(parseUpdateProjectSettingsInput({ name: 'X', defaultBranchPolicy: 'NOT_REAL' })).toBeNull()
  })
})

describe('parseUpdateProjectSettingsInput — clearing and immutable-field semantics', () => {
  it('normalizes an empty-string description to an explicit clear (null)', () => {
    expect(parseUpdateProjectSettingsInput({ name: 'X', description: '' })).toEqual({
      name: 'X',
      description: null,
    })
  })

  it('normalizes an empty-string workspacePath to an explicit clear (null)', () => {
    expect(parseUpdateProjectSettingsInput({ name: 'X', workspacePath: '' })).toEqual({
      name: 'X',
      workspacePath: null,
    })
  })

  it('passes an explicit null through unchanged for description and workspacePath', () => {
    expect(parseUpdateProjectSettingsInput({ name: 'X', description: null, workspacePath: null })).toEqual({
      name: 'X',
      description: null,
      workspacePath: null,
    })
  })

  it('ignores an attempted key change — key is never read from the body', () => {
    const result = parseUpdateProjectSettingsInput({ name: 'X', key: 'attacker-supplied-key' })

    expect(result).toEqual({ name: 'X' })
    expect(result).not.toHaveProperty('key')
  })

  it('does not leak other non-editable fields through (id, status, createdAt, archivedAt)', () => {
    const result = parseUpdateProjectSettingsInput({
      name: 'X',
      id: 'attacker-supplied-id',
      status: 'ARCHIVED',
      createdAt: '2020-01-01T00:00:00.000Z',
      archivedAt: '2020-01-01T00:00:00.000Z',
    })

    expect(result).toEqual({ name: 'X' })
  })
})
