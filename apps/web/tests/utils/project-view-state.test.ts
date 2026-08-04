import { describe, expect, it } from 'vitest'
import { resolveProjectListViewState } from '../../utils/project-view-state'

describe('resolveProjectListViewState', () => {
  it('returns loading while pending, regardless of other flags', () => {
    expect(resolveProjectListViewState({ pending: true, hasError: false, projectCount: 0 })).toBe('loading')
    expect(resolveProjectListViewState({ pending: true, hasError: true, projectCount: 3 })).toBe('loading')
  })

  it('returns server-error when not pending but an error occurred', () => {
    expect(resolveProjectListViewState({ pending: false, hasError: true, projectCount: 0 })).toBe('server-error')
  })

  it('returns empty when not pending, no error, and no projects', () => {
    expect(resolveProjectListViewState({ pending: false, hasError: false, projectCount: 0 })).toBe('empty')
  })

  it('returns populated when not pending, no error, and at least one project', () => {
    expect(resolveProjectListViewState({ pending: false, hasError: false, projectCount: 1 })).toBe('populated')
  })
})
