/**
 * Integration tests for the Project persistence surface.
 *
 * Runs against a real, disposable local PostgreSQL instance — uniqueness
 * enforcement is a database constraint that a mock cannot prove.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { DuplicateProjectKeyError } from './errors.js'
import { createProject, findProjectById, findProjectByKey, listProjects } from './project.js'
import { createTestClient, uniqueSlug } from './test-support.js'

const client = createTestClient()

afterAll(async () => {
  await client.$disconnect()
})

describe('Project persistence', () => {
  it('creates a project with the default status, autonomy policy and branch policy', async () => {
    const key = uniqueSlug('proj-create')
    const project = await createProject(client, { key, name: 'Test Project' })

    expect(project.key).toBe(key)
    expect(project.status).toBe('ACTIVE')
    expect(project.autonomyPolicy).toBe('CONTROLLED_AUTONOMOUS')
    expect(project.defaultBranchPolicy).toBe('BRANCH_PER_TASK')
    expect(project.archivedAt).toBeNull()
  })

  it('accepts an explicit status, autonomy policy and branch policy', async () => {
    const key = uniqueSlug('proj-explicit')
    const project = await createProject(client, {
      key,
      name: 'Explicit Policy Project',
      status: 'PAUSED',
      autonomyPolicy: 'SUPERVISED',
      defaultBranchPolicy: 'DIRECT_COMMIT',
    })

    expect(project.status).toBe('PAUSED')
    expect(project.autonomyPolicy).toBe('SUPERVISED')
    expect(project.defaultBranchPolicy).toBe('DIRECT_COMMIT')
  })

  it('finds a project by id', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-by-id'), name: 'By Id' })
    const found = await findProjectById(client, created.id)

    expect(found?.id).toBe(created.id)
  })

  it('finds a project by key', async () => {
    const key = uniqueSlug('proj-by-key')
    await createProject(client, { key, name: 'By Key' })
    const found = await findProjectByKey(client, key)

    expect(found?.key).toBe(key)
  })

  it('returns null for a non-existent project id', async () => {
    expect(await findProjectById(client, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('returns null for a non-existent project key', async () => {
    expect(await findProjectByKey(client, uniqueSlug('does-not-exist'))).toBeNull()
  })

  it('lists projects including newly created ones', async () => {
    const keyA = uniqueSlug('proj-list-a')
    const keyB = uniqueSlug('proj-list-b')
    await createProject(client, { key: keyA, name: 'List A' })
    await createProject(client, { key: keyB, name: 'List B' })

    const projects = await listProjects(client)
    const keys = projects.map(p => p.key)

    expect(keys).toContain(keyA)
    expect(keys).toContain(keyB)
  })

  it('rejects a duplicate project key at the database level', async () => {
    const key = uniqueSlug('proj-duplicate')
    await createProject(client, { key, name: 'Original' })

    await expect(
      createProject(client, { key, name: 'Duplicate' }),
    ).rejects.toBeInstanceOf(DuplicateProjectKeyError)
  })

  it('supports logical archival via archivedAt without deleting the row', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-archive'), name: 'Archivable' })

    const archived = await client.project.update({
      where: { id: created.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    })

    expect(archived.status).toBe('ARCHIVED')
    expect(archived.archivedAt).not.toBeNull()
    expect(await findProjectById(client, created.id)).not.toBeNull()
  })
})
