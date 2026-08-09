/**
 * Request-boundary narrowing tests for document registration.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { describe, expect, it } from 'vitest'
import { parseRegisterDocumentSourceInput } from '../../server/utils/parse-document-source-input'

const FILE_ID = '1pZ0cB-tuXWoaMW1v0VgRI974aERZDMTufuFe77WsPsk'

describe('parseRegisterDocumentSourceInput — accepted input', () => {
  it('accepts a document reference and an approved document type', () => {
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'PRD' }))
      .toEqual({ document: FILE_ID, documentType: 'PRD' })
  })

  it('accepts a full Google Docs URL and leaves resolution to the adapter', () => {
    const url = `https://docs.google.com/document/d/${FILE_ID}/edit`

    expect(parseRegisterDocumentSourceInput({ document: url, documentType: 'VISION' })?.document).toBe(url)
  })

  it('trims surrounding whitespace from the document reference', () => {
    expect(parseRegisterDocumentSourceInput({ document: `  ${FILE_ID}  `, documentType: 'BACKLOG' })?.document)
      .toBe(FILE_ID)
  })

  it('ignores unrecognized but harmless extra fields', () => {
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'MVP', note: 'hello' }))
      .toEqual({ document: FILE_ID, documentType: 'MVP' })
  })
})

describe('parseRegisterDocumentSourceInput — rejected shapes', () => {
  it('rejects a non-object body', () => {
    expect(parseRegisterDocumentSourceInput(null)).toBeNull()
    expect(parseRegisterDocumentSourceInput('PRD')).toBeNull()
    expect(parseRegisterDocumentSourceInput(42)).toBeNull()
    expect(parseRegisterDocumentSourceInput([{ document: FILE_ID, documentType: 'PRD' }])).toBeNull()
  })

  it('rejects a missing, empty or non-string document reference', () => {
    expect(parseRegisterDocumentSourceInput({ documentType: 'PRD' })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: '', documentType: 'PRD' })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: '   ', documentType: 'PRD' })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: 12345, documentType: 'PRD' })).toBeNull()
  })

  it('rejects a document reference long enough to be a pasted document body', () => {
    expect(parseRegisterDocumentSourceInput({ document: 'x'.repeat(2049), documentType: 'PRD' })).toBeNull()
  })

  it('rejects an unknown or missing document type', () => {
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'NOT_A_TYPE' })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'prd' })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 7 })).toBeNull()
  })
})

describe('parseRegisterDocumentSourceInput — credential and host boundary', () => {
  const credentialShapedKeys = [
    'token',
    'accessToken',
    'credential',
    'credentials',
    'serviceAccount',
    'serviceAccountJson',
    'privateKey',
    'authorization',
    'secret',
  ]

  for (const key of credentialShapedKeys) {
    it(`hard-rejects a body carrying "${key}" instead of silently stripping it`, () => {
      expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'PRD', [key]: 'x' })).toBeNull()
    })
  }

  for (const key of ['apiHost', 'host', 'apiBaseUrl', 'baseUrl', 'origin']) {
    it(`hard-rejects a client attempt to choose the API host via "${key}"`, () => {
      expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'PRD', [key]: 'https://evil.test' }))
        .toBeNull()
    })
  }

  for (const key of ['checksum', 'providerVersion', 'contentText', 'revision']) {
    it(`hard-rejects a client attempt to assert server-derived evidence via "${key}"`, () => {
      expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'PRD', [key]: 'forged' })).toBeNull()
    })
  }

  it('rejects the forbidden key even when its value is null or undefined', () => {
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'PRD', token: null })).toBeNull()
    expect(parseRegisterDocumentSourceInput({ document: FILE_ID, documentType: 'PRD', privateKey: undefined }))
      .toBeNull()
  })
})
