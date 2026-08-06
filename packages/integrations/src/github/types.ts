/**
 * Normalized, framework-independent GitHub repository shape. Every field
 * here is safe to persist and safe to return to a client — none of them
 * can ever carry a credential.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
export type GitHubAccessMode = 'PUBLIC_READ' | 'AUTHENTICATED'

export interface GitHubRepositoryPermissions {
  read: boolean | null
  push: boolean | null
  admin: boolean | null
}

export interface NormalizedGitHubRepository {
  externalId: string
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  htmlUrl: string
  visibility: string
  archived: boolean
  accessMode: GitHubAccessMode
  permissions: GitHubRepositoryPermissions
}
