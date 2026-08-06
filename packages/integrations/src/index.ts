/**
 * Public surface of @rick/integrations.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
export {
  GitHubAuthError,
  GitHubCredentialMissingError,
  GitHubMalformedResponseError,
  GitHubNotFoundError,
  GitHubRateLimitError,
  GitHubTimeoutError,
  GitHubUpstreamError,
  GitHubValidationError,
} from './github/errors.js'

export type { VerifyGitHubRepositoryOptions } from './github/client.js'
export { verifyGitHubRepository } from './github/client.js'

export { parseStoredGitHubConfiguration } from './github/normalize-repository.js'

export type {
  GitHubAccessMode,
  GitHubRepositoryPermissions,
  NormalizedGitHubRepository,
} from './github/types.js'

export { isValidGitHubOwner, isValidGitHubRepositoryName } from './github/validate-repository-identifier.js'
