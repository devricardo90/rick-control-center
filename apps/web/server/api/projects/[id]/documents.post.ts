/**
 * POST /api/projects/:id/documents
 *
 * Registers an approved Google Doc as a strategic document source for a
 * project. Body: `{ document, documentType }` only — `document` is a
 * Google Docs URL or a bare Drive file ID.
 *
 * Registration is metadata-only and read-only against Google: the adapter
 * performs a single `files.get` to resolve the document's real title,
 * MIME type and canonical link, and to prove the service account can
 * actually see it. No export, no snapshot, and no Drive write happens
 * here — capturing content is the separate, explicit `sync` call, so
 * registering a document is always cheap and always safe.
 *
 * That `files.get` also enforces the document type: the adapter's central
 * MIME guard rejects anything that is not `application/vnd.google-apps.document`
 * (mapped to HTTP 415), so a Sheet, Slide, PDF, folder or uploaded binary
 * can never reach `createDocumentSource` and be persisted as a strategic
 * source (NDERCC-13 corrective review, finding 2).
 *
 * `GOOGLE_SERVICE_ACCOUNT_JSON` is never read here: the credential lives
 * behind `getGoogleDriveReader()` and never enters this handler's scope,
 * this request, or any response.
 *
 * NDERCC-13: register and snapshot approved Google Docs.
 */
import {
  ArchivedProjectReadOnlyError,
  createDocumentSource,
  DuplicateDocumentSourceError,
  findProjectById,
  InvalidDocumentSourceInputError,
  prisma,
  ProjectNotFoundError,
} from '@rick/database'
import { resolveGoogleDocumentFileId, type GoogleDocumentMetadata } from '@rick/integrations'
import { getGoogleDriveReader } from '../../../utils/google-drive-reader'
import { throwForGoogleAdapterError } from '../../../utils/google-error-mapping'
import { parseRegisterDocumentSourceInput } from '../../../utils/parse-document-source-input'
import { toPublicDocumentSource } from '../../../utils/public-document-source'

/** Drive always supplies `webViewLink` for a readable Doc; fall back to the canonical document URL if it ever doesn't. */
function resolveDocumentUrl(metadata: GoogleDocumentMetadata): string {
  return metadata.webViewLink ?? `https://docs.google.com/document/d/${metadata.id}/edit`
}

/** Translates the typed persistence errors this route can provoke. Never surfaces a raw Prisma error. */
function throwForRegistrationError(err: unknown): never {
  if (err instanceof DuplicateDocumentSourceError) {
    throw createError({ statusCode: 409, statusMessage: 'This document is already registered for this project.' })
  }
  if (err instanceof ProjectNotFoundError) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }
  if (err instanceof ArchivedProjectReadOnlyError) {
    throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot register documents.' })
  }
  if (err instanceof InvalidDocumentSourceInputError) {
    throw createError({ statusCode: 422, statusMessage: 'This document cannot be registered as a strategic source.' })
  }
  console.error('Unexpected error registering the document source.', err)
  throw createError({ statusCode: 500, statusMessage: 'Unable to register the document.' })
}

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'A project id is required.' })
  }

  const rawBody: unknown = await readBody(event)
  const input = parseRegisterDocumentSourceInput(rawBody)
  if (!input) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid document registration request.' })
  }

  const project = await findProjectById(prisma, projectId)
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found.' })
  }
  if (project.status === 'ARCHIVED') {
    throw createError({ statusCode: 409, statusMessage: 'Archived projects cannot register documents.' })
  }

  let metadata: GoogleDocumentMetadata
  try {
    const fileId = resolveGoogleDocumentFileId(input.document)
    metadata = await getGoogleDriveReader().getGoogleDocumentMetadata(fileId)
  }
  catch (err: unknown) {
    throw throwForGoogleAdapterError(err)
  }

  try {
    const source = await createDocumentSource(prisma, {
      projectId,
      provider: 'GOOGLE_DRIVE',
      externalFileId: metadata.id,
      documentType: input.documentType,
      title: metadata.name,
      url: resolveDocumentUrl(metadata),
    })
    setResponseStatus(event, 201)
    return toPublicDocumentSource(source, null)
  }
  catch (err: unknown) {
    throw throwForRegistrationError(err)
  }
})
