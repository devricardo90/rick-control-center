/**
 * Derives which state the project list should render. Pure and
 * dependency-free so the exact state logic is directly unit-testable
 * without mounting a component.
 *
 * NDERCC-7: minimal project interface.
 */
export type ProjectListViewState = 'loading' | 'server-error' | 'empty' | 'populated'

export interface ProjectListViewStateInput {
  pending: boolean
  hasError: boolean
  projectCount: number
}

export function resolveProjectListViewState(input: ProjectListViewStateInput): ProjectListViewState {
  if (input.pending) {
    return 'loading'
  }
  if (input.hasError) {
    return 'server-error'
  }
  if (input.projectCount === 0) {
    return 'empty'
  }
  return 'populated'
}
