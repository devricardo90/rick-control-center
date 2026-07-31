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
import { ProjectNotFoundError } from './errors.js'

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
