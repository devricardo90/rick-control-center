/**
 * POST /api/projects/:id/documents/:sourceId/sync
 *
 * Synchronizes one registered strategic document: reads it through the
 * read-only Drive adapter, normalizes the exported text, and persists an
 * immutable snapshot while atomically advancing the source's current
 * synchronization state.
 *
 * The external file ID is taken from the stored source, never from the
 * request body — re-synchronizing re-reads the document that is already
 * registered, it does not change which document that is.
 *
 * Failure behavior (the property this endpoint exists to guarantee):
 * when the adapter fails, the source is marked ERROR through the
 * NDERCC-12 path, which changes `syncStatus` and nothing else. The
 * previous `revision`, `checksum`, `metadataJson`, `lastSyncedAt` and
 * every previously captured immutable snapshot survive untouched. The
 * snapshot write and the source update share one transaction, so a
 * mid-write failure cannot leave the two disagreeing either.
 *
 * NDERCC-13: register and snapshot approved Google Docs.
 */
import {
  findDocumentSourceForProject,
  findProjectById,
  markDocumentSourceSyncError,
  prisma,
  recordDocumentSnapshotSync,
} from '@rick/database'
import type { GoogleDocumentSnapshot } from '@rick/integrations'
import { getGoogleDriveReader } from '../../../../../utils/google-drive-reader'
import { throwForGoogleAdapterError } from '../../../../../utils/google-error-mapping'
import {
  toPublicDocumentSource,
  type PublicDocumentSyncResult,
} from '../../../../../utils/public-document-source'

/**
 * Non-secret provider metadata only. Every key here is deliberately
 * chosen: no credential, no header, no raw response, and no document body
 * — the DEC-RIC-002 recursive scanner in @rick/database rejects the write
 * outright if that ever stops being true.
 */
function toSafeProviderMetadata(snapshot: GoogleDocumentSnapshot): Record<string, unknown> {
  return {
    provider: 'GOOGLE_DRIVE',
    fileId: snapshot.metadata.id,
    title: snapshot.metadata.name,
    mimeType: snapshot.metadata.mimeType,
    providerVersion: snapshot.providerVersion,
    providerModifiedAt: snapshot.metadata.modifiedTime,
    webViewLink: snapshot.metadata.webViewLink,
    normalizedByteLength: snapshot.byteLength,
    readAttempts: snapshot.attempts,
  }
}

/**
 * Narrows Drive's `modifiedTime` into a real `Date`.
 *
 * Drive documents this as RFC 3339, but it is still provider input and is
 * treated as untrusted: `new Date('nonsense')` yields an `Invalid Date`,
 * which Prisma rejects mid-transaction and would surface as an opaque 500
 * on an otherwise successful read. An unparseable timestamp is simply
 * absent provenance, so it degrades to `null` — the column is nullable
 * precisely for the case where Drive gives us nothing usable.
 */
function toProviderModifiedAt(modifiedTime: string | null): Date | null {
  if (modifiedTime === null) {
    return null
  }
  const parsed = new Date(modifiedTime)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Best-effort ERROR marking: a failure here must never mask the adapter error that caused it. */
async function markSyncErrorSafely(projectId: string, sourceId: string): Promise<void> {
  try {
    await markDocumentSourceSyncError(prisma, projectId, sourceId)
  }
  catch (err: unknown) {
    console.error('Unable to mark the document source as ERROR after a failed sync.', err)
  }
}

export default defineEventHandler(async (event): Promise<PublicDocumentSyncResult> => {
  const projectId = getRouterParam(event, 'id')
  const sourceId = getRouterParam(event, 'sourceId')
  if (!projectId || !sourceId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id and document id are required.' })
  }

  const project = await findProjectById(prisma, projectId)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }
  if (project.status === 'ARCHIVED') {
    throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot synchronize documents.' })
  }

  const source = await findDocumentSourceForProject(prisma, projectId, sourceId)
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  }

  let snapshot: GoogleDocumentSnapshot
  try {
    snapshot = await getGoogleDriveReader().snapshotGoogleDocument(source.externalFileId)
  }
  catch (err: unknown) {
    await markSyncErrorSafely(projectId, sourceId)
    throw throwForGoogleAdapterError(err)
  }

  const syncedAt = new Date()
  const providerModifiedAt = toProviderModifiedAt(snapshot.metadata.modifiedTime)

  try {
    const result = await recordDocumentSnapshotSync(prisma, {
      projectId,
      documentSourceId: sourceId,
      providerVersion: snapshot.providerVersion,
      contentText: snapshot.contentText,
      checksum: snapshot.checksum,
      providerModifiedAt,
      syncedAt,
      metadataJson: toSafeProviderMetadata(snapshot),
    })

    return {
      source: toPublicDocumentSource(result.source, result.snapshot),
      snapshotCreated: result.created,
    }
  }
  catch (err: unknown) {
    await markSyncErrorSafely(projectId, sourceId)
    console.error('Unexpected error persisting the document snapshot.', err)
    throw createError({ statusCode: 500, statusMessage: 'Unable to save the document snapshot.' })
  }
})
