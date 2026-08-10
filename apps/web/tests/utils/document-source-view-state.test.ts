/**
 * UI state tests for the strategic-documents section.
 *
 * NDERCC-13 / DEC-RIC-003.
 */
import { describe, expect, it } from 'vitest'
import {
  resolveDocumentSectionViewState,
  resolveDocumentSyncViewState,
} from '../../utils/document-source-view-state'

function sectionInput(overrides: Partial<Parameters<typeof resolveDocumentSectionViewState>[0]> = {}) {
  return {
    loading: false,
    registering: false,
    hasLoadError: false,
    documentCount: 0,
    ...overrides,
  }
}

function syncInput(overrides: Partial<Parameters<typeof resolveDocumentSyncViewState>[0]> = {}) {
  return {
    syncing: false,
    syncStatus: 'PENDING',
    hasSnapshot: false,
    ...overrides,
  }
}

describe('resolveDocumentSectionViewState', () => {
  it('reports loading above everything else', () => {
    expect(resolveDocumentSectionViewState(sectionInput({
      loading: true,
      registering: true,
      hasLoadError: true,
      documentCount: 3,
    }))).toBe('loading')
  })

  it('reports registering while a registration is in flight', () => {
    expect(resolveDocumentSectionViewState(sectionInput({ registering: true, hasLoadError: true })))
      .toBe('registering')
  })

  it('reports a load error when the list could not be fetched', () => {
    expect(resolveDocumentSectionViewState(sectionInput({ hasLoadError: true }))).toBe('load-error')
  })

  it('reports empty for a project with no registered documents', () => {
    expect(resolveDocumentSectionViewState(sectionInput())).toBe('empty')
  })

  it('reports ready once at least one document exists', () => {
    expect(resolveDocumentSectionViewState(sectionInput({ documentCount: 1 }))).toBe('ready')
  })
})

describe('resolveDocumentSyncViewState', () => {
  it('reports syncing while this document is being synchronized', () => {
    expect(resolveDocumentSyncViewState(syncInput({ syncing: true, syncStatus: 'SYNCED', hasSnapshot: true })))
      .toBe('syncing')
  })

  it('reports never-synced before the first snapshot exists', () => {
    expect(resolveDocumentSyncViewState(syncInput())).toBe('never-synced')
  })

  it('reports synced once a snapshot exists', () => {
    expect(resolveDocumentSyncViewState(syncInput({ syncStatus: 'SYNCED', hasSnapshot: true }))).toBe('synced')
  })

  it('reports stale distinctly from error', () => {
    expect(resolveDocumentSyncViewState(syncInput({ syncStatus: 'STALE', hasSnapshot: true }))).toBe('stale')
  })

  it('reports error even when a previous snapshot is still present', () => {
    expect(resolveDocumentSyncViewState(syncInput({ syncStatus: 'ERROR', hasSnapshot: true }))).toBe('error')
  })

  it('reports error for a first-ever sync that failed, with no snapshot to show', () => {
    expect(resolveDocumentSyncViewState(syncInput({ syncStatus: 'ERROR', hasSnapshot: false }))).toBe('error')
  })

  it('never reports synced while the status is ERROR — a failed attempt must not look successful', () => {
    for (const hasSnapshot of [true, false]) {
      expect(resolveDocumentSyncViewState(syncInput({ syncStatus: 'ERROR', hasSnapshot }))).not.toBe('synced')
    }
  })
})
