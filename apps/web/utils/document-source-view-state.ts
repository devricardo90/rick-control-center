/**
 * Derives which state the strategic-documents section should render, and
 * how a single document's synchronization state should read. Pure and
 * dependency-free so the exact state logic is directly unit-testable
 * without mounting a component.
 *
 * NDERCC-13: register and snapshot approved Google Docs.
 */
export type DocumentSectionViewState =
  | 'loading'
  | 'registering'
  | 'load-error'
  | 'empty'
  | 'ready'

export interface DocumentSectionViewStateInput {
  loading: boolean
  registering: boolean
  hasLoadError: boolean
  documentCount: number
}

export function resolveDocumentSectionViewState(
  input: DocumentSectionViewStateInput,
): DocumentSectionViewState {
  if (input.loading) {
    return 'loading'
  }
  if (input.registering) {
    return 'registering'
  }
  if (input.hasLoadError) {
    return 'load-error'
  }
  return input.documentCount === 0 ? 'empty' : 'ready'
}

export type DocumentSyncViewState =
  | 'syncing'
  | 'never-synced'
  | 'error'
  | 'stale'
  | 'synced'

export interface DocumentSyncViewStateInput {
  /** True while this specific document is being synchronized. */
  syncing: boolean
  /** `DocumentSyncStatus` from the API: PENDING | SYNCED | STALE | ERROR. */
  syncStatus: string
  /** Whether an immutable snapshot has ever been captured for this document. */
  hasSnapshot: boolean
}

/**
 * ERROR is reported before `hasSnapshot` is considered, so a failed
 * re-sync reads as "error" while the preserved previous snapshot is still
 * displayed — the interface must never present a failed attempt as if the
 * document were freshly synchronized.
 */
export function resolveDocumentSyncViewState(input: DocumentSyncViewStateInput): DocumentSyncViewState {
  if (input.syncing) {
    return 'syncing'
  }
  if (input.syncStatus === 'ERROR') {
    return 'error'
  }
  if (input.syncStatus === 'STALE') {
    return 'stale'
  }
  return input.hasSnapshot ? 'synced' : 'never-synced'
}
