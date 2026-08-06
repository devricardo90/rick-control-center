/**
 * Derives which state the GitHub integration section should render. Pure
 * and dependency-free so the exact state logic is directly unit-testable
 * without mounting a component.
 *
 * NDERCC-11: connect and verify GitHub repository.
 */
export type GitHubIntegrationViewState =
  | 'loading'
  | 'connecting'
  | 're-verifying'
  | 'error'
  | 'connected'
  | 'disconnected'

export interface GitHubIntegrationViewStateInput {
  loading: boolean
  connecting: boolean
  reverifying: boolean
  /** Status of the current connection ('CONNECTED' | 'ERROR' | ...), or null if none exists yet. */
  connectionStatus: string | null
}

export function resolveGitHubIntegrationViewState(
  input: GitHubIntegrationViewStateInput,
): GitHubIntegrationViewState {
  if (input.loading) {
    return 'loading'
  }
  if (input.reverifying) {
    return 're-verifying'
  }
  if (input.connecting) {
    return 'connecting'
  }
  if (input.connectionStatus === 'ERROR') {
    return 'error'
  }
  if (input.connectionStatus !== null) {
    return 'connected'
  }
  return 'disconnected'
}
