/**
 * Public surface of @rick/integrations.
 *
 * NDERCC-11: connect and verify GitHub repository.
 * NDERCC-13: read-only Google Drive document snapshots.
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

// ── Google Drive (NDERCC-13 / DEC-RIC-003) ─────────────────────────────
export {
  GoogleAuthError,
  GoogleCredentialInvalidError,
  GoogleCredentialMissingError,
  GoogleInconsistentSnapshotError,
  GoogleMalformedResponseError,
  GoogleNotFoundError,
  GoogleRateLimitError,
  GoogleResponseTooLargeError,
  GoogleTimeoutError,
  GoogleUnsupportedDocumentTypeError,
  GoogleUpstreamError,
  GoogleValidationError,
} from './google/errors.js'

export type { GoogleServiceAccountCredential } from './google/credentials.js'
export {
  GOOGLE_SERVICE_ACCOUNT_ENV_KEY,
  parseGoogleServiceAccountCredential,
  readGoogleServiceAccountCredential,
} from './google/credentials.js'

export type { GoogleAccessTokenProvider } from './google/access-token.js'
export {
  createServiceAccountAccessTokenProvider,
  GOOGLE_DRIVE_READONLY_SCOPE,
} from './google/access-token.js'

export { isValidGoogleFileId, resolveGoogleDocumentFileId } from './google/document-identifier.js'

export { computeDocumentChecksum, normalizeGoogleDocumentText } from './google/normalize-text.js'

export type { GoogleDriveReader, GoogleDriveReaderOptions } from './google/drive-client.js'
export {
  createGoogleDriveReader,
  GOOGLE_DOCUMENT_MIME_TYPE,
  GOOGLE_METADATA_FIELDS,
  MAX_SNAPSHOT_ATTEMPTS,
  narrowGoogleDocumentMetadata,
} from './google/drive-client.js'

export type { GoogleDocumentMetadata, GoogleDocumentSnapshot } from './google/types.js'
