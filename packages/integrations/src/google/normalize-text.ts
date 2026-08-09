/**
 * Canonical text normalization and checksum for exported Google Docs
 * (DEC-RIC-003 §"Canonical text normalization and checksum").
 *
 * The exact, ordered algorithm — any change to it changes every future
 * checksum and must be a new decision, not an edit:
 *   1. decode the exported bytes as UTF-8;
 *   2. remove an optional leading UTF-8 BOM;
 *   3. normalize Unicode to NFC;
 *   4. normalize CRLF and lone CR line endings to LF;
 *   5. compute a lowercase SHA-256 hex digest over the resulting UTF-8 bytes.
 *
 * Deliberately NOT done: trimming, collapsing runs of spaces, dropping
 * blank lines, or any other rewriting of the author's wording. The stored
 * snapshot must remain the document as written, so that a checksum change
 * means the document changed — not that our normalizer did.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { createHash } from 'node:crypto'

/** U+FEFF, written as an escape so the constant is visible in a diff. */
const UTF8_BOM = '\uFEFF'

/**
 * Steps 1–4. `TextDecoder` in non-fatal mode maps malformed byte
 * sequences to U+FFFD rather than throwing, so a partially corrupt export
 * still yields a deterministic (and visibly wrong) snapshot instead of an
 * exception in the middle of the sync transaction.
 */
export function normalizeGoogleDocumentText(bytes: Uint8Array): string {
  const decoded = new TextDecoder('utf-8').decode(bytes)
  const withoutBom = decoded.startsWith(UTF8_BOM) ? decoded.slice(UTF8_BOM.length) : decoded
  return withoutBom.normalize('NFC').replace(/\r\n?/g, '\n')
}

/** Step 5. Lowercase SHA-256 hex over the normalized text's UTF-8 bytes. */
export function computeDocumentChecksum(normalizedText: string): string {
  return createHash('sha256').update(Buffer.from(normalizedText, 'utf8')).digest('hex')
}
