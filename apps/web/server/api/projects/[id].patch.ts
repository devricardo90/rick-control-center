/**
 * PATCH /api/projects/:id
 *
 * Updates a project's editable settings (name, description, autonomy
 * policy, default branch policy, workspace path). `key` is immutable and
 * is never read from the request body — see parseUpdateProjectSettingsInput.
 *
 * Response policy (documented once, applied consistently across every
 * project-detail endpoint in this task):
 *   - 400: the request body itself is malformed (missing/empty required
 *     field, or an enum value outside the known set) — a request-shape
 *     problem, independent of the project's current state.
 *   - 404: the project id does not exist.
 *   - 409: the request is well-formed but conflicts with the project's
 *     current status — here, attempting to edit an archived project.
 *   - 500: anything unexpected; never a raw Prisma error, stack trace, or
 *     internal detail.
 *
 * NDERCC-10: complete project settings and lifecycle.
 */
import {
  ArchivedProjectReadOnlyError,
  ProjectNotFoundError,
  prisma,
  updateProjectSettings,
} from '@rick/database'
import { parseUpdateProjectSettingsInput } from '../../utils/parse-project-update-input'
import { toPublicProject } from '../../utils/public-project'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  const rawBody: unknown = await readBody(event)
  const input = parseUpdateProjectSettingsInput(rawBody)

  if (!input) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid project settings.' })
  }

  try {
    const project = await updateProjectSettings(prisma, id, input)
    return toPublicProject(project)
  }
  catch (err: unknown) {
    if (err instanceof ProjectNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
    }
    if (err instanceof ArchivedProjectReadOnlyError) {
      throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot be edited.' })
    }
    console.error('Unexpected error updating project settings.', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to update project.' })
  }
})
