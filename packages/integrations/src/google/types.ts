/**
 * Normalized, framework-independent Google Drive shapes. Every field here
 * is safe to persist and safe to return to a client — none of them can
 * carry a credential, an access token, an HTTP header, or a raw provider
 * response.
 *
 * `contentText` on {@link GoogleDocumentSnapshot} is the one field that
 * carries document body content. It is safe by classification (it is the
 * approved strategic document itself, which is the point of the task) but
 * must still never be written into `DocumentSource.metadataJson` or any
 * list DTO — only into the dedicated immutable snapshot column.
 *
 * NDERCC-13 / DEC-RIC-003.
 */

/** Exactly the strict `files.get` field allowlist, narrowed. */
export interface GoogleDocumentMetadata {
  id: string
  name: string
  mimeType: string
  /** Drive's `files.version` — a monotonically increasing provider counter, always carried as a string. */
  version: string
  modifiedTime: string | null
  webViewLink: string | null
}

export interface GoogleDocumentSnapshot {
  metadata: GoogleDocumentMetadata
  /** The version proven stable across the metadata/export/metadata sequence. */
  providerVersion: string
  /** Canonically normalized UTF-8 text (see normalize-text.ts). */
  contentText: string
  /** Lowercase SHA-256 hex of `contentText`'s UTF-8 bytes. */
  checksum: string
  /** Byte length of the normalized text — recorded as evidence without printing content. */
  byteLength: number
  /** How many read attempts were needed before the version was stable (1–3). */
  attempts: number
}
