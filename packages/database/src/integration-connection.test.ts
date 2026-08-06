/**
 * Integration tests for the IntegrationConnection persistence surface.
 *
 * Runs against a real, disposable local PostgreSQL instance — foreign-key
 * integrity and delete-restrict behavior are database constraints that a
 * mock cannot prove.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { ArchivedProjectReadOnlyError, IntegrationConnectionNotFoundError, ProjectNotFoundError } from './errors.js'
import {
  createIntegrationConnection,
  findGitHubConnectionForProject,
  listGitHubConnectionsByProject,
  listIntegrationConnectionsByProject,
  markIntegrationConnectionError,
  upsertVerifiedIntegrationConnection,
} from './integration-connection.js'
import { createProject, transitionProjectLifecycle } from './project.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

describe('IntegrationConnection persistence', () => {
  it('creates an integration connection linked to an existing project', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-ic-create'), name: 'IC Owner' })

    const connection = await createIntegrationConnection(client, {
      projectId: project.id,
      provider: 'GITHUB',
      displayName: 'Primary GitHub',
    })

    expect(connection.projectId).toBe(project.id)
    expect(connection.provider).toBe('GITHUB')
    expect(connection.status).toBe('PENDING')
  })

  it('accepts an explicit status, external account id and encrypted configuration payload', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-ic-explicit'), name: 'IC Owner' })

    const connection = await createIntegrationConnection(client, {
      projectId: project.id,
      provider: 'JIRA',
      displayName: 'Jira Cloud',
      status: 'CONNECTED',
      externalAccountId: 'jira-account-123',
      configurationEncrypted: 'enc:v1:opaque-ciphertext-placeholder',
      lastVerifiedAt: new Date(),
    })

    expect(connection.status).toBe('CONNECTED')
    expect(connection.externalAccountId).toBe('jira-account-123')
    // The payload is stored verbatim — this package never encrypts, decrypts
    // or otherwise interprets it, so no plaintext secret is ever handled here.
    expect(connection.configurationEncrypted).toBe('enc:v1:opaque-ciphertext-placeholder')
  })

  it('lists integration connections scoped to their owning project', async () => {
    const projectA = await createProject(client, { key: uniqueSlug('proj-ic-list-a'), name: 'Owner A' })
    const projectB = await createProject(client, { key: uniqueSlug('proj-ic-list-b'), name: 'Owner B' })

    await createIntegrationConnection(client, {
      projectId: projectA.id,
      provider: 'GITHUB',
      displayName: 'A - GitHub',
    })
    await createIntegrationConnection(client, {
      projectId: projectA.id,
      provider: 'GOOGLE_DRIVE',
      displayName: 'A - Drive',
    })
    await createIntegrationConnection(client, {
      projectId: projectB.id,
      provider: 'AGENT_RUNTIME',
      displayName: 'B - Agent Runtime',
    })

    const connectionsForA = await listIntegrationConnectionsByProject(client, projectA.id)

    expect(connectionsForA).toHaveLength(2)
    expect(connectionsForA.every(c => c.projectId === projectA.id)).toBe(true)
  })

  it('rejects creation when the referenced project does not exist', async () => {
    await expect(
      createIntegrationConnection(client, {
        projectId: '00000000-0000-0000-0000-000000000000',
        provider: 'GITHUB',
        displayName: 'Orphan',
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('restricts deleting a project that still has integration connections', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-ic-restrict'), name: 'Restricted Owner' })
    await createIntegrationConnection(client, {
      projectId: project.id,
      provider: 'GITHUB',
      displayName: 'Blocking Connection',
    })

    await expect(client.project.delete({ where: { id: project.id } })).rejects.toSatisfy(
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003',
    )
  })
})

describe('upsertVerifiedIntegrationConnection — create and duplicate safety', () => {
  it('creates a new CONNECTED connection with the normalized configuration and no encrypted payload', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-create'), name: 'GH Owner' })
    const verifiedAt = new Date()

    const connection = await upsertVerifiedIntegrationConnection(client, {
      projectId: project.id,
      provider: 'GITHUB',
      displayName: 'devricardo90/rick-control-center',
      externalAccountId: '123456',
      configurationJson: { owner: 'devricardo90', name: 'rick-control-center' },
      verifiedAt,
    })

    expect(connection.status).toBe('CONNECTED')
    expect(connection.externalAccountId).toBe('123456')
    expect(connection.lastVerifiedAt?.getTime()).toBe(verifiedAt.getTime())
    expect(connection.configurationEncrypted).toBeNull()
  })

  it('is idempotent: connecting the same external repository twice updates the same row', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-idempotent'), name: 'GH Owner' })
    const base = { projectId: project.id, provider: 'GITHUB' as const, displayName: 'a/b', externalAccountId: '111' }

    const first = await upsertVerifiedIntegrationConnection(client, { ...base, configurationJson: { v: 1 }, verifiedAt: new Date() })
    const second = await upsertVerifiedIntegrationConnection(client, { ...base, configurationJson: { v: 2 }, verifiedAt: new Date() })

    expect(second.id).toBe(first.id)
    expect(await listGitHubConnectionsByProject(client, project.id)).toHaveLength(1)
  })

  it('allows more than one distinct repository connected to the same project', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-multi'), name: 'GH Owner' })
    const base = { projectId: project.id, provider: 'GITHUB' as const, configurationJson: {}, verifiedAt: new Date() }

    await upsertVerifiedIntegrationConnection(client, { ...base, displayName: 'a/b', externalAccountId: '111' })
    await upsertVerifiedIntegrationConnection(client, { ...base, displayName: 'c/d', externalAccountId: '222' })

    expect(await listGitHubConnectionsByProject(client, project.id)).toHaveLength(2)
  })

  it('isolates connections between projects — the same external repository id can connect independently to different projects', async () => {
    const projectA = await createProject(client, { key: uniqueSlug('proj-gh-iso-a'), name: 'A' })
    const projectB = await createProject(client, { key: uniqueSlug('proj-gh-iso-b'), name: 'B' })
    const shared = { provider: 'GITHUB' as const, displayName: 'a/b', externalAccountId: '999', configurationJson: {}, verifiedAt: new Date() }

    await upsertVerifiedIntegrationConnection(client, { ...shared, projectId: projectA.id })
    await upsertVerifiedIntegrationConnection(client, { ...shared, projectId: projectB.id })

    expect(await listGitHubConnectionsByProject(client, projectA.id)).toHaveLength(1)
    expect(await listGitHubConnectionsByProject(client, projectB.id)).toHaveLength(1)
  })
})

describe('upsertVerifiedIntegrationConnection — rejection and re-verification', () => {
  it('rejects connecting to a non-existent project', async () => {
    await expect(
      upsertVerifiedIntegrationConnection(client, {
        projectId: '00000000-0000-0000-0000-000000000000',
        provider: 'GITHUB',
        displayName: 'a/b',
        externalAccountId: '1',
        configurationJson: {},
        verifiedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('rejects connecting to an archived project', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-archived'), name: 'Archived Owner' })
    await transitionProjectLifecycle(client, project.id, 'ARCHIVE')

    await expect(
      upsertVerifiedIntegrationConnection(client, {
        projectId: project.id,
        provider: 'GITHUB',
        displayName: 'a/b',
        externalAccountId: '1',
        configurationJson: {},
        verifiedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })

  it('a successful re-verification (second upsert) advances lastVerifiedAt and the stored configuration', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-reverify'), name: 'GH Owner' })
    const base = { projectId: project.id, provider: 'GITHUB' as const, displayName: 'a/b', externalAccountId: '1' }
    const firstVerifiedAt = new Date('2026-01-01T00:00:00.000Z')
    const secondVerifiedAt = new Date('2026-01-02T00:00:00.000Z')

    await upsertVerifiedIntegrationConnection(client, { ...base, configurationJson: { defaultBranch: 'main' }, verifiedAt: firstVerifiedAt })
    const updated = await upsertVerifiedIntegrationConnection(client, { ...base, configurationJson: { defaultBranch: 'develop' }, verifiedAt: secondVerifiedAt })

    expect(updated.lastVerifiedAt?.getTime()).toBe(secondVerifiedAt.getTime())
    expect(updated.configurationJson).toEqual({ defaultBranch: 'develop' })
    expect(updated.status).toBe('CONNECTED')
  })
})

describe('findGitHubConnectionForProject', () => {
  it('finds a GitHub connection that belongs to the given project', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-find'), name: 'GH Owner' })
    const connection = await upsertVerifiedIntegrationConnection(client, {
      projectId: project.id,
      provider: 'GITHUB',
      displayName: 'a/b',
      externalAccountId: '1',
      configurationJson: {},
      verifiedAt: new Date(),
    })

    const found = await findGitHubConnectionForProject(client, project.id, connection.id)
    expect(found?.id).toBe(connection.id)
  })

  it('returns null for a connection id that belongs to a different project (isolation)', async () => {
    const projectA = await createProject(client, { key: uniqueSlug('proj-gh-find-iso-a'), name: 'A' })
    const projectB = await createProject(client, { key: uniqueSlug('proj-gh-find-iso-b'), name: 'B' })
    const connection = await upsertVerifiedIntegrationConnection(client, {
      projectId: projectA.id,
      provider: 'GITHUB',
      displayName: 'a/b',
      externalAccountId: '1',
      configurationJson: {},
      verifiedAt: new Date(),
    })

    expect(await findGitHubConnectionForProject(client, projectB.id, connection.id)).toBeNull()
  })

  it('returns null for a non-existent connection id', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-find-missing'), name: 'GH Owner' })
    expect(
      await findGitHubConnectionForProject(client, project.id, '00000000-0000-0000-0000-000000000000'),
    ).toBeNull()
  })
})

describe('markIntegrationConnectionError', () => {
  it('sets status ERROR without touching configurationJson or lastVerifiedAt — the last valid snapshot survives a failed re-verification', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-error'), name: 'GH Owner' })
    const verifiedAt = new Date('2026-01-01T00:00:00.000Z')
    const created = await upsertVerifiedIntegrationConnection(client, {
      projectId: project.id,
      provider: 'GITHUB',
      displayName: 'a/b',
      externalAccountId: '1',
      configurationJson: { defaultBranch: 'main' },
      verifiedAt,
    })

    const errored = await markIntegrationConnectionError(client, project.id, created.id)

    expect(errored.status).toBe('ERROR')
    expect(errored.configurationJson).toEqual({ defaultBranch: 'main' })
    expect(errored.lastVerifiedAt?.getTime()).toBe(verifiedAt.getTime())
  })

  it('rejects marking a connection that does not exist', async () => {
    const project = await createProject(client, { key: uniqueSlug('proj-gh-error-missing'), name: 'GH Owner' })

    await expect(
      markIntegrationConnectionError(client, project.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(IntegrationConnectionNotFoundError)
  })

  it('rejects marking a connection that belongs to a different project (isolation)', async () => {
    const projectA = await createProject(client, { key: uniqueSlug('proj-gh-error-iso-a'), name: 'A' })
    const projectB = await createProject(client, { key: uniqueSlug('proj-gh-error-iso-b'), name: 'B' })
    const connection = await upsertVerifiedIntegrationConnection(client, {
      projectId: projectA.id,
      provider: 'GITHUB',
      displayName: 'a/b',
      externalAccountId: '1',
      configurationJson: {},
      verifiedAt: new Date(),
    })

    await expect(
      markIntegrationConnectionError(client, projectB.id, connection.id),
    ).rejects.toBeInstanceOf(IntegrationConnectionNotFoundError)
  })
})
