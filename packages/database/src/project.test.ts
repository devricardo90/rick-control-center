/**
 * Integration tests for the Project persistence surface.
 *
 * Runs against a real, disposable local PostgreSQL instance — uniqueness
 * enforcement is a database constraint that a mock cannot prove.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { ArchivedProjectReadOnlyError, DuplicateProjectKeyError, InvalidProjectTransitionError, ProjectNotFoundError } from './errors.js'
import {
  createProject,
  findProjectById,
  findProjectByKey,
  listProjects,
  transitionProjectLifecycle,
  updateProjectSettings,
} from './project.js'
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

describe('updateProjectSettings', () => {
  it('updates editable settings and leaves unset fields untouched', async () => {
    const created = await createProject(client, {
      key: uniqueSlug('proj-update'),
      name: 'Original Name',
      description: 'Original description',
      workspacePath: '/tmp/original',
    })

    const updated = await updateProjectSettings(client, created.id, {
      name: 'Updated Name',
      autonomyPolicy: 'SUPERVISED',
    })

    expect(updated.name).toBe('Updated Name')
    expect(updated.autonomyPolicy).toBe('SUPERVISED')
    expect(updated.description).toBe('Original description')
    expect(updated.workspacePath).toBe('/tmp/original')
    expect(updated.defaultBranchPolicy).toBe('BRANCH_PER_TASK')
  })

  it('explicitly clears description when given null', async () => {
    const created = await createProject(client, {
      key: uniqueSlug('proj-clear-desc'),
      name: 'Has Description',
      description: 'Will be cleared',
    })

    const updated = await updateProjectSettings(client, created.id, { name: 'Has Description', description: null })

    expect(updated.description).toBeNull()
  })

  it('explicitly clears workspacePath when given null', async () => {
    const created = await createProject(client, {
      key: uniqueSlug('proj-clear-path'),
      name: 'Has Path',
      workspacePath: '/tmp/will-be-cleared',
    })

    const updated = await updateProjectSettings(client, created.id, { name: 'Has Path', workspacePath: null })

    expect(updated.workspacePath).toBeNull()
  })

  it('ignores an attempted key change — key has no update path', async () => {
    const key = uniqueSlug('proj-immutable-key')
    const created = await createProject(client, { key, name: 'Immutable Key Project' })

    // UpdateProjectSettingsInput has no `key` field at the type level —
    // this proves that even a raw object carrying one (as an HTTP layer
    // might forward before validation) cannot change it, because nothing
    // downstream of the type ever reads it.
    const attemptedInput = { name: 'Renamed', key: uniqueSlug('attempted-new-key') }
    const updated = await updateProjectSettings(client, created.id, attemptedInput)

    expect(updated.key).toBe(key)
    expect(updated.name).toBe('Renamed')
  })

  it('rejects updating a non-existent project', async () => {
    await expect(
      updateProjectSettings(client, '00000000-0000-0000-0000-000000000000', { name: 'Nobody' }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('rejects updating an archived project', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-archived-edit'), name: 'To Archive' })
    await transitionProjectLifecycle(client, created.id, 'ARCHIVE')

    await expect(
      updateProjectSettings(client, created.id, { name: 'Should not apply' }),
    ).rejects.toBeInstanceOf(ArchivedProjectReadOnlyError)
  })
})

describe('transitionProjectLifecycle — allowed transitions', () => {
  it('transitions ACTIVE to PAUSED', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-pause'), name: 'Pausable' })

    const paused = await transitionProjectLifecycle(client, created.id, 'PAUSE')

    expect(paused.status).toBe('PAUSED')
    expect(paused.archivedAt).toBeNull()
  })

  it('transitions PAUSED to ACTIVE', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-reactivate'), name: 'Reactivatable' })
    await transitionProjectLifecycle(client, created.id, 'PAUSE')

    const reactivated = await transitionProjectLifecycle(client, created.id, 'REACTIVATE')

    expect(reactivated.status).toBe('ACTIVE')
  })

  it('transitions ACTIVE to ARCHIVED, setting status and archivedAt atomically', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-archive-active'), name: 'Archive From Active' })
    expect(created.archivedAt).toBeNull()

    const archived = await transitionProjectLifecycle(client, created.id, 'ARCHIVE')

    expect(archived.status).toBe('ARCHIVED')
    expect(archived.archivedAt).not.toBeNull()

    // Re-read independently of the returned value to prove the two
    // fields are consistent as persisted, not just in the in-memory
    // response of the update call itself.
    const reloaded = await findProjectById(client, created.id)
    expect(reloaded?.status).toBe('ARCHIVED')
    expect(reloaded?.archivedAt).not.toBeNull()
  })

  it('transitions PAUSED to ARCHIVED, setting status and archivedAt atomically', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-archive-paused'), name: 'Archive From Paused' })
    await transitionProjectLifecycle(client, created.id, 'PAUSE')

    const archived = await transitionProjectLifecycle(client, created.id, 'ARCHIVE')

    expect(archived.status).toBe('ARCHIVED')
    expect(archived.archivedAt).not.toBeNull()
  })

  it('archivedAt remains null for non-archiving transitions', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-no-archivedat'), name: 'Not Archived' })

    const paused = await transitionProjectLifecycle(client, created.id, 'PAUSE')
    expect(paused.archivedAt).toBeNull()

    const reactivated = await transitionProjectLifecycle(client, created.id, 'REACTIVATE')
    expect(reactivated.archivedAt).toBeNull()
  })
})

describe('transitionProjectLifecycle — rejected transitions', () => {
  it('rejects any transition requested against an already-archived project', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-archived-terminal'), name: 'Terminal' })
    await transitionProjectLifecycle(client, created.id, 'ARCHIVE')

    await expect(transitionProjectLifecycle(client, created.id, 'PAUSE')).rejects.toBeInstanceOf(InvalidProjectTransitionError)
    await expect(transitionProjectLifecycle(client, created.id, 'REACTIVATE')).rejects.toBeInstanceOf(InvalidProjectTransitionError)
    await expect(transitionProjectLifecycle(client, created.id, 'ARCHIVE')).rejects.toBeInstanceOf(InvalidProjectTransitionError)
  })

  it('rejects an invalid transition that does not apply from the current status', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-invalid-transition'), name: 'Invalid' })

    // ACTIVE has no REACTIVATE transition, and PAUSE-while-already-PAUSED
    // is likewise not in the transition table — both are rejected the
    // same way, without a special "no-op" case.
    await expect(transitionProjectLifecycle(client, created.id, 'REACTIVATE')).rejects.toBeInstanceOf(InvalidProjectTransitionError)

    await transitionProjectLifecycle(client, created.id, 'PAUSE')
    await expect(transitionProjectLifecycle(client, created.id, 'PAUSE')).rejects.toBeInstanceOf(InvalidProjectTransitionError)
  })

  it('does not mutate the row when a transition is rejected', async () => {
    const created = await createProject(client, { key: uniqueSlug('proj-no-partial'), name: 'No Partial Update' })

    await expect(transitionProjectLifecycle(client, created.id, 'REACTIVATE')).rejects.toBeInstanceOf(InvalidProjectTransitionError)

    const reloaded = await findProjectById(client, created.id)
    expect(reloaded?.status).toBe('ACTIVE')
    expect(reloaded?.archivedAt).toBeNull()
  })

  it('rejects transitioning a non-existent project', async () => {
    await expect(
      transitionProjectLifecycle(client, '00000000-0000-0000-0000-000000000000', 'PAUSE'),
    ).rejects.toBeInstanceOf(ProjectNotFoundError)
  })
})
