/**
 * Framework-independent, read-only GitHub adapter. This is the ONLY file
 * in the repository authorized to call the GitHub API, and it may only
 * ever call `GET /repos/{owner}/{repo}` against the fixed origin below —
 * there is no path in this module that accepts a caller-supplied host or
 * a non-GET method (NDERCC-11 / DEC-RIC-001).
 *
 * Uses Node's native stable `fetch` — no HTTP client dependency.
 *
 * External-error policy (single documented policy, applied by every
 * caller of this adapter — see apps/web/server/utils/github-error-mapping.ts
 * for the HTTP-status translation):
 *   - GitHubValidationError: malformed owner/repository input — never
 *     reaches the network.
 *   - GitHubNotFoundError: GitHub responded 404 (repository doesn't exist
 *     OR isn't accessible to us — GitHub itself doesn't distinguish these
 *     to avoid leaking private-repo existence, and neither do we).
 *   - GitHubAuthError: GitHub responded 401, or 403 for a reason other
 *     than rate limiting.
 *   - GitHubRateLimitError: GitHub responded 403 with a rate-limit
 *     signal (`x-ratelimit-remaining: 0`).
 *   - GitHubTimeoutError: the request was aborted by the deterministic
 *     timeout below.
 *   - GitHubUpstreamError: any other non-2xx status, or a network
 *     failure reaching GitHub at all.
 *   - GitHubMalformedResponseError: GitHub responded 2xx but the body
 *     didn't narrow into the expected shape.
 *   - GitHubCredentialMissingError: `requireAuthentication` was
 *     requested but no token was supplied — this check happens before
 *     any network call.
 */
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
import { normalizeRawGitHubApiResponse } from './normalize-repository.js'
import type { GitHubAccessMode, NormalizedGitHubRepository } from './types.js'
import { isValidGitHubOwner, isValidGitHubRepositoryName } from './validate-repository-identifier.js'

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const DEFAULT_TIMEOUT_MS = 8000

export interface VerifyGitHubRepositoryOptions {
  owner: string
  repository: string
  token?: string
  requireAuthentication?: boolean
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

function buildRequestHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'rick-control-center',
  }
  if (token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function resolveAccessMode(token: string | undefined): GitHubAccessMode {
  return token !== undefined ? 'AUTHENTICATED' : 'PUBLIC_READ'
}

async function performRequest(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetchImpl(url, { method: 'GET', headers, signal: controller.signal })
  }
  catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GitHubTimeoutError()
    }
    throw new GitHubUpstreamError(0, 'Unable to reach GitHub.')
  }
  finally {
    clearTimeout(timer)
  }
}

function isRateLimited(status: number, headers: Headers): boolean {
  return status === 403 && headers.get('x-ratelimit-remaining') === '0'
}

function throwForErrorStatus(status: number, headers: Headers): never {
  if (status === 404) {
    throw new GitHubNotFoundError()
  }
  if (status === 401) {
    throw new GitHubAuthError()
  }
  if (isRateLimited(status, headers)) {
    throw new GitHubRateLimitError()
  }
  if (status === 403) {
    throw new GitHubAuthError('GitHub denied access to this repository.')
  }
  throw new GitHubUpstreamError(status)
}

/**
 * Verify a single repository's identity, default branch, visibility, and
 * (when authenticated) permissions via `GET /repos/{owner}/{repo}`.
 */
export async function verifyGitHubRepository(
  options: VerifyGitHubRepositoryOptions,
): Promise<NormalizedGitHubRepository> {
  if (!isValidGitHubOwner(options.owner) || !isValidGitHubRepositoryName(options.repository)) {
    throw new GitHubValidationError('Invalid GitHub owner or repository name.')
  }
  if (options.requireAuthentication === true && options.token === undefined) {
    throw new GitHubCredentialMissingError()
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const url = `${GITHUB_API_ORIGIN}/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repository)}`
  const headers = buildRequestHeaders(options.token)

  const response = await performRequest(url, headers, timeoutMs, fetchImpl)

  if (!response.ok) {
    throwForErrorStatus(response.status, response.headers)
  }

  let body: unknown
  try {
    body = await response.json()
  }
  catch {
    throw new GitHubMalformedResponseError()
  }

  return normalizeRawGitHubApiResponse(body, resolveAccessMode(options.token))
}
