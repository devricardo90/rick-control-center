/**
 * Drive adapter unit tests. Every test injects its own `fetchImpl` and its
 * own token provider, so nothing here uses a live service-account
 * credential or reaches Google over the network — the DEC-RIC-003 rule
 * that "automated tests inject/mock the network boundary and must not call
 * live Google APIs" is structurally satisfied, not merely intended.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { describe, expect, it, vi } from 'vitest'
import type { GoogleAccessTokenProvider } from './access-token.js'
import {
  createGoogleDriveReader,
  GOOGLE_DOCUMENT_MIME_TYPE,
  GOOGLE_METADATA_FIELDS,
  MAX_SNAPSHOT_ATTEMPTS,
  narrowGoogleDocumentMetadata,
} from './drive-client.js'
import {
  GoogleAuthError,
  GoogleInconsistentSnapshotError,
  GoogleMalformedResponseError,
  GoogleNotFoundError,
  GoogleRateLimitError,
  GoogleResponseTooLargeError,
  GoogleTimeoutError,
  GoogleUnsupportedDocumentTypeError,
  GoogleUpstreamError,
  GoogleValidationError,
} from './errors.js'
import { computeDocumentChecksum } from './normalize-text.js'

const FILE_ID = '1pZ0cB-tuXWoaMW1v0VgRI974aERZDMTufuFe77WsPsk'
const ACCESS_TOKEN = 'fake-access-token-value'

const tokenProvider: GoogleAccessTokenProvider = { getAccessToken: () => Promise.resolve(ACCESS_TOKEN) }

function metadataBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: FILE_ID,
    name: 'RIC-002 — Product Requirements Document (PRD)',
    mimeType: GOOGLE_DOCUMENT_MIME_TYPE,
    version: '23',
    modifiedTime: '2026-07-29T19:07:34.313Z',
    webViewLink: `https://docs.google.com/document/d/${FILE_ID}/edit`,
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } })
}

/**
 * The argument tuple `fetch` is called with. Declared explicitly so the
 * recorded `mock.calls` stay typed — an inferred zero-argument mock would
 * make every `calls[0][0]` inspection below a type error.
 */
type FetchArgs = [input: string | URL | Request, init?: RequestInit]

/** A single-response mock that records the request it was called with. */
function recordingFetch(build: () => Response) {
  return vi.fn((..._args: FetchArgs) => Promise.resolve(build()))
}

/** Serves the metadata/export/metadata sequence a snapshot performs. */
function sequencedFetch(responses: Response[]): typeof fetch {
  let index = 0
  return vi.fn(() => {
    const response = responses[index]
    index += 1
    if (response === undefined) {
      throw new Error('fetch called more times than the test scripted')
    }
    return Promise.resolve(response)
  }) as unknown as typeof fetch
}

function reader(fetchImpl: typeof fetch, overrides: { maxExportBytes?: number } = {}) {
  return createGoogleDriveReader({
    accessTokenProvider: tokenProvider,
    fetchImpl,
    ...(overrides.maxExportBytes !== undefined ? { maxExportBytes: overrides.maxExportBytes } : {}),
  })
}

