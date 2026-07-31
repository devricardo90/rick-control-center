/**
 * Typed persistence surface for AuthSession.
 *
 * `tokenDigest` is deliberately excluded from every type and query result
 * this module returns — callers work with the raw token (returned once, at
 * creation, for the caller to set as a cookie) or with `SafeAuthSession`.
 *
 * NDERCC-6: single-user authentication.
 */
import type { AuthSession, PrismaClient } from '@prisma/client'
import { generateSessionToken, hashSessionToken } from './auth/session-token.js'

export type SafeAuthSession = Omit<AuthSession, 'tokenDigest'>

const SAFE_SESSION_SELECT = {
  id: true,
  operatorId: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
} as const

/** Absolute session lifetime. No refresh or sliding expiration. */
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export interface CreatedSession {
  rawToken: string
  session: SafeAuthSession
}

export async function createSession(
  client: PrismaClient,
  operatorId: string,
): Promise<CreatedSession> {
  const rawToken = generateSessionToken()
  const tokenDigest = hashSessionToken(rawToken)
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  const session = await client.authSession.create({
    data: { operatorId, tokenDigest, expiresAt },
    select: SAFE_SESSION_SELECT,
  })

  return { rawToken, session }
}

/**
 * Validate a raw session token: looks it up by digest and rejects unknown,
 * expired, or revoked sessions. Returns `null` for every rejection reason —
 * callers must not distinguish "unknown" from "expired" from "revoked" in
 * anything user-visible.
 */
export async function validateSession(
  client: PrismaClient,
  rawToken: string,
): Promise<SafeAuthSession | null> {
  const tokenDigest = hashSessionToken(rawToken)

  const session = await client.authSession.findUnique({
    where: { tokenDigest },
    select: SAFE_SESSION_SELECT,
  })

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
    return null
  }

  return session
}

export async function revokeSessionByToken(
  client: PrismaClient,
  rawToken: string,
): Promise<void> {
  const tokenDigest = hashSessionToken(rawToken)

  await client.authSession.updateMany({
    where: { tokenDigest, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllSessionsForOperator(
  client: PrismaClient,
  operatorId: string,
): Promise<void> {
  await client.authSession.updateMany({
    where: { operatorId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
