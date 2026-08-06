/**
 * Narrows GitHub's raw `GET /repos/{owner}/{repo}` JSON response
 * (`unknown`) into `NormalizedGitHubRepository`, and separately re-parses
 * our own previously-stored normalized shape when reading it back out of
 * PostgreSQL. Both start from `unknown` — the raw GitHub response because
 * it is untrusted external input, and the stored value because a
 * database row is a trust boundary too (schema drift, manual edits, or a
 * future format change should fail closed, not crash).
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
import { GitHubMalformedResponseError } from './errors.js'
import type { GitHubAccessMode, GitHubRepositoryPermissions, NormalizedGitHubRepository } from './types.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readOwnerLogin(raw: Record<string, unknown>): string | null {
  const owner = raw['owner']
  return isRecord(owner) ? readString(owner, 'login') : null
}

function readVisibility(raw: Record<string, unknown>): string | null {
  const visibility = readString(raw, 'visibility')
  if (visibility !== null) {
    return visibility
  }
  const isPrivate = raw['private']
  return typeof isPrivate === 'boolean' ? (isPrivate ? 'private' : 'public') : null
}

function readPermissions(raw: Record<string, unknown>): GitHubRepositoryPermissions {
  const permissions = raw['permissions']
  if (!isRecord(permissions)) {
    return { read: null, push: null, admin: null }
  }
  return {
    read: readBooleanOrNull(permissions['pull']),
    push: readBooleanOrNull(permissions['push']),
    admin: readBooleanOrNull(permissions['admin']),
  }
}

interface ExtractedRawFields {
  id: unknown
  owner: string | null
  name: string | null
  fullName: string | null
  defaultBranch: string | null
  htmlUrl: string | null
  visibility: string | null
  archived: unknown
}

interface ValidatedRawFields {
  id: number
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  htmlUrl: string
  visibility: string
  archived: boolean
}

function extractRawFields(raw: Record<string, unknown>): ExtractedRawFields {
  return {
    id: raw['id'],
    owner: readOwnerLogin(raw),
    name: readString(raw, 'name'),
    fullName: readString(raw, 'full_name'),
    defaultBranch: readString(raw, 'default_branch'),
    htmlUrl: readString(raw, 'html_url'),
    visibility: readVisibility(raw),
    archived: raw['archived'],
  }
}

function isValidatedRawFields(fields: ExtractedRawFields): fields is ExtractedRawFields & ValidatedRawFields {
  return (
    typeof fields.id === 'number'
    && fields.owner !== null
    && fields.name !== null
    && fields.fullName !== null
    && fields.defaultBranch !== null
    && fields.htmlUrl !== null
    && fields.visibility !== null
    && typeof fields.archived === 'boolean'
  )
}

/** Narrows a raw `GET /repos/{owner}/{repo}` response body. `accessMode` is
 * supplied by the caller (the adapter itself), since it reflects whether
 * *we* sent a token — GitHub's response never says so. */
export function normalizeRawGitHubApiResponse(raw: unknown, accessMode: GitHubAccessMode): NormalizedGitHubRepository {
  if (!isRecord(raw)) {
    throw new GitHubMalformedResponseError()
  }

  const fields = extractRawFields(raw)

  if (!isValidatedRawFields(fields)) {
    throw new GitHubMalformedResponseError()
  }

  return {
    externalId: String(fields.id),
    owner: fields.owner,
    name: fields.name,
    fullName: fields.fullName,
    defaultBranch: fields.defaultBranch,
    htmlUrl: fields.htmlUrl,
    visibility: fields.visibility,
    archived: fields.archived,
    accessMode,
    permissions: readPermissions(raw),
  }
}

function hasValidCoreStringFields(value: Record<string, unknown>): boolean {
  return (
    typeof value['externalId'] === 'string'
    && typeof value['owner'] === 'string'
    && typeof value['name'] === 'string'
    && typeof value['fullName'] === 'string'
    && typeof value['defaultBranch'] === 'string'
    && typeof value['htmlUrl'] === 'string'
    && typeof value['visibility'] === 'string'
  )
}

function hasValidAccessMode(value: Record<string, unknown>): boolean {
  return value['accessMode'] === 'PUBLIC_READ' || value['accessMode'] === 'AUTHENTICATED'
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return typeof value === 'boolean' || value === null
}

function isValidPermissionsShape(value: unknown): value is GitHubRepositoryPermissions {
  return (
    isRecord(value)
    && isBooleanOrNull(value['read'])
    && isBooleanOrNull(value['push'])
    && isBooleanOrNull(value['admin'])
  )
}

function isNormalizedGitHubRepositoryShape(
  value: Record<string, unknown>,
): value is Record<string, unknown> & NormalizedGitHubRepository {
  return (
    hasValidCoreStringFields(value)
    && typeof value['archived'] === 'boolean'
    && hasValidAccessMode(value)
    && isValidPermissionsShape(value['permissions'])
  )
}

/** Re-parses our own previously-stored `configurationJson` snapshot.
 * Returns `null` instead of throwing on a shape mismatch — this reads our
 * own data back, so a mismatch is "don't render it" territory, not a
 * request that should fail. */
export function parseStoredGitHubConfiguration(value: unknown): NormalizedGitHubRepository | null {
  if (!isRecord(value) || !isNormalizedGitHubRepositoryShape(value)) {
    return null
  }
  return value
}
