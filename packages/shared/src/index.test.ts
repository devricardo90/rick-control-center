import { describe, expect, it } from 'vitest'
import { RICK_APP_NAME, RICK_VERSION, err, ok } from './index'

describe('@rick/shared', () => {
  describe('constants', () => {
    it('exports the correct app name', () => {
      expect(RICK_APP_NAME).toBe('RICK Control Center')
    })

    it('exports a semver version', () => {
      expect(RICK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })

  describe('Result helpers', () => {
    it('ok() creates a success result', () => {
      const result = ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(42)
      }
    })

    it('err() creates a failure result', () => {
      const result = err(new Error('failed'))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe('failed')
      }
    })

    it('ok and err are mutually exclusive', () => {
      const success = ok('data')
      const failure = err('problem')
      expect(success.ok).not.toBe(failure.ok)
    })
  })
})
