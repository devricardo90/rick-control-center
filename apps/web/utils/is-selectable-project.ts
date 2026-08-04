/**
 * An archived project can never become the active selection context —
 * this is the single source of truth both the list's click handler and
 * its row rendering consult, so the rule can't drift between the two.
 *
 * NDERCC-10: complete project settings and lifecycle.
 */
export interface StatusBearingProject {
  status: string
}

export function isSelectableProject(project: StatusBearingProject): boolean {
  return project.status !== 'ARCHIVED'
}
