/**
 * Typed persistence surface for IntegrationConnection — a project-owned
 * integration entity. `configurationEncrypted` is treated as an opaque
 * already-encrypted payload throughout this file; nothing here encrypts,
 * decrypts, or inspects it.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { Prisma } from '@prisma/client'
import type {
  IntegrationConnection,
  IntegrationConnectionStatus,
  IntegrationProvider,
  PrismaClient,
} from '@prisma/client'
import { ArchivedProjectReadOnlyError, IntegrationConnectionNotFoundError, ProjectNotFoundError } from './errors.js'

export type { IntegrationConnection, IntegrationConnectionStatus, IntegrationProvider }

export interface CreateIntegrationConnectionInput {
  projectId: string
  provider: IntegrationProvider
  displayName: string
  status?: IntegrationConnectionStatus
  externalAccountId?: string
  configurationEncrypted?: string
  lastVerifiedAt?: Date
}

function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003'
}

export async function createIntegrationConnection(
  client: PrismaClient,
  input: CreateIntegrationConnectionInput,
): Promise<IntegrationConnection> {
  try {
    return await client.integrationConnection.create({
      data: {
        projectId: input.projectId,
        provider: input.provider,
        displayName: input.displayName,
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.externalAccountId !== undefined ? { externalAccountId: input.externalAccountId } : {}),
        ...(input.configurationEncrypted !== undefined ? { configurationEncrypted: input.configurationEncrypted } : {}),
        ...(input.lastVerifiedAt !== undefined ? { lastVerifiedAt: input.lastVerifiedAt } : {}),
      },
    })
  }
  catch (err: unknown) {
    if (isForeignKeyViolation(err)) {
      throw new ProjectNotFoundError(input.projectId)
    }
    throw err
  }
}

export async function listIntegrationConnectionsByProject(
  client: PrismaClient,
  projectId: string,
): Promise<IntegrationConnection[]> {
  return client.integrationConnection.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  })
}

/**
 * List only the GitHub-provider connections for a project — the shape
 * the NDERCC-11 GitHub-integration endpoints read from.
 */
export async function listGitHubConnectionsByProject(
  client: PrismaClient,
  projectId: string,
): Promise<IntegrationConnection[]> {
  return client.integrationConnection.findMany({
    where: { projectId, provider: 'GITHUB' },
    orderBy: { createdAt: 'asc' },
  })
}

async function assertProjectIsMutable(client: PrismaClient, projectId: string): Promise<void> {
  const project = await client.project.findUnique({ where: { id: projectId } })

  if (!project) {
    throw new ProjectNotFoundError(projectId)
  }
  if (project.status === 'ARCHIVED') {
    throw new ArchivedProjectReadOnlyError(projectId)
  }
}

export interface UpsertVerifiedIntegrationConnectionInput {
  projectId: string
  provider: IntegrationProvider
  displayName: string
  externalAccountId: string
  // A plain JSON-safe record, not `Prisma.InputJsonValue` — that type
  // requires a string index signature that a caller's own domain
  // interface (e.g. @rick/integrations' NormalizedGitHubRepository)
  // won't structurally have. The cast to Prisma's JSON type happens once,
  // here, inside the only package that needs to know about it.
  configurationJson: Record<string, unknown>
  verifiedAt: Date
}

/**
 * Create or update a verified integration connection idempotently,
 * keyed by (project, provider, external account id) — a second call with
 * the same three values updates the same row rather than creating a
 * duplicate (NDERCC-11 acceptance criteria 7 and 10). A different
 * `externalAccountId` for the same project/provider creates a distinct
 * row, so more than one external repository can remain connected to the
 * same project (acceptance criterion 8).
 *
 * Rejects an unknown or archived project before touching the connection
 * table at all.
 */
export async function upsertVerifiedIntegrationConnection(
  client: PrismaClient,
  input: UpsertVerifiedIntegrationConnectionInput,
): Promise<IntegrationConnection> {
  await assertProjectIsMutable(client, input.projectId)

  return client.integrationConnection.upsert({
    where: {
      projectId_provider_externalAccountId: {
        projectId: input.projectId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
      },
    },
    create: {
      projectId: input.projectId,
      provider: input.provider,
      displayName: input.displayName,
      externalAccountId: input.externalAccountId,
      configurationJson: input.configurationJson as Prisma.InputJsonValue,
      status: 'CONNECTED',
      lastVerifiedAt: input.verifiedAt,
    },
    update: {
      displayName: input.displayName,
      configurationJson: input.configurationJson as Prisma.InputJsonValue,
      status: 'CONNECTED',
      lastVerifiedAt: input.verifiedAt,
    },
  })
}

/**
 * Find a GitHub connection scoped to a specific project — used to load
 * the connection a re-verification request targets. Returns `null` (not
 * an error) when the id doesn't exist, belongs to a different project,
 * or isn't a GitHub connection, so callers cannot distinguish "wrong
 * project" from "doesn't exist" — the same isolation guarantee
 * `markIntegrationConnectionError` provides on the write side.
 */
export async function findGitHubConnectionForProject(
  client: PrismaClient,
  projectId: string,
  connectionId: string,
): Promise<IntegrationConnection | null> {
  const connection = await client.integrationConnection.findUnique({ where: { id: connectionId } })

  if (!connection || connection.projectId !== projectId || connection.provider !== 'GITHUB') {
    return null
  }

  return connection
}

/**
 * Mark an existing connection ERROR after a failed re-verification,
 * without touching `configurationJson` or `lastVerifiedAt` — the last
 * successfully verified snapshot and timestamp are preserved exactly as
 * they were (NDERCC-11: `lastVerifiedAt` represents the last *successful*
 * verification only, and must never advance on a failed attempt).
 *
 * Project-scoped: a connection id that exists but belongs to a different
 * project is treated identically to one that doesn't exist, so this
 * cannot be used to probe or mutate another project's connection.
 */
export async function markIntegrationConnectionError(
  client: PrismaClient,
  projectId: string,
  connectionId: string,
): Promise<IntegrationConnection> {
  const connection = await client.integrationConnection.findUnique({ where: { id: connectionId } })

  if (!connection || connection.projectId !== projectId) {
    throw new IntegrationConnectionNotFoundError(connectionId)
  }

  return client.integrationConnection.update({
    where: { id: connectionId },
    data: { status: 'ERROR' },
  })
}
