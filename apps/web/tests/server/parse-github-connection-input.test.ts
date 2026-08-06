import { describe, expect, it } from 'vitest'
import { parseConnectGitHubRepositoryInput } from '../../server/utils/parse-github-connection-input'

describe('parseConnectGitHubRepositoryInput — acceptance', () => {
  it('accepts a well-formed body', () => {
    expect(parseConnectGitHubRepositoryInput({ owner: 'devricardo90', repository: 'rick-control-center' })).toEqual({
      owner: 'devricardo90',
      repository: 'rick-control-center',
    })
  })
})

describe('parseConnectGitHubRepositoryInput — rejection', () => {
  it('rejects null, non-object, and array bodies', () => {
    expect(parseConnectGitHubRepositoryInput(null)).toBeNull()
    expect(parseConnectGitHubRepositoryInput('not-an-object')).toBeNull()
    expect(parseConnectGitHubRepositoryInput(42)).toBeNull()
  })

  it('rejects a missing or empty owner/repository', () => {
    expect(parseConnectGitHubRepositoryInput({})).toBeNull()
    expect(parseConnectGitHubRepositoryInput({ owner: 'devricardo90' })).toBeNull()
    expect(parseConnectGitHubRepositoryInput({ repository: 'rick-control-center' })).toBeNull()
    expect(parseConnectGitHubRepositoryInput({ owner: '', repository: 'x' })).toBeNull()
  })

  it('rejects non-string owner/repository', () => {
    expect(parseConnectGitHubRepositoryInput({ owner: 123, repository: 'x' })).toBeNull()
  })
})

describe('parseConnectGitHubRepositoryInput — credential boundary', () => {
  it('rejects a body containing a token field', () => {
    expect(
      parseConnectGitHubRepositoryInput({ owner: 'a', repository: 'b', token: 'ghp_fakeTokenValue' }),
    ).toBeNull()
  })

  it('rejects a body containing a credential field', () => {
    expect(
      parseConnectGitHubRepositoryInput({ owner: 'a', repository: 'b', credential: 'secret' }),
    ).toBeNull()
  })

  it('rejects a body containing an apiHost/host field (SSRF attempt)', () => {
    expect(
      parseConnectGitHubRepositoryInput({ owner: 'a', repository: 'b', apiHost: 'evil.example.com' }),
    ).toBeNull()
    expect(
      parseConnectGitHubRepositoryInput({ owner: 'a', repository: 'b', host: 'evil.example.com' }),
    ).toBeNull()
  })

  it('rejects a body containing a raw configuration/configurationEncrypted field', () => {
    expect(
      parseConnectGitHubRepositoryInput({ owner: 'a', repository: 'b', configuration: { anything: true } }),
    ).toBeNull()
    expect(
      parseConnectGitHubRepositoryInput({ owner: 'a', repository: 'b', configurationEncrypted: 'x' }),
    ).toBeNull()
  })
})
