/**
 * Credential-narrowing tests. No real service-account key appears in this
 * file — the fixtures are structurally shaped but cryptographically
 * meaningless, because nothing here ever mints a token.
 *
 * The security-relevant assertions are the negative ones: that no thrown
 * error, and no accidental serialization of the parsed credential, can
 * ever contain the private key.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { describe, expect, it } from 'vitest'
import {
  GOOGLE_SERVICE_ACCOUNT_ENV_KEY,
  parseGoogleServiceAccountCredential,
  readGoogleServiceAccountCredential,
} from './credentials.js'
import { GoogleCredentialInvalidError, GoogleCredentialMissingError } from './errors.js'

const FAKE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nNOT-A-REAL-KEY-abcdef123456\n-----END PRIVATE KEY-----\n'

const VALID_CREDENTIAL = {
  type: 'service_account',
  project_id: 'rick-control-center',
  private_key_id: 'fake-key-id',
  private_key: FAKE_PRIVATE_KEY,
  client_email: 'rick@rick-control-center.iam.gserviceaccount.com',
  client_id: '1234567890',
}

describe('parseGoogleServiceAccountCredential — accepted input', () => {
  it('narrows a valid credential JSON string', () => {
    const credential = parseGoogleServiceAccountCredential(JSON.stringify(VALID_CREDENTIAL))

    expect(credential.clientEmail).toBe('rick@rick-control-center.iam.gserviceaccount.com')
    expect(credential.privateKey).toBe(FAKE_PRIVATE_KEY)
    expect(credential.projectId).toBe('rick-control-center')
  })

  it('accepts an already-parsed object', () => {
    expect(parseGoogleServiceAccountCredential(VALID_CREDENTIAL).clientEmail).toContain('@')
  })

  it('treats a missing project_id as null rather than failing', () => {
    const { project_id: _omitted, ...withoutProjectId } = VALID_CREDENTIAL

    expect(parseGoogleServiceAccountCredential(withoutProjectId).projectId).toBeNull()
  })

  it('exposes only the three narrowed fields — private_key_id and client_id are dropped', () => {
    const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)

    expect(Object.keys(credential).sort()).toEqual(['clientEmail', 'privateKey', 'projectId'])
  })
})

describe('parseGoogleServiceAccountCredential — DEC-RIC-003 structural rules', () => {
  it('rejects a credential whose type is not service_account', () => {
    expect(() => parseGoogleServiceAccountCredential({ ...VALID_CREDENTIAL, type: 'authorized_user' }))
      .toThrow(GoogleCredentialInvalidError)
  })

  it('rejects a credential with no client_email', () => {
    const { client_email: _omitted, ...withoutEmail } = VALID_CREDENTIAL

    expect(() => parseGoogleServiceAccountCredential(withoutEmail)).toThrow(GoogleCredentialInvalidError)
  })

  it('rejects a credential with no private_key', () => {
    const { private_key: _omitted, ...withoutKey } = VALID_CREDENTIAL

    expect(() => parseGoogleServiceAccountCredential(withoutKey)).toThrow(GoogleCredentialInvalidError)
  })

  it('rejects a blank private_key', () => {
    expect(() => parseGoogleServiceAccountCredential({ ...VALID_CREDENTIAL, private_key: '   ' }))
      .toThrow(GoogleCredentialInvalidError)
  })

  it('rejects a handle that is not JSON', () => {
    expect(() => parseGoogleServiceAccountCredential('not json at all')).toThrow(GoogleCredentialInvalidError)
  })

  it('rejects a JSON array and a JSON primitive', () => {
    expect(() => parseGoogleServiceAccountCredential('[]')).toThrow(GoogleCredentialInvalidError)
    expect(() => parseGoogleServiceAccountCredential('42')).toThrow(GoogleCredentialInvalidError)
  })
})

describe('parseGoogleServiceAccountCredential — no secret ever escapes', () => {
  it('does not include any fragment of the private key in a parse failure message', () => {
    const malformed = `{"type":"service_account","client_email":"a@b.com","private_key":"${FAKE_PRIVATE_KEY.replace(/\n/g, '\\n')}"`

    try {
      parseGoogleServiceAccountCredential(malformed)
      expect.unreachable('expected a GoogleCredentialInvalidError')
    }
    catch (err: unknown) {
      const text = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
      expect(text).not.toContain('BEGIN PRIVATE KEY')
      expect(text).not.toContain('NOT-A-REAL-KEY')
    }
  })

  it('does not include the private key when a required field is missing', () => {
    try {
      parseGoogleServiceAccountCredential({ ...VALID_CREDENTIAL, client_email: '' })
      expect.unreachable('expected a GoogleCredentialInvalidError')
    }
    catch (err: unknown) {
      expect(err instanceof Error ? err.message : '').not.toContain('NOT-A-REAL-KEY')
    }
  })

  it('redacts the credential when it is stringified or JSON-serialized', () => {
    const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)

    expect(String(credential)).not.toContain('NOT-A-REAL-KEY')
    expect(JSON.stringify(credential)).not.toContain('NOT-A-REAL-KEY')
    expect(`${credential}`).toBe('[redacted service-account credential]')
  })

  it('is frozen, so no caller can mutate the parsed credential in place', () => {
    const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)

    expect(Object.isFrozen(credential)).toBe(true)
  })
})

describe('readGoogleServiceAccountCredential', () => {
  it('reads the approved handle name from the supplied environment', () => {
    expect(GOOGLE_SERVICE_ACCOUNT_ENV_KEY).toBe('GOOGLE_SERVICE_ACCOUNT_JSON')

    const credential = readGoogleServiceAccountCredential({
      [GOOGLE_SERVICE_ACCOUNT_ENV_KEY]: JSON.stringify(VALID_CREDENTIAL),
    })

    expect(credential.clientEmail).toContain('@')
  })

  it('throws GoogleCredentialMissingError when the handle is absent', () => {
    expect(() => readGoogleServiceAccountCredential({})).toThrow(GoogleCredentialMissingError)
  })

  it('throws GoogleCredentialMissingError when the handle is blank', () => {
    expect(() => readGoogleServiceAccountCredential({ [GOOGLE_SERVICE_ACCOUNT_ENV_KEY]: '   ' }))
      .toThrow(GoogleCredentialMissingError)
  })

  it('distinguishes "not configured" from "configured wrongly"', () => {
    expect(() => readGoogleServiceAccountCredential({ [GOOGLE_SERVICE_ACCOUNT_ENV_KEY]: '{"type":"user"}' }))
      .toThrow(GoogleCredentialInvalidError)
  })
})