describe('createGoogleDriveReader — request shape and network boundary', () => {
  it('calls only the fixed googleapis.com origin with GET and the strict field allowlist', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse(metadataBody()))

    await reader(fetchImpl as unknown as typeof fetch).getGoogleDocumentMetadata(FILE_ID)

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    const parsed = new URL(String(url))

    expect(parsed.origin).toBe('https://www.googleapis.com')
    expect(parsed.pathname).toBe(`/drive/v3/files/${FILE_ID}`)
    expect(parsed.searchParams.get('fields')).toBe(GOOGLE_METADATA_FIELDS)
    expect((init as RequestInit | undefined)?.method).toBe('GET')
  })

  it('requests exactly the six allowlisted metadata fields and nothing else', () => {
    expect(GOOGLE_METADATA_FIELDS.split(',')).toEqual([
      'id', 'name', 'mimeType', 'version', 'modifiedTime', 'webViewLink',
    ])
  })

  it('exports as text/plain against the export endpoint', async () => {
    const fetchImpl = recordingFetch(() => textResponse('body'))

    await reader(fetchImpl as unknown as typeof fetch).exportGoogleDocumentText(FILE_ID)

    const parsed = new URL(String(fetchImpl.mock.calls[0]?.[0]))

    expect(parsed.pathname).toBe(`/drive/v3/files/${FILE_ID}/export`)
    expect(parsed.searchParams.get('mimeType')).toBe('text/plain')
  })

  it('never issues a method other than GET across a full snapshot', async () => {
    const scripted = sequencedFetch([
      jsonResponse(metadataBody()),
      textResponse('content'),
      jsonResponse(metadataBody()),
    ])

    await reader(scripted).snapshotGoogleDocument(FILE_ID)

    const mock = vi.mocked(scripted)
    expect(mock.mock.calls).toHaveLength(3)
    for (const call of mock.mock.calls) {
      expect((call[1] as RequestInit | undefined)?.method).toBe('GET')
    }
  })

  it('sends the bearer token it was given, and only in the Authorization header', async () => {
    const fetchImpl = recordingFetch(() => jsonResponse(metadataBody()))

    await reader(fetchImpl as unknown as typeof fetch).getGoogleDocumentMetadata(FILE_ID)

    const init = fetchImpl.mock.calls[0]?.[1]
    const headers = init?.headers as Record<string, string>

    expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain(ACCESS_TOKEN)
  })

  it('rejects a malformed file ID without ever calling fetch', async () => {
    const fetchImpl = vi.fn()
    const target = reader(fetchImpl as unknown as typeof fetch)

    await expect(target.getGoogleDocumentMetadata('bad id')).rejects.toBeInstanceOf(GoogleValidationError)
    await expect(target.exportGoogleDocumentText('bad id')).rejects.toBeInstanceOf(GoogleValidationError)
    await expect(target.snapshotGoogleDocument('bad id')).rejects.toBeInstanceOf(GoogleValidationError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('narrowGoogleDocumentMetadata', () => {
  it('narrows a well-formed body', () => {
    const metadata = narrowGoogleDocumentMetadata(metadataBody())

    expect(metadata.id).toBe(FILE_ID)
    expect(metadata.version).toBe('23')
    expect(metadata.modifiedTime).toBe('2026-07-29T19:07:34.313Z')
  })

  it('accepts a numeric version and carries it as a string', () => {
    expect(narrowGoogleDocumentMetadata(metadataBody({ version: 23 })).version).toBe('23')
  })

  it('treats absent optional fields as null rather than undefined', () => {
    const metadata = narrowGoogleDocumentMetadata(metadataBody({ modifiedTime: undefined, webViewLink: undefined }))

    expect(metadata.modifiedTime).toBeNull()
    expect(metadata.webViewLink).toBeNull()
  })

  it('rejects a body missing any required field', () => {
    for (const field of ['id', 'name', 'mimeType', 'version']) {
      expect(() => narrowGoogleDocumentMetadata(metadataBody({ [field]: undefined })))
        .toThrow(GoogleMalformedResponseError)
    }
  })

  it('rejects a non-object body', () => {
    expect(() => narrowGoogleDocumentMetadata('a string')).toThrow(GoogleMalformedResponseError)
    expect(() => narrowGoogleDocumentMetadata(null)).toThrow(GoogleMalformedResponseError)
    expect(() => narrowGoogleDocumentMetadata([metadataBody()])).toThrow(GoogleMalformedResponseError)
  })
})

describe('createGoogleDriveReader — external failure mapping', () => {
  const cases: ReadonlyArray<[number, unknown]> = [
    [401, GoogleAuthError],
    [403, GoogleAuthError],
    [404, GoogleNotFoundError],
    [429, GoogleRateLimitError],
    [500, GoogleUpstreamError],
    [503, GoogleUpstreamError],
    [418, GoogleUpstreamError],
  ]

  for (const [status, errorType] of cases) {
    it(`maps HTTP ${status} to the documented typed error`, async () => {
      const fetchImpl = sequencedFetch([jsonResponse({ error: { message: 'ignored' } }, status)])

      await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
        .rejects.toBeInstanceOf(errorType as new () => Error)
    })
  }

  it('maps an aborted request to GoogleTimeoutError', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    const fetchImpl = (() => Promise.reject(abortError)) as unknown as typeof fetch

    await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toBeInstanceOf(GoogleTimeoutError)
  })

  it('maps a network failure to GoogleUpstreamError', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch

    await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toBeInstanceOf(GoogleUpstreamError)
  })

  it('maps an unparseable 2xx body to GoogleMalformedResponseError', async () => {
    const fetchImpl = sequencedFetch([new Response('not json', { status: 200 })])

    await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toBeInstanceOf(GoogleMalformedResponseError)
  })

  it('never leaks the Google error body, the token, or a header into the thrown error', async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse({ error: { message: 'SENSITIVE-UPSTREAM-DETAIL', code: 403 } }, 403),
    ])

    try {
      await reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID)
      expect.unreachable('expected a GoogleAuthError')
    }
    catch (err: unknown) {
      const text = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      expect(text).not.toContain('SENSITIVE-UPSTREAM-DETAIL')
      expect(text).not.toContain(ACCESS_TOKEN)
      expect(text).not.toContain('Authorization')
    }
  })
})

