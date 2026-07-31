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
import { ProjectNotFoundError } from './errors.js'
import {
  createIntegrationConnection,
  listIntegrationConnectionsByProject,
} from './integration-connection.js'
import { createProject } from './project.js'
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
