import { describe, expect, it } from 'vitest'
import { isSelectableProject } from '../../utils/is-selectable-project'

describe('isSelectableProject', () => {
  it('returns true for ACTIVE and PAUSED projects', () => {
    expect(isSelectableProject({ status: 'ACTIVE' })).toBe(true)
    expect(isSelectableProject({ status: 'PAUSED' })).toBe(true)
  })

  it('returns false for ARCHIVED projects — archived can never be the active selection', () => {
    expect(isSelectableProject({ status: 'ARCHIVED' })).toBe(false)
  })
})
