import { describe, expect, it } from 'vitest'
import { findSelectedProject } from '../../utils/find-selected-project'

describe('findSelectedProject', () => {
  const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('returns null when no project is selected', () => {
    expect(findSelectedProject(projects, null)).toBeNull()
  })

  it('returns the matching project for a selected id', () => {
    expect(findSelectedProject(projects, 'b')).toEqual({ id: 'b' })
  })

  it('returns null when the selected id is not in the list (e.g. stale selection)', () => {
    expect(findSelectedProject(projects, 'does-not-exist')).toBeNull()
  })

  it('returns null against an empty list', () => {
    expect(findSelectedProject([], 'a')).toBeNull()
  })
})
