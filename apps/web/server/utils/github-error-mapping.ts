/**
 * Single, centralized translation from typed GitHub adapter errors to
 * HTTP responses — used by every GitHub-integration route so the policy
 * is documented once and applied identically everywhere (NDERCC-11).
 *
 * Documented policy:
 *   - 400 (GitHubValidationError): malformed owner/repository input.
 *     Never reached the network.
 *   - 422 (GitHubNotFoundError): the repository doesn't exist or isn't
 *     accessible to us. GitHub itself returns 404 for both cases
 *     deliberately, to avoid leaking private-repository existence — we
 *     mirror that honestly rather than guessing which one applies.
 *   - 502 (GitHubMalformedResponseError): GitHub responded, but not in a
 *     shape we could parse. Distinct from 503 below because *a* response
 *     was received — the problem is what we did with it, not whether
 *     GitHub was reachable.
 *   - 503 (everything else adapter-side — auth, permission, rate limit,
 *     timeout, network/upstream failure, missing required credential):
 *     GitHub, or our ability to reach/authenticate to it, is not usable
 *     for this request right now. All temporary/environmental
 *     conditions, all handled the same way.
 *   - 500: anything unexpected and local; never a raw Prisma error,
 *     stack trace, or SQL.
 *
 * No branch here ever includes a GitHub response body, header, or token
 * in the thrown error's message.
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
} from '@rick/integrations'

function isGitHubUnavailableError(err: unknown): boolean {
  return (
    err instanceof GitHubAuthError
    || err instanceof GitHubRateLimitError
    || err instanceof GitHubTimeoutError
    || err instanceof GitHubUpstreamError
    || err instanceof GitHubCredentialMissingError
  )
}

export function throwForGitHubAdapterError(err: unknown): never {
  if (err instanceof GitHubValidationError) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GitHub owner or repository name.' })
  }
  if (err instanceof GitHubNotFoundError) {
    throw createError({ statusCode: 422, statusMessage: 'This GitHub repository does not exist or is not accessible.' })
  }
  if (err instanceof GitHubMalformedResponseError) {
    throw createError({ statusCode: 502, statusMessage: 'GitHub returned an unexpected response.' })
  }
  if (isGitHubUnavailableError(err)) {
    throw createError({ statusCode: 503, statusMessage: 'GitHub is temporarily unavailable. Please try again later.' })
  }
  console.error('Unexpected error verifying GitHub repository.', err)
  throw createError({ statusCode: 500, statusMessage: 'Unable to verify the GitHub repository.' })
}
