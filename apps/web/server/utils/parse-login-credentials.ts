/**
 * Narrows an unknown request body into typed login credentials. Request
 * bodies are untrusted input — this is the boundary where that `unknown`
 * gets validated before anything downstream touches it.
 *
 * NDERCC-6: single-user authentication.
 */
export interface LoginRequestBody {
  username: string
  password: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function parseLoginCredentials(raw: unknown): LoginRequestBody | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const candidate = raw as Record<string, unknown>
  const { username, password } = candidate

  if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
    return null
  }

  return { username, password }
}
