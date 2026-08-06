/**
 * GET /api/projects/:id/integrations/github
 *
 * Lists the GitHub connections for a project. 404 for an unknown
 * project; empty array if the project exists but has none.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
import { findProjectById, listGitHubConnectionsByProject, prisma } from '@rick/database'
import { toPublicGitHubConnection } from '../../../../utils/public-github-connection'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  const project = await findProjectById(prisma, projectId)

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }

  const connections = await listGitHubConnectionsByProject(prisma, projectId)

  return connections.map(toPublicGitHubConnection)
})
