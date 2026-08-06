import { describe, expect, it } from 'vitest'
import { resolveGitHubIntegrationViewState } from '../../utils/github-integration-view-state'

const BASE = { loading: false, connecting: false, reverifying: false, connectionStatus: null }

describe('resolveGitHubIntegrationViewState', () => {
  it('returns loading first, regardless of other flags', () => {
    expect(resolveGitHubIntegrationViewState({ ...BASE, loading: true, connecting: true })).toBe('loading')
  })

  it('returns re-verifying before connecting when both would otherwise apply', () => {
    expect(resolveGitHubIntegrationViewState({ ...BASE, reverifying: true, connecting: true })).toBe('re-verifying')
  })

  it('returns connecting while a connect request is in flight', () => {
    expect(resolveGitHubIntegrationViewState({ ...BASE, connecting: true })).toBe('connecting')
  })

  it('returns error when the current connection status is ERROR', () => {
    expect(resolveGitHubIntegrationViewState({ ...BASE, connectionStatus: 'ERROR' })).toBe('error')
  })

  it('returns connected when a non-error connection exists', () => {
    expect(resolveGitHubIntegrationViewState({ ...BASE, connectionStatus: 'CONNECTED' })).toBe('connected')
  })

  it('returns disconnected when no connection exists and nothing is in flight', () => {
    expect(resolveGitHubIntegrationViewState(BASE)).toBe('disconnected')
  })
})