describe('createGoogleDriveReader — size limits', () => {
  it('refuses an export whose declared content-length exceeds the limit, before reading it', async () => {
    const oversized = new Response('x', {
      status: 200,
      headers: { 'content-length': String(10 * 1024 * 1024) },
    })

    await expect(reader(sequencedFetch([oversized]), { maxExportBytes: 1024 }).exportGoogleDocumentText(FILE_ID))
      .rejects.toBeInstanceOf(GoogleResponseTooLargeError)
  })

  it('refuses an export whose actual body exceeds the limit even with no content-length', async () => {
    const body = 'x'.repeat(2048)

    await expect(reader(sequencedFetch([textResponse(body)]), { maxExportBytes: 1024 }).exportGoogleDocumentText(FILE_ID))
      .rejects.toBeInstanceOf(GoogleResponseTooLargeError)
  })

  it('accepts an export at the limit', async () => {
    const body = 'x'.repeat(1024)

    await expect(reader(sequencedFetch([textResponse(body)]), { maxExportBytes: 1024 }).exportGoogleDocumentText(FILE_ID))
      .resolves.toBe(body)
  })
})

/**
 * Corrective review finding 2. The MIME guard lives in the single central
 * metadata read, so registration — which only reads metadata and never
 * snapshots — cannot persist a non-Doc source. Both entry points are
 * asserted, because it was previously only the snapshot path that checked.
 */
describe('createGoogleDriveReader — central MIME type gate', () => {
  const unsupported = [
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/vnd.google-apps.folder',
    'application/vnd.google-apps.form',
    'application/pdf',
    'text/plain',
    'image/png',
    'application/octet-stream',
  ]

  for (const mimeType of unsupported) {
    it(`getGoogleDocumentMetadata rejects ${mimeType} — this is the registration path`, async () => {
      const fetchImpl = sequencedFetch([jsonResponse(metadataBody({ mimeType }))])

      await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
        .rejects.toBeInstanceOf(GoogleUnsupportedDocumentTypeError)
    })
  }

  it('reports the offending MIME type without leaking anything else', async () => {
    const fetchImpl = sequencedFetch([jsonResponse(metadataBody({ mimeType: 'application/pdf' }))])

    await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toThrow(/application\/pdf/)
  })

  it('rejects a non-Docs file on the snapshot path before exporting anything', async () => {
    const fetchImpl = sequencedFetch([jsonResponse(metadataBody({ mimeType: 'application/pdf' }))])

    await expect(reader(fetchImpl).snapshotGoogleDocument(FILE_ID))
      .rejects.toBeInstanceOf(GoogleUnsupportedDocumentTypeError)
    // One call only: rejected on the first metadata read, so no export was
    // ever requested for an unsupported file.
    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(1)
  })

  it('accepts a native Google Doc', async () => {
    const fetchImpl = sequencedFetch([jsonResponse(metadataBody())])

    await expect(reader(fetchImpl).getGoogleDocumentMetadata(FILE_ID))
      .resolves.toMatchObject({ mimeType: GOOGLE_DOCUMENT_MIME_TYPE })
  })
})

