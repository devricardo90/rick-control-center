import { describe, expect, it } from 'vitest'
import { parseLoginCredentials } from '../../server/utils/parse-login-credentials'

describe('parseLoginCredentials', () => {
  it('accepts a well-formed body', () => {
    const result = parseLoginCredentials({ username: 'operator', password: 'secret-value' })

    expect(result).toEqual({ username: 'operator', password: 'secret-value' })
  })

  it('rejects null, non-object, and array bodies', () => {
    expect(parseLoginCredentials(null)).toBeNull()
    expect(parseLoginCredentials('not-an-object')).toBeNull()
    expect(parseLoginCredentials(42)).toBeNull()
  })

  it('rejects a body missing username or password', () => {
    expect(parseLoginCredentials({ username: 'operator' })).toBeNull()
    expect(parseLoginCredentials({ password: 'secret-value' })).toBeNull()
    expect(parseLoginCredentials({})).toBeNull()
  })

  it('rejects empty-string or non-string username/password', () => {
    expect(parseLoginCredentials({ username: '', password: 'secret-value' })).toBeNull()
    expect(parseLoginCredentials({ username: 'operator', password: '' })).toBeNull()
    expect(parseLoginCredentials({ username: 123, password: 'secret-value' })).toBeNull()
  })

  it('does not leak extra fields through', () => {
    const result = parseLoginCredentials({
      username: 'operator',
      password: 'secret-value',
      admin: true,
    })

    expect(result).toEqual({ username: 'operator', password: 'secret-value' })
  })
})
