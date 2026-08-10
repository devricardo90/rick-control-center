/**
 * GET /api/projects/:id/documents
 *
 * Lists the project's registered strategic document sources together with
 * each one's newest immutable snapshot summary. 404 for an unknown
 * project; empty array if the project exists but has none.
 *
 * Reads are allowed for every project status, including ARCHIVED —
 * archived projects are read-only, not invisible.
 *
 * No document body content is returned here (see
 * `utils/public-document-source.ts`); use the single-snapshot endpoint for
 * that.
 *
 * NDERCC-13: register and snapshot approved Google Docs.
 */
import {
  findProjectById,
  listDocumentSourcesForProject,
  listLatestDocumentSnapshotsForProject,
  prisma,
  type DocumentSnapshotSummary,
} from '@rick/database'
import { toPublicDocumentSource } from '../../../utils/public-document-source'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  const project = await findProjectById(prisma, projectId)

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }

  const [sources, latestSnapshots] = await Promise.all([
    listDocumentSourcesForProject(prisma, projectId),
    listLatestDocumentSnapshotsForProject(prisma, projectId),
  ])

  const bySourceId = new Map<string, DocumentSnapshotSummary>(
    latestSnapshots.map(snapshot => [snapshot.documentSourceId, snapshot]),
  )

  return sources.map(source => toPublicDocumentSource(source, bySourceId.get(source.id) ?? null))
})
