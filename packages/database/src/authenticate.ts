/**
 * Login flow: verifies operator credentials and, on success, creates a
 * session. Never reveals whether a username exists — a wrong password and
 * an unknown username both produce the same `{ ok: false }` result, and
 * `DUMMY_PASSWORD_HASH` keeps the two paths' timing close.
 *
 * NDERCC-6: single-user authentication.
 */
import type { PrismaClient } from '@prisma/client'
import { DUMMY_PASSWORD_HASH, verifyPassword } from './auth/password.js'
import { createSession, type SafeAuthSession } from './auth-session.js'
import { findOperatorCredentialsByUsername } from './operator.js'

export interface LoginCredentials {
  username: string
  password: string
}

export type AuthenticationResult
  = | { ok: true, operatorId: string, rawToken: string, session: SafeAuthSession }
    | { ok: false }

export async function authenticateOperator(
  client: PrismaClient,
  credentials: LoginCredentials,
): Promise<AuthenticationResult> {
  const operator = await findOperatorCredentialsByUsername(client, credentials.username)
  const passwordHash = operator?.passwordHash ?? DUMMY_PASSWORD_HASH
  const passwordValid = await verifyPassword(passwordHash, credentials.password)

  if (!operator || !passwordValid) {
    return { ok: false }
  }

  const { rawToken, session } = await createSession(client, operator.id)

  return { ok: true, operatorId: operator.id, rawToken, session }
}
