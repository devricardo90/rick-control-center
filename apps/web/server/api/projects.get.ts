/**
 * GET /api/projects
 *
 * Lists persisted projects for the authenticated operator. No pagination
 * or filtering — Sprint 0 scope is a single flat list.
 *
 * NDERCC-7: minimal project interface.
 */
import { listProjects, prisma } from '@rick/database'
import { toPublicProject } from '../utils/public-project'

export default defineEventHandler(async () => {
  const projects = await listProjects(prisma)
  return projects.map(toPublicProject)
})
