/**
 * GET /api/projects/:id
 *
 * Fetches a single project for the settings view. Returns 404 for an
 * unknown id and a generic 500 for anything unexpected — never a raw
 * Prisma error or stack trace.
 *
 * NDERCC-10: complete project settings and lifecycle.
 */
import { findProjectById, prisma, type Project } from '@rick/database'
import { toPublicProject } from '../../utils/public-project'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  let project: Project | null

  try {
    project = await findProjectById(prisma, id)
  }
  catch (err: unknown) {
    console.error('Unexpected error fetching project.', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to fetch project.' })
  }

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }

  return toPublicProject(project)
})
