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
import { format, inspect } from 'node:util'
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

  it('drops private_key_id and client_id, keeping only the narrowed fields', () => {
    const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)

    // `privateKey` is present but deliberately non-enumerable, so it does
    // not appear here — see the "not reachable by Node inspection" suite.
    expect(Object.keys(credential).sort()).toEqual(['clientEmail', 'projectId'])
    expect(Object.getOwnPropertyNames(credential)).toContain('privateKey')
    expect(credential.privateKey).toBe(FAKE_PRIVATE_KEY)
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

  it('is frozen, so no caller can strip the redaction guards', () => {
    const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)

    expect(Object.isFrozen(credential)).toBe(true)
  })
})

/**
 * Corrective review finding 1. Overriding `toString`/`toJSON` did not
 * protect `console.log(credential)`, because console formats objects with
 * `util.inspect`, which consults neither hook. Each disclosure path a
 * secret realistically travels through is asserted separately here, so a
 * future refactor cannot silently reopen one of them.
 */
describe('parseGoogleServiceAccountCredential — private key is not reachable by Node inspection or logging', () => {
  const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)
  const KEY_FRAGMENT = 'NOT-A-REAL-KEY'

  function expectRedacted(rendered: string): void {
    expect(rendered).not.toContain(KEY_FRAGMENT)
    expect(rendered).not.toContain('BEGIN PRIVATE KEY')
  }

  it('util.inspect does not render the private key', () => {
    expectRedacted(inspect(credential))
    expectRedacted(inspect(credential, { depth: null }))
  })

  it('util.inspect with showHidden does not render the private key either', () => {
    // showHidden would otherwise reveal non-enumerable properties; the
    // custom inspect hook is what closes this specific hole.
    expectRedacted(inspect(credential, { showHidden: true, depth: null }))
  })

  it('console.log formatting does not render the private key', () => {
    // `format('%s' | '%o' | '%O' | '%j')` and the bare-object form are the
    // shapes a stray debug statement actually takes.
    expectRedacted(format(credential))
    expectRedacted(format('%s', credential))
    expectRedacted(format('%o', credential))
    expectRedacted(format('%O', credential))
    expectRedacted(format('%j', credential))
    expectRedacted(format('credential: %s', credential))
  })

  it('an actual console.log call does not emit the private key', () => {
    const written: string[] = []
    const original = console.log
    console.log = (...args: unknown[]): void => {
      written.push(format(...args))
    }
    try {
      console.log(credential)
      console.log('debugging', credential)
    }
    finally {
      console.log = original
    }

    expect(written).toHaveLength(2)
    for (const line of written) {
      expectRedacted(line)
    }
  })
})

/** Same finding, second half: serialization and value-copying paths. */
describe('parseGoogleServiceAccountCredential — private key is not reachable by serialization or copying', () => {
  const credential = parseGoogleServiceAccountCredential(VALID_CREDENTIAL)
  const KEY_FRAGMENT = 'NOT-A-REAL-KEY'

  function expectRedacted(rendered: string): void {
    expect(rendered).not.toContain(KEY_FRAGMENT)
    expect(rendered).not.toContain('BEGIN PRIVATE KEY')
  }

  it('JSON serialization does not render the private key', () => {
    expectRedacted(JSON.stringify(credential) ?? '')
    expectRedacted(JSON.stringify({ nested: { credential } }))
    expectRedacted(JSON.stringify([credential]))
  })

  it('string coercion renders a fixed redaction marker', () => {
    expect(`${credential}`).toBe('[redacted service-account credential]')
    expect(String(credential)).toBe('[redacted service-account credential]')
    expectRedacted(`${credential}`)
  })

  it('enumeration and spread do not copy the private key out', () => {
    expect(Object.keys(credential)).not.toContain('privateKey')
    expect(Object.values(credential)).not.toContain(FAKE_PRIVATE_KEY)
    expect(Object.entries(credential).flat()).not.toContain(FAKE_PRIVATE_KEY)

    const spread = { ...credential }
    expect('privateKey' in spread).toBe(false)
    expectRedacted(JSON.stringify(spread))

    const forInKeys: string[] = []
    for (const key in credential) {
      forInKeys.push(key)
    }
    expect(forInKeys).not.toContain('privateKey')
  })

  it('Object.assign copying does not carry the private key', () => {
    expect('privateKey' in Object.assign({}, credential)).toBe(false)
  })

  it('still exposes the private key to direct in-process access, which the token provider needs', () => {
    expect(credential.privateKey).toBe(FAKE_PRIVATE_KEY)
    expect(credential.clientEmail).toBe('rick@rick-control-center.iam.gserviceaccount.com')
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
