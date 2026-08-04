import { describe, expect, it } from 'vitest'
import { parseProjectLifecycleAction } from '../../server/utils/parse-project-lifecycle-input'

describe('parseProjectLifecycleAction', () => {
  it('accepts each of the three known actions', () => {
    expect(parseProjectLifecycleAction({ action: 'PAUSE' })).toBe('PAUSE')
    expect(parseProjectLifecycleAction({ action: 'REACTIVATE' })).toBe('REACTIVATE')
    expect(parseProjectLifecycleAction({ action: 'ARCHIVE' })).toBe('ARCHIVE')
  })

  it('rejects null, non-object, and array bodies', () => {
    expect(parseProjectLifecycleAction(null)).toBeNull()
    expect(parseProjectLifecycleAction('PAUSE')).toBeNull()
    expect(parseProjectLifecycleAction(42)).toBeNull()
  })

  it('rejects a missing action', () => {
    expect(parseProjectLifecycleAction({})).toBeNull()
  })

  it('rejects an unrecognized or lowercase action', () => {
    expect(parseProjectLifecycleAction({ action: 'DELETE' })).toBeNull()
    expect(parseProjectLifecycleAction({ action: 'pause' })).toBeNull()
    expect(parseProjectLifecycleAction({ action: 'UNARCHIVE' })).toBeNull()
  })

  it('rejects a non-string action', () => {
    expect(parseProjectLifecycleAction({ action: 1 })).toBeNull()
    expect(parseProjectLifecycleAction({ action: null })).toBeNull()
  })
})
