/**
 * POST /api/projects
 *
 * Creates a project for the authenticated operator. Request bodies are
 * untrusted input — parsed and narrowed via parseCreateProjectInput before
 * anything downstream touches them. Duplicate keys and validation
 * failures are translated to deterministic HTTP responses; no raw Prisma
 * error, stack trace, or internal detail is ever returned to the client.
 *
 * NDERCC-7: minimal project interface.
 */
import { createProject, DuplicateProjectKeyError, prisma } from '@rick/database'
import { parseCreateProjectInput } from '../utils/parse-project-input'
import { toPublicProject } from '../utils/public-project'

export default defineEventHandler(async (event) => {
  const rawBody: unknown = await readBody(event)
  const input = parseCreateProjectInput(rawBody)

  if (!input) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project data.' })
  }

  try {
    const project = await createProject(prisma, input)
    setResponseStatus(event, 201)
    return toPublicProject(project)
  }
  catch (err: unknown) {
    if (err instanceof DuplicateProjectKeyError) {
      throw createError({ statusCode: 409, statusMessage: 'A project with this key already exists.' })
    }
    console.error('Unexpected error creating project.', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to create project.' })
  }
})
