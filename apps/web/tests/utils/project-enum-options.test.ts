/**
 * This test file runs under Vitest/Node, never the browser bundle, so it
 * is safe to import @rick/database here specifically to prove the
 * client-safe literal option lists never drift from the real enums.
 */
import { AutonomyPolicy, BranchPolicy } from '@rick/database'
import { describe, expect, it } from 'vitest'
import { AUTONOMY_POLICY_OPTIONS, BRANCH_POLICY_OPTIONS } from '../../utils/project-enum-options'

describe('project-enum-options', () => {
  it('AUTONOMY_POLICY_OPTIONS matches the real AutonomyPolicy enum exactly', () => {
    expect([...AUTONOMY_POLICY_OPTIONS].sort()).toEqual(Object.values(AutonomyPolicy).sort())
  })

  it('BRANCH_POLICY_OPTIONS matches the real BranchPolicy enum exactly', () => {
    expect([...BRANCH_POLICY_OPTIONS].sort()).toEqual(Object.values(BranchPolicy).sort())
  })
})
