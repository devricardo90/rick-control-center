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
