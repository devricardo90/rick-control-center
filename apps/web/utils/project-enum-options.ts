/**
 * Client-safe copies of the `AutonomyPolicy`/`BranchPolicy` enum values,
 * for populating settings-form `<select>` options in browser-bundled
 * code. Deliberately NOT imported from `@rick/database` — that package
 * pulls in the Prisma client and the `pg` driver, neither of which may
 * enter the client bundle. `apps/web/tests/utils/project-enum-options.test.ts`
 * guards against these literals silently drifting from the real enums.
 *
 * NDERCC-10: complete project settings and lifecycle.
 * NDERCC-13: strategic document types.
 */
export const AUTONOMY_POLICY_OPTIONS = ['SUPERVISED', 'CONTROLLED_AUTONOMOUS'] as const

export const BRANCH_POLICY_OPTIONS = ['BRANCH_PER_TASK', 'DIRECT_COMMIT'] as const

/** Same client-safe-copy rule as above; guarded by the same drift test. */
export const DOCUMENT_TYPE_OPTIONS = [
  'VISION',
  'PRD',
  'ARCHITECTURE',
  'ROADMAP',
  'DESIGN_SYSTEM',
  'DATA_MODEL',
  'STATE_MACHINE',
  'RISK_ENGINE',
  'MVP',
  'BACKLOG',
  'EXECUTION_CONTRACT_SPEC',
  'DEVELOPMENT_PROTOCOL',
] as const
