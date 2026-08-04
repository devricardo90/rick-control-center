/**
 * Public HTTP representation of a Project — a dedicated transport DTO kept
 * separate from the @rick/database domain type, so the response shape is
 * an explicit, closed list of fields rather than whatever the domain
 * model happens to carry (e.g. `archivedAt`, unused by this minimal
 * interface, is deliberately not included).
 *
 * NDERCC-7: minimal project interface.
 */
import type { Project } from '@rick/database'

export interface PublicProject {
  id: string
  key: string
  name: string
  description: string | null
  status: Project['status']
  autonomyPolicy: Project['autonomyPolicy']
  defaultBranchPolicy: Project['defaultBranchPolicy']
  workspacePath: string | null
  createdAt: string
  updatedAt: string
}

export function toPublicProject(project: Project): PublicProject {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    status: project.status,
    autonomyPolicy: project.autonomyPolicy,
    defaultBranchPolicy: project.defaultBranchPolicy,
    workspacePath: project.workspacePath,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}
