import { describe, expect, it } from 'vitest'
import type { IntegrationConnection } from '@rick/database'
import { toPublicGitHubConnection } from '../../server/utils/public-github-connection'

const VALID_CONFIG = {
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

function buildConnection(overrides: Partial<IntegrationConnection> = {}): IntegrationConnection {
  return {
    id: 'a1111111-1111-1111-1111-111111111111',
    projectId: 'b2222222-2222-2222-2222-222222222222',
    provider: 'GITHUB',
    displayName: 'devricardo90/rick-control-center',
    status: 'CONNECTED',
    externalAccountId: '123456',
    configurationEncrypted: null,
    configurationJson: VALID_CONFIG,
    lastVerifiedAt: new Date('2026-08-05T00:00:00.000Z'),
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    ...overrides,
  }
}

describe('toPublicGitHubConnection', () => {
  it('maps every public field, including the parsed configuration', () => {
    const publicConnection = toPublicGitHubConnection(buildConnection())

    expect(publicConnection).toEqual({
      id: 'a1111111-1111-1111-1111-111111111111',
      projectId: 'b2222222-2222-2222-2222-222222222222',
      displayName: 'devricardo90/rick-control-center',
      status: 'CONNECTED',
      externalAccountId: '123456',
      configuration: VALID_CONFIG,
      lastVerifiedAt: '2026-08-05T00:00:00.000Z',
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    })
  })

  it('never includes configurationEncrypted, even as a key, regardless of the underlying row', () => {
    const publicConnection = toPublicGitHubConnection(
      buildConnection({ configurationEncrypted: 'enc:v1:should-never-surface' }),
    )

    expect(Object.keys(publicConnection)).not.toContain('configurationEncrypted')
    expect(JSON.stringify(publicConnection)).not.toContain('should-never-surface')
  })

  it('returns configuration: null when the stored JSON does not parse as a valid GitHub configuration', () => {
    const publicConnection = toPublicGitHubConnection(buildConnection({ configurationJson: { garbage: true } }))

    expect(publicConnection.configuration).toBeNull()
  })

  it('returns lastVerifiedAt: null when the connection has never been successfully verified', () => {
    const publicConnection = toPublicGitHubConnection(buildConnection({ lastVerifiedAt: null, status: 'PENDING' }))

    expect(publicConnection.lastVerifiedAt).toBeNull()
  })

  it('never includes a token-shaped field anywhere in the serialized output', () => {
    const publicConnection = toPublicGitHubConnection(buildConnection())
    const serialized = JSON.stringify(publicConnection).toLowerCase()

    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('bearer')
  })
})
