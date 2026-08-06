/**
 * Public HTTP representation of a GitHub `IntegrationConnection` — a
 * dedicated, closed allowlist DTO. `configurationEncrypted` is not a
 * field on this type at all (never `null`-as-a-value, simply absent from
 * the shape), and the Prisma model is never serialized directly.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
import type { IntegrationConnection, IntegrationConnectionStatus } from '@rick/database'
import { parseStoredGitHubConfiguration, type NormalizedGitHubRepository } from '@rick/integrations'

export interface PublicGitHubConnection {
  id: string
  projectId: string
  displayName: string
  status: IntegrationConnectionStatus
  externalAccountId: string | null
  configuration: NormalizedGitHubRepository | null
  lastVerifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export function toPublicGitHubConnection(connection: IntegrationConnection): PublicGitHubConnection {
  return {
    id: connection.id,
    projectId: connection.projectId,
    displayName: connection.displayName,
    status: connection.status,
    externalAccountId: connection.externalAccountId,
    configuration: parseStoredGitHubConfiguration(connection.configurationJson),
    lastVerifiedAt: connection.lastVerifiedAt === null ? null : connection.lastVerifiedAt.toISOString(),
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  }
}
