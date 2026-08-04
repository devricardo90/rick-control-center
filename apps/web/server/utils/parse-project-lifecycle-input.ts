/**
 * Narrows an unknown request body into one of the three lifecycle actions
 * a caller may request. An unrecognized or missing `action` is a
 * malformed-request (400) concern, distinct from an action that is
 * well-formed but does not apply from the project's current status
 * (409 — see `transitionProjectLifecycle` / `InvalidProjectTransitionError`).
 *
 * NDERCC-10: complete project settings and lifecycle.
 */
import type { ProjectLifecycleAction } from '@rick/database'

const LIFECYCLE_ACTIONS: readonly ProjectLifecycleAction[] = ['PAUSE', 'REACTIVATE', 'ARCHIVE']

export function parseProjectLifecycleAction(raw: unknown): ProjectLifecycleAction | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const { action } = raw as Record<string, unknown>

  if (typeof action !== 'string') {
    return null
  }

  return (LIFECYCLE_ACTIONS as readonly string[]).includes(action)
    ? (action as ProjectLifecycleAction)
    : null
}
