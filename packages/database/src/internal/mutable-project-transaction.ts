/**
 * Shared transactional envelope for every strategic-document mutation.
 *
 * Extracted verbatim from `src/document-source.ts` (NDERCC-12) with no
 * behavioural change, so that the NDERCC-13 snapshot writer receives
 * exactly the same archived-project protection and project-scoped
 * ownership check as the NDERCC-12 source writers — rather than a second,
 * subtly different implementation of the same invariant. Internal to
 * @rick/database — deliberately not re-exported from src/index.ts.
 *
 * NDERCC-12 / DEC-RIC-002; reused by NDERCC-13 / DEC-RIC-003.
 */
import { Prisma } from '@prisma/client'
import type { DocumentSource, PrismaClient } from '@prisma/client'
import {
  ArchivedProjectReadOnlyError,
  DocumentSourceNotFoundError,
  ProjectNotFoundError,
} from '../errors.js'

export function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

interface ProjectLockRow {
  id: string
  status: string
}

function isProjectLockRow(value: unknown): value is ProjectLockRow {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return typeof candidate['id'] === 'string' && typeof candidate['status'] === 'string'
}

function isProjectLockRowArray(value: unknown): value is ProjectLockRow[] {
  return Array.isArray(value) && value.every(isProjectLockRow)
}

/**
 * Locks the project row (`SELECT ... FOR UPDATE`, Prisma-parameterized —
 * never string-concatenated) and validates it exists and is not ARCHIVED,
 * inside the caller's transaction. Must run before any DocumentSource or
 * DocumentSnapshot read/write in that same transaction: Postgres's
 * row-level lock means this transaction either fully completes before a
 * concurrent `transitionProjectLifecycle` archival's own `UPDATE` on the
 * same row, or fully waits for it — the two can never interleave, so a
 * mutation can never observe a stale pre-archival status and commit after
 * the project has already been serialized as ARCHIVED.
 */
async function lockMutableProject(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
  const raw: unknown = await tx.$queryRaw`SELECT id, status FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`

  if (!isProjectLockRowArray(raw)) {
    throw new Error('Unexpected result shape from project lock query')
  }

  const row = raw[0]
  if (!row) {
    throw new ProjectNotFoundError(projectId)
  }
  if (row.status === 'ARCHIVED') {
    throw new ArchivedProjectReadOnlyError(projectId)
  }
}

/**
 * Locks and validates the owning project, then runs `run` inside the same
 * transaction. Every strategic-document mutation goes through this single
 * implementation so all of them receive identical protection.
 */
export async function withMutableProjectTransaction<T>(
  client: PrismaClient,
  projectId: string,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await lockMutableProject(tx, projectId)
    return run(tx)
  })
}

/** Loads a source scoped to its owning project, inside a transaction. A source that exists but belongs to a different project is treated identically to "doesn't exist". */
export async function requireOwnedDocumentSource(
  tx: Prisma.TransactionClient,
  projectId: string,
  sourceId: string,
): Promise<DocumentSource> {
  const source = await tx.documentSource.findUnique({ where: { id: sourceId } })

  if (!source || source.projectId !== projectId) {
    throw new DocumentSourceNotFoundError(sourceId)
  }

  return source
}

/** Read-only existence check — does NOT reject an archived project; reads remain allowed for archived projects. */
export async function requireExistingProject(client: PrismaClient, projectId: string): Promise<void> {
  const project = await client.project.findUnique({ where: { id: projectId }, select: { id: true } })

  if (!project) {
    throw new ProjectNotFoundError(projectId)
  }
}
