/**
 * PUT /api/projects/:id/integrations/github
 *
 * Connects and verifies a GitHub repository for a project. Body:
 * `{ owner, repository }` only. Idempotent — reconnecting the same
 * owner/repository updates the existing row rather than duplicating it
 * (see upsertVerifiedIntegrationConnection).
 *
 * The GITHUB_TOKEN environment variable (server-only, per DEC-RIC-001)
 * is read here, once, and passed to the adapter — it is never read from
 * the request, never included in any response, and never logged.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
import {
  ArchivedProjectReadOnlyError,
  findProjectById,
  prisma,
  ProjectNotFoundError,
  upsertVerifiedIntegrationConnection,
} from '@rick/database'
import { verifyGitHubRepository, type NormalizedGitHubRepository } from '@rick/integrations'
import { throwForGitHubAdapterError } from '../../../../utils/github-error-mapping'
import { parseConnectGitHubRepositoryInput } from '../../../../utils/parse-github-connection-input'
import { toPublicGitHubConnection } from '../../../../utils/public-github-connection'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  const rawBody: unknown = await readBody(event)
  const input = parseConnectGitHubRepositoryInput(rawBody)
  if (!input) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GitHub connection request.' })
  }

  const project = await findProjectById(prisma, projectId)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }
  if (project.status === 'ARCHIVED') {
    throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot add or modify integrations.' })
  }

  const token = process.env['GITHUB_TOKEN']

  let repository: NormalizedGitHubRepository
  try {
    repository = await verifyGitHubRepository({
      owner: input.owner,
      repository: input.repository,
      ...(token !== undefined ? { token } : {}),
    })
  }
  catch (err: unknown) {
    throw throwForGitHubAdapterError(err)
  }

  try {
    const connection = await upsertVerifiedIntegrationConnection(prisma, {
      projectId,
      provider: 'GITHUB',
      displayName: repository.fullName,
      externalAccountId: repository.externalId,
      configurationJson: { ...repository },
      verifiedAt: new Date(),
    })
    return toPublicGitHubConnection(connection)
  }
  catch (err: unknown) {
    if (err instanceof ProjectNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
    }
    if (err instanceof ArchivedProjectReadOnlyError) {
      throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot add or modify integrations.' })
    }
    console.error('Unexpected error persisting GitHub connection.', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to save the GitHub connection.' })
  }
})
