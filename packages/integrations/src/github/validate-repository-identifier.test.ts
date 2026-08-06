import { describe, expect, it } from 'vitest'
import { isValidGitHubOwner, isValidGitHubRepositoryName } from './validate-repository-identifier.js'

describe('isValidGitHubOwner', () => {
  it('accepts a well-formed owner', () => {
    expect(isValidGitHubOwner('devricardo90')).toBe(true)
    expect(isValidGitHubOwner('a')).toBe(true)
    expect(isValidGitHubOwner('a-b-c')).toBe(true)
  })

  it('rejects a slash (path injection)', () => {
    expect(isValidGitHubOwner('devricardo90/extra')).toBe(false)
  })

  it('rejects whitespace-only or embedded whitespace', () => {
    expect(isValidGitHubOwner('   ')).toBe(false)
    expect(isValidGitHubOwner('dev ricardo')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidGitHubOwner('')).toBe(false)
  })
})

describe('isValidGitHubRepositoryName', () => {
  it('accepts a well-formed repository name, including dots', () => {
    expect(isValidGitHubRepositoryName('rick-control-center')).toBe(true)
    expect(isValidGitHubRepositoryName('my.repo_name')).toBe(true)
  })

  it('rejects a slash (path injection)', () => {
    expect(isValidGitHubRepositoryName('owner/repo')).toBe(false)
  })

  it('rejects path traversal segments exactly', () => {
    expect(isValidGitHubRepositoryName('.')).toBe(false)
    expect(isValidGitHubRepositoryName('..')).toBe(false)
  })

  it('rejects whitespace-only or embedded whitespace', () => {
    expect(isValidGitHubRepositoryName('   ')).toBe(false)
    expect(isValidGitHubRepositoryName('my repo')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidGitHubRepositoryName('')).toBe(false)
  })
})