/**
 * Corrective review finding 3. `content-length` is a provider hint that can
 * be absent or wrong, so the metadata body must be bounded by actual bytes
 * read, before it reaches `JSON.parse`.
 */
describe('createGoogleDriveReader — metadata body size limit', () => {
  /** A response whose body is real but whose content-length header lies or is missing. */
  function bodyResponse(text: string, headers: Record<string, string> = {}): Response {
    return new Response(text, { status: 200, headers: { 'content-type': 'application/json', ...headers } })
  }

  it('rejects an oversized declared content-length before reading the body', async () => {
    const response = bodyResponse('{}', { 'content-length': String(1024 * 1024) })

    await expect(reader(sequencedFetch([response])).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toBeInstanceOf(GoogleResponseTooLargeError)
  })

  it('rejects an oversized actual metadata body when no content-length is declared', async () => {
    // 64 KiB + slack of padding inside otherwise-valid JSON, streamed with
    // chunked encoding so no content-length header exists at all.
    const oversized = JSON.stringify({ ...metadataBody(), padding: 'x'.repeat(80 * 1024) })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(oversized)
        for (let offset = 0; offset < bytes.byteLength; offset += 8192) {
          controller.enqueue(bytes.slice(offset, offset + 8192))
        }
        controller.close()
      },
    })
    const response = new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } })

    expect(response.headers.get('content-length')).toBeNull()
    await expect(reader(sequencedFetch([response])).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toBeInstanceOf(GoogleResponseTooLargeError)
  })

  it('rejects an oversized actual body even when content-length understates it', async () => {
    const oversized = JSON.stringify({ ...metadataBody(), padding: 'x'.repeat(80 * 1024) })
    const response = bodyResponse(oversized, { 'content-length': '10' })

    await expect(reader(sequencedFetch([response])).getGoogleDocumentMetadata(FILE_ID))
      .rejects.toBeInstanceOf(GoogleResponseTooLargeError)
  })

  it('accepts valid metadata at or below the limit', async () => {
    const withinLimit = JSON.stringify({ ...metadataBody(), padding: 'x'.repeat(1024) })

    await expect(reader(sequencedFetch([bodyResponse(withinLimit)])).getGoogleDocumentMetadata(FILE_ID))
      .resolves.toMatchObject({ id: FILE_ID, version: '23' })
  })

  it('accepts an ordinary small metadata response', async () => {
    await expect(reader(sequencedFetch([jsonResponse(metadataBody())])).getGoogleDocumentMetadata(FILE_ID))
      .resolves.toMatchObject({ id: FILE_ID })
  })
})

describe('snapshotGoogleDocument — version consistency', () => {
  it('returns a snapshot when the version is stable across the export', async () => {
    const content = 'Strategic content.\n'
    const fetchImpl = sequencedFetch([
      jsonResponse(metadataBody()),
      textResponse(content),
      jsonResponse(metadataBody()),
    ])

    const snapshot = await reader(fetchImpl).snapshotGoogleDocument(FILE_ID)

    expect(snapshot.providerVersion).toBe('23')
    expect(snapshot.contentText).toBe(content)
    expect(snapshot.checksum).toBe(computeDocumentChecksum(content))
    expect(snapshot.byteLength).toBe(Buffer.byteLength(content, 'utf8'))
    expect(snapshot.attempts).toBe(1)
  })

  it('reads metadata, exports, then reads metadata again — in that order', async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse(metadataBody()),
      textResponse('c'),
      jsonResponse(metadataBody()),
    ])

    await reader(fetchImpl).snapshotGoogleDocument(FILE_ID)

    const paths = vi.mocked(fetchImpl).mock.calls.map(call => new URL(String(call[0])).pathname)
    expect(paths).toEqual([
      `/drive/v3/files/${FILE_ID}`,
      `/drive/v3/files/${FILE_ID}/export`,
      `/drive/v3/files/${FILE_ID}`,
    ])
  })
})

