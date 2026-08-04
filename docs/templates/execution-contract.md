# Execution Contract Template

**Use this file by copying it**, not by editing it in place. Save the copy
under `docs/execution-contracts/<sprint-or-task-slug>.md` and fill in every
section. This template's structure follows
[RIC-011 — Execution Contract Specification](../11-execution-contract-specification.md)
section-for-section; consult RIC-011 for the authority and semantics behind
each field before filling it in.

## Mandatory rules (do not weaken these when filling in the template)

1. **Denied scope always overrides allowed scope.** If a resource appears in
   both `scope.allowed` and `scope.denied`, it is denied.
2. **Unlisted resources are denied by default.** Silence is not permission —
   if a path, command, or capability is not explicitly listed as allowed,
   the agent may not use it.
3. **Commit, push, and Jira transitions each require their own explicit
   authorization.** Authorization for one (e.g. "may commit") never implies
   authorization for another (e.g. "may push", "may transition Jira to
   Done"). State each independently in [§16](#16-git-policy) and
   [§17](#17-jira-policy).
4. **Branch policy must be an explicit choice, never an implied default.**
   Every contract must state exactly one of:
   - `BRANCH_PER_TASK` — isolated feature branch, PR into the base branch, no
     direct commit to the base branch;
   - `DIRECT_MAIN` — direct commit and push to the base branch, explicitly
     authorized, with no branch and no PR for this task.

   A contract that does not explicitly declare one of these is invalid and
   must not be executed.

---

## 1. Identity

| Field | Value |
|---|---|
| `contract_id` | `<e.g. RIC-EC-NDERCC-NN-001>` |
| `contract_version` | `<semver, e.g. 1.0.0>` |
| `project_id` | `<repository or product identifier>` |
| `sprint_id` | `<sprint identifier>` |
| `task_ids` | `<Jira issue key(s), e.g. NDERCC-NN>` |
| `created_at` | `<ISO 8601 timestamp>` |
| `created_by` | `<person or process>` |
| `source_snapshot_id` | `<see §2>` |
| `content_hash` | `<see §22 of RIC-011 — computed once the contract text is final>` |
| `status` | `DRAFT` \| `READY` \| `ACTIVE` \| `COMPLETED` \| `FAILED` \| `CANCELLED` \| `SUPERSEDED` |

## 2. Source snapshot

Freeze exactly what this contract was resolved against — nothing in this
section may silently drift after activation.

- Repository: `<owner/repo>`
- Default branch: `<branch>`
- Baseline HEAD SHA: `<40-char SHA>`
- Working-tree condition at snapshot time: `<clean | dirty — describe>`
- Approved document revisions consulted: `<list, e.g. RIC-002 v1.0, RIC-011 v1.0>`
- Jira issue versions/statuses consulted: `<issue key: status at snapshot time>`
- Environment profile: `<e.g. local dev, CI>`
- Agent/skill versions: `<model, skill versions in use>`
- Protocol version: `<docs/12-development-protocol.md version in effect>`
- Risk Engine version: `<if applicable, or "not yet implemented">`

Changes to any of the above after activation require a new contract version
or an explicit re-resolution flow — they must never be assumed compatible.

## 3. Objectives

- `product_objective`: `<measurable product-level outcome>`
- `phase_objective`: `<measurable phase-level outcome>`
- `sprint_objective`: `<measurable sprint-level outcome>`
- `task_objectives`: `<measurable outcome(s) for this specific task>`

## 4. Non-goals

`<Explicitly out of scope for this contract — list concrete
capabilities/behaviors that a reader might otherwise assume are included.>`

## 5. Scope

### 5.1 Allowed

- Repository paths / file patterns: `<e.g. docs/**>`
- Services: `<e.g. none, or specific service names>`
- Database schemas: `<e.g. none — read-only>`
- Jira issues: `<issue keys this contract may touch>`
- Commands: `<see §11 for full command policy>`
- Integrations: `<e.g. none>`
- Documentation targets: `<paths>`

### 5.2 Denied

`<Explicit denials — remember rule 1 above: anything listed here is denied
even if it also appears in 5.1 by mistake.>`

### 5.3 Dirty-worktree policy

`<How pre-existing uncommitted changes are handled if precondition checks
find the working tree is not clean — e.g. "stop and report; never stash or
discard automatically".>`

## 6. Execution mode

Exactly one of:

- `SUPERVISED` — human approval required before material transitions and Git side effects.
- `CONTROLLED_AUTONOMOUS` — execution, validation, commit, and push allowed within the declared scope once every gate passes.
- `DRY_RUN` — planning, resolution, and risk analysis only; no side effects.
- `RECOVERY` — limited operations to restore a verified safe checkpoint.

Selected mode: `<mode>`

The execution mode cannot be elevated during execution without a new
approved contract version.

## 7. Agent and tool permissions

- Primary agent: `<agent/model identifier>`
- Specialist agents (if any): `<list>`
- MCP servers / tools authorized: `<list>`
- Skills required: `<e.g. rick-code-quality, rick-code-review>`
- Maximum parallelism: `<e.g. 1 — single writer>`
- Work ownership / handoff format: `<how work units are assigned/handed off>`
- Escalation rule: `<who/what to escalate to on a stop condition>`

Concurrent write scopes must not overlap unless a deterministic merge
strategy is defined here.

## 8. Preconditions

List every condition that must hold **before any file is modified**. Each
row must be evaluated and recorded as `PASS`, `FAIL`, `BLOCKED`, or
`WAIVED`, with evidence and evaluator identity.

| # | Precondition | Result | Evidence | Evaluator |
|---|---|---|---|---|
| 1 | Current branch is exactly `<branch>` | | | |
| 2 | Local HEAD and `origin/<branch>` equal `<baseline SHA>` | | | |
| 3 | Working tree and index are clean | | | |
| 4 | No other process is writing to the target branch | | | |
| 5 | Task is in the expected Jira state with this contract present | | | |
| 6 | `<additional contract-specific precondition>` | | | |

## 9. Stop conditions

Stop and report without modifying anything if any of the following is true:

- `<e.g. the base branch has advanced beyond the declared baseline>`
- `<e.g. the working tree or index is not clean>`
- `<e.g. a conflicting canonical document/decision exists>`
- `<e.g. completion would require scope outside §5.1>`
- `<e.g. a security or architecture conflict appears>`

Stop before commit if:

- any mandatory gate fails after permitted corrections;
- the diff includes unauthorized paths;
- the base branch advances during execution;
- required evidence cannot be produced.

Do not silently discard unexpected local work, and do not silently replace
historical evidence.

## 10. Work units

Repeat this block for each deterministic unit of work.

| Field | Value |
|---|---|
| `work_unit_id` | `<identifier>` |
| Objective | `<what this unit accomplishes>` |
| Dependencies | `<other work unit IDs, or "none">` |
| Allowed paths | `<subset of §5.1>` |
| Expected outputs | `<files/artifacts produced>` |
| Commands | `<from §11>` |
| Validation gates | `<from §13>` |
| Rollback checkpoint | `<how to revert just this unit>` |
| Completion condition | `<explicit condition — successful command exit alone is never sufficient>` |

## 11. Command policy

Every command the agent may run must fall into exactly one class:

- `READ_ONLY`
- `LOCAL_WRITE`
- `EXTERNAL_WRITE`
- `DESTRUCTIVE`

| Command / pattern | Class | Working directory | Timeout | Retries | Notes |
|---|---|---|---|---|---|
| `<e.g. pnpm lint>` | `READ_ONLY` | `<repo root>` | `<seconds>` | `<n>` | |
| `<e.g. git push origin <branch>>` | `EXTERNAL_WRITE` | `<repo root>` | `<seconds>` | `0` | requires explicit authorization per §16 |

Shell expansion outside these approved patterns is prohibited.

## 12. Risk assessment

| Finding | Severity | Confidence | Affected resource | Mitigation | Approval level | Residual risk | Blocking? |
|---|---|---|---|---|---|---|---|
| `<finding>` | `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` | `<%>` | `<resource>` | `<mitigation>` | `<role>` | `<remaining risk>` | `<yes/no>` |

Risk-level meaning:

- `LOW`: normal automated execution.
- `MEDIUM`: additional validation or checkpoint required.
- `HIGH`: explicit human approval required.
- `CRITICAL`: blocked unless an authorized emergency/recovery procedure exists.

## 13. Validations

| Gate | Command | Timeout | Expected result | Evidence | Failure policy | Retry policy |
|---|---|---|---|---|---|---|
| Lint | `pnpm lint` | | 0 errors | | stop, fix, rerun full sequence | `<n>` |
| Typecheck | `pnpm typecheck` | | 0 errors | | stop, fix, rerun full sequence | `<n>` |
| Tests | `pnpm test` | | all pass | | stop, fix, rerun full sequence | `<n>` |
| Build | `pnpm build` | | success | | stop, fix, rerun full sequence | `<n>` |
| `<additional gate>` | | | | | | |

Validation evidence must bind to the exact repository state/commit
candidate it was produced against — evidence from an earlier candidate does
not carry forward after a change.

## 14. Evidence requirements

`<What must be captured for this contract: command output, exit codes,
diffs, test reports, logs, database checks, URLs, commit/branch
identifiers, screenshots, etc. Every evidence record needs a timestamp,
producer, content reference, and the work unit or gate it relates to.
Corrections create new evidence versions — they never silently replace
prior records.>`

## 15. Approval gates

| `approval_id` | Trigger state | Required role | Decision options | Minimum evidence | Expiration | Comment required? | Authorized transition |
|---|---|---|---|---|---|---|---|
| `<id>` | `<state that triggers this gate>` | `<role>` | `<approve/reject/etc>` | `<evidence>` | `<duration>` | `<yes/no>` | `<what this approval unlocks>` |

Approval scopes are independent — approving implementation never
automatically authorizes push, deployment, or a Jira transition.

## 16. Git policy

| Field | Value |
|---|---|
| Repository | `<owner/repo>` |
| Remote | `<e.g. origin>` |
| Base branch | `<branch>` |
| Expected baseline SHA | `<SHA>` |
| **Branch policy** (mandatory, explicit — see rule 4 above) | `BRANCH_PER_TASK` \| `DIRECT_MAIN` |
| Execution branch (if `BRANCH_PER_TASK`) | `<branch name, or "N/A — DIRECT_MAIN">` |
| Staging rules | `<e.g. "stage only files listed in §5.1">` |
| Allowed commit files | `<explicit list or pattern>` |
| Commit message format | `<exact required format>` |
| Commit authorized? | `<yes/no — explicit>` |
| Push authorized? | `<yes/no — explicit, independent of commit authorization>` |
| Push target | `<remote/branch>` |
| Force-push policy | `denied` (default) \| `<explicit exception with reason>` |
| PR requirement | `<required for BRANCH_PER_TASK; "none" for DIRECT_MAIN">` |
| Merge strategy | `<e.g. squash, merge commit; "N/A — no merge in this contract">` |
| Signing | `<required/not required>` |

Before commit, staged paths must match `§5.1`. Before push, the pushed
commit must equal the validated candidate — no amend, no rebase, no
additional commit inserted after validation.

## 17. Jira policy

| Field | Value |
|---|---|
| Permitted issues | `<issue keys>` |
| Permitted fields | `<e.g. comments only>` |
| Permitted comment actions | `<add evidence comment: yes/no>` |
| Permitted transitions | `<explicit list, or "none — a separate control process transitions this issue">` |
| Transition to Done authorized? | `<yes/no — explicit>` |

Jira updates occur only after the corresponding evidence exists. A
transition to a "Done"-equivalent status requires the complete Definition
of Done for the issue, not merely successful implementation commands.
External updates use idempotency keys derived from `contract_id`,
operation type, and target.

## 18. Retry, pause, and recovery

- Retry limits — commands: `<n>`; validations: `<n>`; integrations: `<n>`; work units: `<n>`. Original failure evidence is preserved on every retry.
- Pause checkpoint contents: repository state, active work unit, completed validations, unresolved risks, pending approvals.
- Recovery preconditions: checkpoint integrity verified; source compatibility re-verified before resuming.

## 19. Cancellation

- Local changes on cancellation: `<preserved | reverted | packaged as evidence>`
- Completed external operations (e.g. a push that already happened) are **never** silently undone.
- Any compensating action requires its own explicit authorization and evidence.

## 20. Completion policy

This contract reaches `COMPLETED` only when:

- all required work units (§10) are complete per their stated completion condition;
- mandatory validations (§13) pass against the final candidate;
- required evidence (§14) exists and passes integrity checks;
- approval gates (§15) are satisfied;
- authorized Git (§16) and Jira (§17) operations have completed exactly as authorized — no more, no less;
- no blocking risk (§12) remains;
- a final summary and audit record are stored.

## 21. Signatures

| Role | Name | Date | Decision |
|---|---|---|---|
| Approver | `<name>` | `<date>` | `<approved/rejected>` |

## 22. Canonical hash

`content_hash`: `<computed per RIC-011 §22 — deterministic key ordering,
normalized Unicode, normalized line endings, explicit null handling, stable
number representation; excludes mutable runtime status and signatures>`

## 23. Revision history

| Version | Date | Change | Author |
|---|---|---|---|
| `1.0.0` | `<date>` | Initial contract | `<name>` |
