import { describe, expect, it } from 'vitest'
import type { Project } from '@rick/database'
import { toPublicProject } from '../../server/utils/public-project'

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'a1111111-1111-1111-1111-111111111111',
    key: 'proj-x',
    name: 'Project X',
    description: null,
    status: 'ACTIVE',
    autonomyPolicy: 'CONTROLLED_AUTONOMOUS',
    defaultBranchPolicy: 'BRANCH_PER_TASK',
    workspacePath: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  }
}

describe('toPublicProject', () => {
  it('maps every public field', () => {
    const project = buildProject({ description: 'A test project', workspacePath: '/tmp/proj-x' })

    expect(toPublicProject(project)).toEqual({
      id: project.id,
      key: project.key,
      name: project.name,
      description: 'A test project',
      status: 'ACTIVE',
      autonomyPolicy: 'CONTROLLED_AUTONOMOUS',
      defaultBranchPolicy: 'BRANCH_PER_TASK',
      workspacePath: '/tmp/proj-x',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })
  })

  it('never includes archivedAt or any field beyond the closed public shape', () => {
    const publicProject = toPublicProject(buildProject({ archivedAt: new Date('2026-08-02T00:00:00.000Z') }))

    expect(Object.keys(publicProject).sort()).toEqual(
      [
        'autonomyPolicy',
        'createdAt',
        'defaultBranchPolicy',
        'description',
        'id',
        'key',
        'name',
        'status',
        'updatedAt',
        'workspacePath',
      ].sort(),
    )
  })
})
