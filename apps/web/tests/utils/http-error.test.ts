import { describe, expect, it } from 'vitest'
import { extractSafeErrorMessage } from '../../utils/http-error'

describe('extractSafeErrorMessage', () => {
  it('returns the statusMessage when present as a non-empty string', () => {
    expect(extractSafeErrorMessage({ statusMessage: 'A project with this key already exists.' }, 'fallback'))
      .toBe('A project with this key already exists.')
  })

  it('falls back for null, non-object, and array errors', () => {
    expect(extractSafeErrorMessage(null, 'fallback')).toBe('fallback')
    expect(extractSafeErrorMessage('raw string error', 'fallback')).toBe('fallback')
    expect(extractSafeErrorMessage(42, 'fallback')).toBe('fallback')
  })

  it('falls back when statusMessage is absent, empty, or not a string', () => {
    expect(extractSafeErrorMessage({}, 'fallback')).toBe('fallback')
    expect(extractSafeErrorMessage({ statusMessage: '' }, 'fallback')).toBe('fallback')
    expect(extractSafeErrorMessage({ statusMessage: 500 }, 'fallback')).toBe('fallback')
  })

  it('does not leak unrelated fields on the error object (e.g. stack, internal data)', () => {
    const errorWithInternalDetail = {
      statusMessage: 'Unable to create project.',
      stack: 'PrismaClientKnownRequestError: ...at internal/connection.ts:42',
      data: { sql: 'INSERT INTO operators ...' },
    }

    expect(extractSafeErrorMessage(errorWithInternalDetail, 'fallback')).toBe('Unable to create project.')
  })
})
