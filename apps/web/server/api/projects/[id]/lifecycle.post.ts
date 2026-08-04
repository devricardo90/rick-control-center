/**
 * POST /api/projects/:id/lifecycle
 *
 * Performs a project lifecycle transition: `{ "action": "PAUSE" |
 * "REACTIVATE" | "ARCHIVE" }`. Archival sets `status` and `archivedAt`
 * atomically (see `transitionProjectLifecycle`).
 *
 * Response policy (same as PATCH /api/projects/:id — see that file):
 *   - 400: `action` missing or not one of the three known values.
 *   - 404: the project id does not exist.
 *   - 409: `action` is well-formed but does not apply from the project's
 *     current status — including any action against an already-ARCHIVED
 *     project, which is terminal.
 *   - 500: anything unexpected; never a raw Prisma error or internal detail.
 *
 * NDERCC-10: complete project settings and lifecycle.
 */
import {
  InvalidProjectTransitionError,
  ProjectNotFoundError,
  prisma,
  transitionProjectLifecycle,
} from '@rick/database'
import { parseProjectLifecycleAction } from '../../../utils/parse-project-lifecycle-input'
import { toPublicProject } from '../../../utils/public-project'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  const rawBody: unknown = await readBody(event)
  const action = parseProjectLifecycleAction(rawBody)

  if (!action) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid lifecycle action.' })
  }

  try {
    const project = await transitionProjectLifecycle(prisma, id, action)
    return toPublicProject(project)
  }
  catch (err: unknown) {
    if (err instanceof ProjectNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
    }
    if (err instanceof InvalidProjectTransitionError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This lifecycle action is not allowed from the project\'s current status.',
      })
    }
    console.error('Unexpected error transitioning project lifecycle.', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to update project lifecycle.' })
  }
})
