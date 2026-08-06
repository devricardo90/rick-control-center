/**
 * Adapter unit tests — every test injects its own `fetchImpl`, so none of
 * this depends on live GitHub availability.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
import { describe, expect, it, vi } from 'vitest'
import { verifyGitHubRepository } from './client.js'
import {
  GitHubAuthError,
  GitHubCredentialMissingError,
  GitHubMalformedResponseError,
  GitHubNotFoundError,
  GitHubRateLimitError,
  GitHubTimeoutError,
  GitHubUpstreamError,
  GitHubValidationError,
} from './errors.js'

const VALID_REPOSITORY_PAYLOAD = {
  id: 123456,
  name: 'rick-control-center',
  full_name: 'devricardo90/rick-control-center',
  owner: { login: 'devricardo90' },
  default_branch: 'main',
  html_url: 'https://github.com/devricardo90/rick-control-center',
  private: false,
  archived: false,
  permissions: { pull: true, push: false, admin: false },
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init })
}

function errorResponse(status: number, headers?: Record<string, string>): Response {
  return new Response('{}', { status, ...(headers !== undefined ? { headers } : {}) })
}

describe('verifyGitHubRepository — input validation', () => {
  it('rejects an invalid owner without ever calling fetch', async () => {
    const fetchImpl = vi.fn()

    await expect(
      verifyGitHubRepository({ owner: 'not/valid', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubValidationError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an invalid repository name (path traversal) without ever calling fetch', async () => {
    const fetchImpl = vi.fn()

    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: '..', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubValidationError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects whitespace-only segments', async () => {
    const fetchImpl = vi.fn()

    await expect(
      verifyGitHubRepository({ owner: '   ', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubValidationError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws GitHubCredentialMissingError when authentication is required but no token is supplied, without calling fetch', async () => {
    const fetchImpl = vi.fn()

    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', requireAuthentication: true, fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubCredentialMissingError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('verifyGitHubRepository — request construction', () => {
  it('always targets the fixed https://api.github.com origin and the exact /repos/{owner}/{repo} path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_REPOSITORY_PAYLOAD))

    await verifyGitHubRepository({ owner: 'devricardo90', repository: 'rick-control-center', fetchImpl })

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/devricardo90/rick-control-center')
  })

  it('always uses GET, regardless of any option passed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_REPOSITORY_PAYLOAD))

    await verifyGitHubRepository({ owner: 'devricardo90', repository: 'rick-control-center', fetchImpl })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('GET')
  })

  it('sends no Authorization header on the public (no-token) path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_REPOSITORY_PAYLOAD))

    const result = await verifyGitHubRepository({ owner: 'devricardo90', repository: 'rick-control-center', fetchImpl })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(result.accessMode).toBe('PUBLIC_READ')
  })

  it('sends an Authorization: Bearer header only when a token is supplied, and reports AUTHENTICATED access', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_REPOSITORY_PAYLOAD))

    const result = await verifyGitHubRepository({
      owner: 'devricardo90',
      repository: 'rick-control-center',
      token: 'secret-token-value',
      fetchImpl,
    })

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer secret-token-value')
    expect(result.accessMode).toBe('AUTHENTICATED')
  })

  it('encodes owner/repository URL segments', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_REPOSITORY_PAYLOAD))

    // The validator normally rejects a dot-containing repo name only when
    // it collides with '.' or '..' exactly — a real dotted name is valid
    // GitHub syntax (e.g. "my.repo") and must be encoded, not rejected.
    await verifyGitHubRepository({ owner: 'devricardo90', repository: 'my.repo', fetchImpl })

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/devricardo90/my.repo')
  })
})

describe('verifyGitHubRepository — response normalization', () => {
  it('normalizes a valid response into the expected shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_REPOSITORY_PAYLOAD))

    const result = await verifyGitHubRepository({ owner: 'devricardo90', repository: 'rick-control-center', fetchImpl })

    expect(result).toEqual({
      externalId: '123456',
      owner: 'devricardo90',
      name: 'rick-control-center',
      fullName: 'devricardo90/rick-control-center',
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/devricardo90/rick-control-center',
      visibility: 'public',
      archived: false,
      accessMode: 'PUBLIC_READ',
      permissions: { read: true, push: false, admin: false },
    })
  })

  it('throws GitHubMalformedResponseError when a required field is missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: 'repo' }))

    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubMalformedResponseError)
  })

  it('throws GitHubMalformedResponseError when the body is not valid JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))

    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubMalformedResponseError)
  })

  it('defaults missing permissions to null rather than false', async () => {
    const { permissions: _omit, ...withoutPermissions } = VALID_REPOSITORY_PAYLOAD
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(withoutPermissions))

    const result = await verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl })

    expect(result.permissions).toEqual({ read: null, push: null, admin: null })
  })
})

describe('verifyGitHubRepository — error status mapping', () => {
  it('maps 404 to GitHubNotFoundError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(404))
    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'nope', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubNotFoundError)
  })

  it('maps 401 to GitHubAuthError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(401))
    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', token: 'bad', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubAuthError)
  })

  it('maps 403 with a rate-limit signal to GitHubRateLimitError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(403, { 'x-ratelimit-remaining': '0' }))
    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubRateLimitError)
  })

  it('maps a plain 403 (no rate-limit signal) to GitHubAuthError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(403))
    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubAuthError)
  })

  it('maps a 5xx response to GitHubUpstreamError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(503))
    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubUpstreamError)
  })

  it('maps a network failure reaching GitHub to GitHubUpstreamError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubUpstreamError)
  })
})

describe('verifyGitHubRepository — timeout', () => {
  it('aborts and throws GitHubTimeoutError when the request does not resolve within the timeout', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted.')
          abortError.name = 'AbortError'
          reject(abortError)
        })
      })
    }) as unknown as typeof fetch

    await expect(
      verifyGitHubRepository({ owner: 'devricardo90', repository: 'repo', timeoutMs: 20, fetchImpl }),
    ).rejects.toBeInstanceOf(GitHubTimeoutError)
  })
})