describe('snapshotGoogleDocument — version drift and bounded retry', () => {
  it('discards the candidate and retries when the version drifts mid-export', async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse(metadataBody({ version: '23' })),
      textResponse('stale content'),
      jsonResponse(metadataBody({ version: '24' })),
      jsonResponse(metadataBody({ version: '24' })),
      textResponse('fresh content'),
      jsonResponse(metadataBody({ version: '24' })),
    ])

    const snapshot = await reader(fetchImpl).snapshotGoogleDocument(FILE_ID)

    expect(snapshot.providerVersion).toBe('24')
    expect(snapshot.contentText).toBe('fresh content')
    expect(snapshot.attempts).toBe(2)
  })

  it('fails with GoogleInconsistentSnapshotError after three inconsistent attempts', async () => {
    const drifting: Response[] = []
    for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
      drifting.push(
        jsonResponse(metadataBody({ version: String(30 + attempt * 2) })),
        textResponse('content'),
        jsonResponse(metadataBody({ version: String(31 + attempt * 2) })),
      )
    }

    await expect(reader(sequencedFetch(drifting)).snapshotGoogleDocument(FILE_ID))
      .rejects.toBeInstanceOf(GoogleInconsistentSnapshotError)
  })

  it('makes exactly three attempts and no more', async () => {
    const drifting: Response[] = []
    for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
      drifting.push(
        jsonResponse(metadataBody({ version: '1' })),
        textResponse('content'),
        jsonResponse(metadataBody({ version: '2' })),
      )
    }
    const fetchImpl = sequencedFetch(drifting)

    await expect(reader(fetchImpl).snapshotGoogleDocument(FILE_ID)).rejects.toThrow()

    expect(vi.mocked(fetchImpl).mock.calls).toHaveLength(MAX_SNAPSHOT_ATTEMPTS * 3)
  })

  it('rejects when the file identity itself changes between reads', async () => {
    const swapped = 'ZZZ0cB-tuXWoaMW1v0VgRI974aERZDMTufuFe77WsPsk'
    const responses: Response[] = []
    for (let attempt = 0; attempt < MAX_SNAPSHOT_ATTEMPTS; attempt += 1) {
      responses.push(
        jsonResponse(metadataBody()),
        textResponse('content'),
        jsonResponse(metadataBody({ id: swapped })),
      )
    }

    await expect(reader(sequencedFetch(responses)).snapshotGoogleDocument(FILE_ID))
      .rejects.toBeInstanceOf(GoogleInconsistentSnapshotError)
  })
})

describe('snapshotGoogleDocument — normalization and error propagation', () => {
  it('normalizes the exported text before checksumming it', async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse(metadataBody()),
      textResponse('line one\r\nline two\r\n'),
      jsonResponse(metadataBody()),
    ])

    const snapshot = await reader(fetchImpl).snapshotGoogleDocument(FILE_ID)

    expect(snapshot.contentText).toBe('line one\nline two\n')
    expect(snapshot.checksum).toBe(computeDocumentChecksum('line one\nline two\n'))
  })

  it('propagates an export failure instead of retrying it as version drift', async () => {
    const fetchImpl = sequencedFetch([
      jsonResponse(metadataBody()),
      jsonResponse({ error: {} }, 404),
    ])

    await expect(reader(fetchImpl).snapshotGoogleDocument(FILE_ID)).rejects.toBeInstanceOf(GoogleNotFoundError)
  })
})

describe('createGoogleDriveReader — token provider failures', () => {
  it('surfaces a token-provider failure without calling fetch', async () => {
    const fetchImpl = vi.fn()
    const failing: GoogleAccessTokenProvider = {
      getAccessToken: () => Promise.reject(new GoogleAuthError()),
    }

    const target = createGoogleDriveReader({
      accessTokenProvider: failing,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(target.getGoogleDocumentMetadata(FILE_ID)).rejects.toBeInstanceOf(GoogleAuthError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
