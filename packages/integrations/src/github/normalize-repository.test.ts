import { describe, expect, it } from 'vitest'
import { parseStoredGitHubConfiguration } from './normalize-repository.js'

const VALID_STORED_CONFIG = {
  externalId: '123456',
  owner: 'devricardo90',
  name: 'rick-control-center',
  fullName: 'devricardo90/rick-control-center',
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/devricardo90/rick-control-center',
  visibility: 'public',
  archived: false,
  accessMode: 'PUBLIC_READ',
  permissions: { read: true, push: false, admin: null },
}

describe('parseStoredGitHubConfiguration', () => {
  it('accepts a well-formed previously-stored configuration', () => {
    expect(parseStoredGitHubConfiguration(VALID_STORED_CONFIG)).toEqual(VALID_STORED_CONFIG)
  })

  it('returns null for null, non-object, or array values', () => {
    expect(parseStoredGitHubConfiguration(null)).toBeNull()
    expect(parseStoredGitHubConfiguration('not-an-object')).toBeNull()
    expect(parseStoredGitHubConfiguration(42)).toBeNull()
  })

  it('returns null when a required string field is missing', () => {
    const { fullName: _omit, ...incomplete } = VALID_STORED_CONFIG
    expect(parseStoredGitHubConfiguration(incomplete)).toBeNull()
  })

  it('returns null for an unrecognized accessMode', () => {
    expect(parseStoredGitHubConfiguration({ ...VALID_STORED_CONFIG, accessMode: 'SOMETHING_ELSE' })).toBeNull()
  })

  it('returns null for a malformed permissions object', () => {
    expect(parseStoredGitHubConfiguration({ ...VALID_STORED_CONFIG, permissions: { read: 'yes' } })).toBeNull()
  })
})
