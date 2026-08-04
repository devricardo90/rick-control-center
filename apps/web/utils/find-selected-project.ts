/**
 * Resolves the currently selected project from a list plus a selected id.
 * Pure and dependency-free — selection is local interface state, not a
 * persistence model (per NDERCC-7 scope).
 *
 * NDERCC-7: minimal project interface.
 */
export interface SelectableProject {
  id: string
}

export function findSelectedProject<T extends SelectableProject>(
  projects: readonly T[],
  selectedProjectId: string | null,
): T | null {
  if (selectedProjectId === null) {
    return null
  }

  return projects.find(project => project.id === selectedProjectId) ?? null
}
