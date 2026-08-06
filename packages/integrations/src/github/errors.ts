/**
 * Typed GitHub adapter errors. None of these ever carry a token, a raw
 * GitHub response body, request headers, or any other credential/internal
 * detail — only what a caller needs to decide how to respond.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
export class GitHubValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubValidationError'
  }
}

/** Mirrors GitHub's own deliberate ambiguity: it returns 404 for both a
 * nonexistent repository and a private one we can't see, specifically to
 * avoid leaking private-repository existence. This error does the same —
 * it does not claim to know which case applies. */
export class GitHubNotFoundError extends Error {
  constructor(message = 'GitHub repository not found or not accessible.') {
    super(message)
    this.name = 'GitHubNotFoundError'
  }
}

export class GitHubAuthError extends Error {
  constructor(message = 'GitHub rejected the request (authentication or permission failure).') {
    super(message)
    this.name = 'GitHubAuthError'
  }
}

export class GitHubRateLimitError extends Error {
  constructor(message = 'GitHub rate limit exceeded.') {
    super(message)
    this.name = 'GitHubRateLimitError'
  }
}

export class GitHubTimeoutError extends Error {
  constructor(message = 'GitHub request timed out.') {
    super(message)
    this.name = 'GitHubTimeoutError'
  }
}

/** Network failure reaching GitHub, or a GitHub-side 5xx / unrecognized status. */
export class GitHubUpstreamError extends Error {
  constructor(public readonly status: number, message = 'GitHub upstream failure.') {
    super(message)
    this.name = 'GitHubUpstreamError'
  }
}

/** GitHub responded, but the body didn't narrow into the expected shape. */
export class GitHubMalformedResponseError extends Error {
  constructor(message = 'GitHub returned an unexpected response shape.') {
    super(message)
    this.name = 'GitHubMalformedResponseError'
  }
}

/** Authenticated access was explicitly required but no token is configured. */
export class GitHubCredentialMissingError extends Error {
  constructor(message = 'GITHUB_TOKEN is required for this operation but is not configured.') {
    super(message)
    this.name = 'GitHubCredentialMissingError'
  }
}
