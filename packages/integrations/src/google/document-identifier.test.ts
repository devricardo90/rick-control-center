/**
 * File-ID / Google Docs URL resolution tests. Pure — nothing here touches
 * the network.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { describe, expect, it } from 'vitest'
import { isValidGoogleFileId, resolveGoogleDocumentFileId } from './document-identifier.js'
import { GoogleValidationError } from './errors.js'

const FILE_ID = '1pZ0cB-tuXWoaMW1v0VgRI974aERZDMTufuFe77WsPsk'

describe('isValidGoogleFileId', () => {
  it('accepts a realistic Drive file ID', () => {
    expect(isValidGoogleFileId(FILE_ID)).toBe(true)
  })

  it('rejects ids that are too short, too long, or contain unsafe characters', () => {
    expect(isValidGoogleFileId('short')).toBe(false)
    expect(isValidGoogleFileId('a'.repeat(257))).toBe(false)
    expect(isValidGoogleFileId('has/slash/and-more-characters')).toBe(false)
    expect(isValidGoogleFileId('has spaces in the middle here')).toBe(false)
  })
})

describe('resolveGoogleDocumentFileId — accepted forms', () => {
  it('passes a bare file ID straight through', () => {
    expect(resolveGoogleDocumentFileId(FILE_ID)).toBe(FILE_ID)
  })

  it('trims surrounding whitespace', () => {
    expect(resolveGoogleDocumentFileId(`  ${FILE_ID}\n`)).toBe(FILE_ID)
  })

  it('extracts the ID from a standard document edit URL', () => {
    expect(resolveGoogleDocumentFileId(`https://docs.google.com/document/d/${FILE_ID}/edit`)).toBe(FILE_ID)
  })

  it('extracts the ID from an account-scoped document URL', () => {
    expect(resolveGoogleDocumentFileId(`https://docs.google.com/document/u/0/d/${FILE_ID}/edit?usp=sharing`))
      .toBe(FILE_ID)
  })

  it('extracts the ID from a drive file view URL', () => {
    expect(resolveGoogleDocumentFileId(`https://drive.google.com/file/d/${FILE_ID}/view`)).toBe(FILE_ID)
  })

  it('extracts the ID from an ?id= query URL', () => {
    expect(resolveGoogleDocumentFileId(`https://drive.google.com/open?id=${FILE_ID}`)).toBe(FILE_ID)
  })

  it('accepts a URL whose path and query name the same ID', () => {
    expect(resolveGoogleDocumentFileId(`https://docs.google.com/document/d/${FILE_ID}/edit?id=${FILE_ID}`))
      .toBe(FILE_ID)
  })
})

describe('resolveGoogleDocumentFileId — rejected forms', () => {
  it('rejects an empty or whitespace-only reference', () => {
    expect(() => resolveGoogleDocumentFileId('')).toThrow(GoogleValidationError)
    expect(() => resolveGoogleDocumentFileId('    ')).toThrow(GoogleValidationError)
  })

  it('rejects an arbitrary host, even when it mimics the Google path shape', () => {
    expect(() => resolveGoogleDocumentFileId(`https://evil.example.com/document/d/${FILE_ID}/edit`))
      .toThrow(GoogleValidationError)
  })

  it('rejects a host that merely ends with a Google domain', () => {
    expect(() => resolveGoogleDocumentFileId(`https://docs.google.com.evil.example/document/d/${FILE_ID}/edit`))
      .toThrow(GoogleValidationError)
  })

  it('rejects http:, embedded credentials, and non-http schemes', () => {
    expect(() => resolveGoogleDocumentFileId(`http://docs.google.com/document/d/${FILE_ID}/edit`))
      .toThrow(GoogleValidationError)
    expect(() => resolveGoogleDocumentFileId(`https://user:pass@docs.google.com/document/d/${FILE_ID}/edit`))
      .toThrow(GoogleValidationError)
    expect(() => resolveGoogleDocumentFileId(`javascript:alert(${FILE_ID})`)).toThrow(GoogleValidationError)
  })

  it('rejects a folder link rather than treating the folder as a document', () => {
    expect(() => resolveGoogleDocumentFileId(`https://drive.google.com/drive/folders/${FILE_ID}`))
      .toThrow(GoogleValidationError)
    expect(() => resolveGoogleDocumentFileId(`https://drive.google.com/drive/u/0/folders/${FILE_ID}`))
      .toThrow(GoogleValidationError)
  })

  it('rejects a Google URL that carries no file ID at all', () => {
    expect(() => resolveGoogleDocumentFileId('https://docs.google.com/document/')).toThrow(GoogleValidationError)
  })

  it('rejects an ambiguous URL naming two different file IDs', () => {
    const other = 'ZZZ0cB-tuXWoaMW1v0VgRI974aERZDMTufuFe77WsPsk'

    expect(() => resolveGoogleDocumentFileId(`https://docs.google.com/document/d/${FILE_ID}/edit?id=${other}`))
      .toThrow(GoogleValidationError)
  })

  it('rejects a URL whose extracted ID is malformed', () => {
    expect(() => resolveGoogleDocumentFileId('https://docs.google.com/document/d/short/edit'))
      .toThrow(GoogleValidationError)
  })
})
