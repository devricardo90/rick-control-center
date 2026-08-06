/**
 * Narrows an unknown request body into `{ owner, repository }` — the
 * ONLY fields a GitHub-connect request may contain. Per DEC-RIC-001, the
 * browser must never send a credential: a body carrying `token`,
 * `credential`, `apiHost`/`host`, or a raw `configuration`-shaped field
 * is rejected outright (returns `null`, mapped to HTTP 400 by the
 * caller), not silently stripped — unlike an ordinary unrecognized
 * field, these specific names are a strong signal of a client
 * misunderstanding the credential boundary and deserve a hard failure
 * rather than best-effort tolerance.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
export interface ConnectGitHubRepositoryInput {
  owner: string
  repository: string
}

const FORBIDDEN_BODY_KEYS = ['token', 'credential', 'apiHost', 'host', 'configuration', 'configurationEncrypted'] as const

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function containsForbiddenKey(candidate: Record<string, unknown>): boolean {
  return FORBIDDEN_BODY_KEYS.some(key => key in candidate)
}

export function parseConnectGitHubRepositoryInput(raw: unknown): ConnectGitHubRepositoryInput | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const candidate = raw as Record<string, unknown>

  if (containsForbiddenKey(candidate)) {
    return null
  }

  const { owner, repository } = candidate

  if (!isNonEmptyString(owner) || !isNonEmptyString(repository)) {
    return null
  }

  return { owner, repository }
}
