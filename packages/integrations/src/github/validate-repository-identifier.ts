/**
 * Strict, conservative validation of GitHub owner/repository segments,
 * applied before any URL is constructed. Both patterns inherently reject
 * slashes, path traversal (`..`), whitespace, and empty values — there is
 * no separate "reject traversal" step because the allowlist patterns
 * below simply never match those characters.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/

export function isValidGitHubOwner(value: string): boolean {
  return OWNER_PATTERN.test(value)
}

export function isValidGitHubRepositoryName(value: string): boolean {
  return REPOSITORY_NAME_PATTERN.test(value) && value !== '.' && value !== '..'
}
