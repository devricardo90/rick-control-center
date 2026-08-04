/**
 * Typed persistence surface for Operator — the installation's single
 * primary operator. `passwordHash` is deliberately excluded from every
 * type and query result returned by this module except the internal
 * credential lookup used by the authentication flow itself.
 *
 * NDERCC-6: single-user authentication.
 */
import type { Operator, PrismaClient } from '@prisma/client'

export type SafeOperator = Omit<Operator, 'passwordHash'>

const SAFE_OPERATOR_SELECT = {
  id: true,
  singleton: true,
  username: true,
  createdAt: true,
  updatedAt: true,
} as const

export interface UpsertPrimaryOperatorInput {
  username: string
  passwordHash: string
}

/**
 * Create or update the single canonical operator row. Always targets the
 * same row via the `singleton` unique constraint — this is the only
 * function in the codebase that is allowed to write `Operator` rows, and it
 * can never produce a second one (the database rejects it).
 *
 * Does NOT revoke sessions. Administrative credential changes (bootstrap,
 * password rotation) must go through
 * `upsertPrimaryOperatorAndRevokeSessions` instead, which does both in one
 * transaction — this function alone is only safe for initial provisioning
 * or test setup where no pre-existing session needs to be invalidated.
 */
export async function upsertPrimaryOperator(
  client: PrismaClient,
  input: UpsertPrimaryOperatorInput,
): Promise<SafeOperator> {
  return client.operator.upsert({
    where: { singleton: true },
    create: { singleton: true, username: input.username, passwordHash: input.passwordHash },
    update: { username: input.username, passwordHash: input.passwordHash },
    select: SAFE_OPERATOR_SELECT,
  })
}

/**
 * Upsert the canonical operator and revoke all of its existing sessions in
 * a single Prisma transaction. This is the only credential-change path
 * that satisfies the contract requirement that changing the operator
 * password revokes every previously issued session: running the upsert
 * and the revocation as two independent calls (as the bootstrap CLI did
 * before NDERCC-6 review 4855039184) leaves a window where a completed
 * password change coexists with still-valid old sessions if the second
 * call fails.
 */
export async function upsertPrimaryOperatorAndRevokeSessions(
  client: PrismaClient,
  input: UpsertPrimaryOperatorInput,
): Promise<SafeOperator> {
  return client.$transaction(async (tx) => {
    const operator = await tx.operator.upsert({
      where: { singleton: true },
      create: { singleton: true, username: input.username, passwordHash: input.passwordHash },
      update: { username: input.username, passwordHash: input.passwordHash },
      select: SAFE_OPERATOR_SELECT,
    })

    await tx.authSession.updateMany({
      where: { operatorId: operator.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })

    return operator
  })
}

export async function getPrimaryOperator(client: PrismaClient): Promise<SafeOperator | null> {
  return client.operator.findUnique({
    where: { singleton: true },
    select: SAFE_OPERATOR_SELECT,
  })
}

/**
 * Internal credential lookup for the authentication flow only. This is the
 * sole place in the codebase permitted to read `passwordHash` off an
 * `Operator` row — every other consumer must use `SafeOperator`.
 */
export async function findOperatorCredentialsByUsername(
  client: PrismaClient,
  username: string,
): Promise<{ id: string, passwordHash: string } | null> {
  return client.operator.findUnique({
    where: { username },
    select: { id: true, passwordHash: true },
  })
}
