import { describe, expect, it } from 'vitest'
import { isPublicPath } from '../../server/utils/public-paths'

describe('isPublicPath', () => {
  it('treats /login as public', () => {
    expect(isPublicPath('/login')).toBe(true)
  })

  it('treats the auth endpoints as public', () => {
    expect(isPublicPath('/api/auth/login')).toBe(true)
    expect(isPublicPath('/api/auth/logout')).toBe(true)
  })

  it('treats framework assets and public static files as public', () => {
    expect(isPublicPath('/_nuxt/entry.js')).toBe(true)
    expect(isPublicPath('/favicon.ico')).toBe(true)
    expect(isPublicPath('/robots.txt')).toBe(true)
  })

  it('treats the home page and other API routes as protected', () => {
    expect(isPublicPath('/')).toBe(false)
    expect(isPublicPath('/api/projects')).toBe(false)
  })

  it('does not treat a lookalike path as public', () => {
    expect(isPublicPath('/login-not-really')).toBe(false)
    expect(isPublicPath('/api/auth/login/extra')).toBe(false)
  })
})
