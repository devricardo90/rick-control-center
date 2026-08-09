/**
 * GET /api/projects/:id/documents/:sourceId/snapshot
 *
 * Returns the current (newest) immutable snapshot for one registered
 * document, including its normalized text — the only endpoint in the
 * application that returns document body content.
 *
 * Project isolation: the snapshot is looked up by `(projectId, sourceId)`
 * together. Another project's document is a 404 here, exactly like a
 * document that does not exist — a cross-project probe can never confirm
 * that someone else's source exists.
 *
 * Reads are allowed for every project status, including ARCHIVED.
 *
 * NDERCC-13: register and snapshot approved Google Docs.
 */
import { findDocumentSourceForProject, findLatestDocumentSnapshot, findProjectById, prisma } from '@rick/database'
import { toPublicDocumentSnapshot } from '../../../../../utils/public-document-source'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  const sourceId = getRouterParam(event, 'sourceId')

  if (!projectId || !sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id and document id are required.' })
  }

  const project = await findProjectById(prisma, projectId)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }

  const source = await findDocumentSourceForProject(prisma, projectId, sourceId)
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  }

  const snapshot = await findLatestDocumentSnapshot(prisma, projectId, sourceId)
  if (!snapshot) {
    throw createError({ statusCode: 404, statusMessage: 'This document has not been synchronized yet.' })
  }

  return toPublicDocumentSnapshot(snapshot)
})
