/**
 * Canonical normalization and checksum tests — the exact algorithm frozen
 * by DEC-RIC-003. If any assertion here changes, every previously stored
 * checksum becomes unreproducible, so these tests are the guard against
 * silently redefining what a snapshot means.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { computeDocumentChecksum, normalizeGoogleDocumentText } from './normalize-text.js'

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

describe('normalizeGoogleDocumentText — decoding and BOM', () => {
  it('decodes UTF-8, including multi-byte characters', () => {
    expect(normalizeGoogleDocumentText(encode('Requisitos — visão ✅'))).toBe('Requisitos — visão ✅')
  })

  it('removes a leading UTF-8 BOM', () => {
    expect(normalizeGoogleDocumentText(encode('\uFEFFTitle'))).toBe('Title')
  })

  it('removes the BOM when supplied as raw EF BB BF bytes', () => {
    const bytes = new Uint8Array([0xEF, 0xBB, 0xBF, ...encode('Title')])

    expect(normalizeGoogleDocumentText(bytes)).toBe('Title')
  })

  it('does not remove a U+FEFF that appears later in the document', () => {
    expect(normalizeGoogleDocumentText(encode('a\uFEFFb'))).toBe('a\uFEFFb')
  })

  it('maps malformed bytes to U+FFFD instead of throwing', () => {
    expect(normalizeGoogleDocumentText(new Uint8Array([0xFF, 0xFE]))).toBe('��')
  })
})

describe('normalizeGoogleDocumentText — Unicode and line endings', () => {
  it('normalizes decomposed Unicode to NFC', () => {
    const composed = 'vis\u00E3o'.normalize('NFC')
    const decomposed = composed.normalize('NFD')

    expect(decomposed).not.toBe(composed)
    expect(normalizeGoogleDocumentText(encode(decomposed))).toBe(composed)
  })

  it('converts CRLF to LF', () => {
    expect(normalizeGoogleDocumentText(encode('a\r\nb\r\nc'))).toBe('a\nb\nc')
  })

  it('converts a lone CR to LF', () => {
    expect(normalizeGoogleDocumentText(encode('a\rb'))).toBe('a\nb')
  })

  it('leaves existing LF endings untouched', () => {
    expect(normalizeGoogleDocumentText(encode('a\nb\n'))).toBe('a\nb\n')
  })
})

describe('normalizeGoogleDocumentText — content preservation', () => {
  it('preserves leading and trailing whitespace rather than trimming', () => {
    expect(normalizeGoogleDocumentText(encode('   padded   '))).toBe('   padded   ')
  })

  it('preserves blank lines and does not collapse them', () => {
    expect(normalizeGoogleDocumentText(encode('a\n\n\nb'))).toBe('a\n\n\nb')
  })

  it('preserves runs of internal spaces and tabs', () => {
    expect(normalizeGoogleDocumentText(encode('a    b\tc'))).toBe('a    b\tc')
  })

  it('returns an empty string for an empty export', () => {
    expect(normalizeGoogleDocumentText(new Uint8Array())).toBe('')
  })
})

describe('computeDocumentChecksum', () => {
  it('produces a 64-character lowercase hex digest', () => {
    expect(computeDocumentChecksum('hello')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches SHA-256 over the UTF-8 bytes of the normalized text', () => {
    const text = 'Estratégia — RICK\n'
    const expected = createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')

    expect(computeDocumentChecksum(text)).toBe(expected)
  })

  it('is deterministic across repeated calls', () => {
    expect(computeDocumentChecksum('same input')).toBe(computeDocumentChecksum('same input'))
  })

  it('changes when a single character changes', () => {
    expect(computeDocumentChecksum('version a')).not.toBe(computeDocumentChecksum('version b'))
  })

  it('gives CRLF and LF sources the same checksum once normalized', () => {
    const crlf = normalizeGoogleDocumentText(encode('line one\r\nline two'))
    const lf = normalizeGoogleDocumentText(encode('line one\nline two'))

    expect(computeDocumentChecksum(crlf)).toBe(computeDocumentChecksum(lf))
  })

  it('gives NFD and NFC sources the same checksum once normalized', () => {
    const nfd = normalizeGoogleDocumentText(encode('vis\u00E3o'.normalize('NFD')))
    const nfc = normalizeGoogleDocumentText(encode('vis\u00E3o'.normalize('NFC')))

    expect(computeDocumentChecksum(nfd)).toBe(computeDocumentChecksum(nfc))
  })
})
