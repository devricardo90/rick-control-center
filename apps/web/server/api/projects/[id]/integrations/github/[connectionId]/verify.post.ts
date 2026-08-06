/**
 * POST /api/projects/:id/integrations/github/:connectionId/verify
 *
 * Re-runs verification for an existing GitHub connection, using the
 * owner/repository from its own last-known-good configuration (never
 * accepted from the request body — re-verification re-checks the
 * repository that is already connected, it does not change it).
 *
 * On success: the connection is upserted normally (same row — the
 * external repository id does not change), `status` returns to
 * `CONNECTED`, `configurationJson` and `lastVerifiedAt` advance.
 *
 * On failure: the connection is marked `ERROR` — its previous
 * `configurationJson` and `lastVerifiedAt` are left untouched (NDERCC-11:
 * `lastVerifiedAt` must never advance on a failed attempt, and the last
 * valid snapshot must survive a failed re-verification).
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
import {
  findGitHubConnectionForProject,
  findProjectById,
  markIntegrationConnectionError,
  prisma,
  upsertVerifiedIntegrationConnection,
} from '@rick/database'
import { parseStoredGitHubConfiguration, verifyGitHubRepository, type NormalizedGitHubRepository } from '@rick/integrations'
import { throwForGitHubAdapterError } from '../../../../../../utils/github-error-mapping'
import { toPublicGitHubConnection } from '../../../../../../utils/public-github-connection'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const connectionId = getRouterParam(event, 'connectionId')
  if (!projectId || !connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id and connection id are required.' })
  }

  const project = await findProjectById(prisma, projectId)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }
  if (project.status === 'ARCHIVED') {
    throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot add or modify integrations.' })
  }

  const connection = await findGitHubConnectionForProject(prisma, projectId, connectionId)
  if (!connection) {
    throw createError({ statusCode: 404, statusMessage: 'GitHub connection not found.' })
  }

  const previousConfig = parseStoredGitHubConfiguration(connection.configurationJson)
  if (!previousConfig) {
    console.error('GitHub connection has no valid stored configuration to re-verify.', { connectionId })
    throw createError({ statusCode: 500, statusMessage: 'Unable to re-verify this connection.' })
  }

  const token = process.env['GITHUB_TOKEN']

  let repository: NormalizedGitHubRepository
  try {
    repository = await verifyGitHubRepository({
      owner: previousConfig.owner,
      repository: previousConfig.name,
      ...(token !== undefined ? { token } : {}),
    })
  }
  catch (err: unknown) {
    await markIntegrationConnectionError(prisma, projectId, connectionId)
    throw throwForGitHubAdapterError(err)
  }

  const updated = await upsertVerifiedIntegrationConnection(prisma, {
    projectId,
    provider: 'GITHUB',
    displayName: repository.fullName,
    externalAccountId: repository.externalId,
    configurationJson: { ...repository },
    verifiedAt: new Date(),
  })

  return toPublicGitHubConnection(updated)
})
