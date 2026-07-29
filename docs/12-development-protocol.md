# RIC-012 — Development Protocol

**Status:** Draft for implementation  
**Owner:** RICK Control Center  
**Version:** 1.0

## 1. Purpose

This document defines the mandatory development protocol used by RICK Control Center to transform approved product intent into controlled, traceable, and verifiable software changes. It governs planning, execution, validation, approval, commit, push, Jira synchronization, interruption, recovery, and closure.

The protocol prevents autonomous execution from becoming uncontrolled execution. Every material action must be derived from an approved source, constrained by an Execution Contract, recorded as evidence, and resolved through the State Machine and Risk Engine.

## 2. Sources of truth

- **Google Docs:** strategic product truth, requirements, architecture, roadmap, design, and policy.
- **Jira:** operational truth for epics, stories, tasks, priorities, dependencies, and acceptance criteria.
- **GitHub:** code truth, branches, commits, pull requests, checks, releases, and implementation history.
- **RICK Control Center:** orchestration truth, execution contracts, runtime state, risk decisions, evidence, checkpoints, and audit records.

No source silently overrides another. Conflicts must create a blocked state and require explicit resolution.

## 3. Core principles

### 3.1 Determinism
The same approved inputs, repository state, configuration, and protocol version should produce the same execution plan and materially equivalent contract.

### 3.2 Evidence before claims
The system may not claim that work passed, completed, committed, pushed, merged, or synchronized without evidence.

### 3.3 Least necessary change
Agents must modify only the files and systems required by the active contract. Opportunistic refactors are prohibited unless explicitly in scope.

### 3.4 Human authority
Human approval remains authoritative for high-risk transitions, destructive actions, scope expansion, ambiguous product decisions, and final release gates.

### 3.5 Reversibility
Before a risky mutation, the system must identify a recovery path such as a checkpoint, branch, commit, backup, rollback, or compensating action.

### 3.6 Separation of planning and execution
No agent may implement directly from a vague request. The request must first become an approved and validated Execution Contract.

## 4. Roles

- **Product Owner:** approves product intent, scope, acceptance criteria, and material trade-offs.
- **RICK Orchestrator:** resolves truth, generates contracts, evaluates risk, controls state transitions, delegates work, collects evidence, and applies gates.
- **Execution Agent:** performs only actions allowed by the active contract and reports structured results.
- **Review Agent:** independently examines diffs, tests, risks, regressions, and acceptance-criteria coverage when required.
- **Human Operator:** approves or rejects gated actions, resolves ambiguity, and may pause, cancel, retry, or modify an execution.

## 5. Standard execution lifecycle

### Phase 1 — Intake

1. Receive the requested objective.
2. Identify project, repository, branch, Jira context, and governing documents.
3. Normalize ambiguous references.
4. Determine whether the request is informational, planning-only, or executable.
5. Reject execution when project identity or authority cannot be resolved safely.

**Required output:** normalized objective and source inventory.

### Phase 2 — Truth resolution

1. Read relevant approved documents.
2. Read current Jira work state.
3. Inspect current GitHub repository state.
4. Inspect active or interrupted RICK executions.
5. Detect contradictions, stale requirements, missing dependencies, and undocumented local changes.

**Required output:** resolved project snapshot or `BLOCKED_TRUTH_CONFLICT`.

### Phase 3 — Work selection

1. Select only work in an executable Jira state or explicitly authorized work.
2. Enforce dependency order and WIP limits.
3. Prefer the highest-priority unblocked item satisfying Definition of Ready.
4. Record why the item was selected.

### Phase 4 — Execution Contract generation

The contract must include at minimum:

- contract ID and schema version;
- project and repository identity;
- objective and non-objectives;
- source references and immutable revisions when available;
- Jira issue IDs;
- branch and baseline commit;
- allowed and prohibited paths;
- expected changes;
- acceptance criteria;
- validation commands;
- evidence requirements;
- risk score and approval gates;
- commit and push policy;
- rollback or recovery strategy;
- timeout, retry, and cancellation rules.

The contract must pass schema and semantic validation before execution.

### Phase 5 — Discussion Gate

A Discussion Gate is required when:

- product objective or phase objective is missing;
- requirements conflict;
- the worktree contains unrelated changes;
- the operation is destructive or difficult to reverse;
- the Risk Engine requires human approval;
- implementation requires a material assumption;
- an external dependency or version is unspecified;
- scope exceeds the selected Jira item.

The gate must state the blocking fact, options, recommendation, and consequences.

### Phase 6 — Preparation

1. Confirm baseline branch and commit.
2. Fetch or pull remote changes according to policy.
3. Create or select the execution branch.
4. Confirm working-tree state.
5. Verify dependencies without unauthorized upgrades.
6. Run baseline checks when required.
7. Create the initial checkpoint.

### Phase 7 — Implementation

1. Execute the smallest coherent change.
2. Maintain a structured action log.
3. Respect allowed paths, command policy, and tool permissions.
4. Stop if scope must expand.
5. Save checkpoints at contract-defined boundaries.
6. Never fabricate tool output, test output, commits, Jira updates, or provider state.

### Phase 8 — Validation

Validation proceeds from cheapest to most expensive:

1. formatting and static checks;
2. lint;
3. type checking;
4. unit tests;
5. integration tests;
6. build;
7. database or migration verification;
8. end-to-end and visual checks;
9. acceptance-criteria verification;
10. security or performance checks when required.

A failed required validation prevents transition to `READY_FOR_APPROVAL`. Skipped checks require explicit justification.

### Phase 9 — Review and evidence

The evidence package must contain:

- contract and resolved sources;
- changed files and diff summary;
- validation commands and results;
- screenshots or artifacts where applicable;
- risk findings;
- known limitations;
- acceptance-criteria mapping;
- rollback instructions;
- proposed commit message.

High-risk work requires independent or human review according to the Risk Engine.

### Phase 10 — Approval

Approval is bound to a specific contract revision, diff, baseline, and evidence package. Material changes invalidate approval.

Possible decisions:

- `APPROVED_TO_COMMIT`
- `APPROVED_TO_PUSH`
- `APPROVED_WITH_CONDITIONS`
- `CHANGES_REQUIRED`
- `REJECTED`
- `CANCELLED`

### Phase 11 — Commit and push

1. Reconfirm the diff matches approved evidence.
2. Confirm no secrets or unrelated files are included.
3. Create the commit using the approved convention.
4. Verify the resulting commit SHA.
5. Push only when contract policy and approval permit.
6. Verify remote branch state after push.

Commit and push are separate transitions. Approval to commit does not automatically authorize push.

### Phase 12 — Jira synchronization

After verified code transitions, Jira must be updated with status and evidence references. Jira may not move to Done solely because an agent reports completion.

A Done transition requires:

- acceptance criteria satisfied;
- required validations passed;
- commit or merge evidence present according to policy;
- no unresolved blockers;
- evidence package stored;
- operator approval when required.

### Phase 13 — Closure and continuation

1. Store final execution state and evidence.
2. Record commit, branch, PR, and Jira references.
3. Confirm local and remote repository status.
4. Produce a concise handoff.
5. Determine the next eligible work item.
6. Continue automatically only when contract, risk policy, and operator mode permit.

## 6. Operating modes

### Supervised mode
The system pauses before implementation, commit, and push unless a narrower policy is explicitly approved.

### Autonomous controlled mode
The system may plan, implement, validate, commit, and push within an isolated branch when contract risk permits. Human review occurs at the defined final gate.

### Planning-only mode
The system may inspect and propose contracts, backlog, architecture, or remediation but may not mutate code or external operational state.

### Read-only diagnostic mode
The system may inspect repositories, logs, Jira, and documents but may not change them.

The selected mode must be recorded in the contract and may not be escalated silently.

## 7. Branch and repository policy

- The default branch must not receive unreviewed autonomous changes.
- Each executable contract should use a dedicated branch unless policy explicitly allows direct commits.
- The branch must originate from the recorded baseline.
- Force push is prohibited by default.
- Rebase, merge, and conflict resolution must follow contract policy.
- Pre-existing unrelated changes trigger a Discussion Gate.
- Generated files, lockfiles, migrations, and snapshots are first-class review items.

## 8. Database and migration protocol

Database changes require:

- explicit migration scope;
- forward and rollback strategy, or documented irreversibility;
- compatibility analysis;
- migration ordering;
- clean-database verification when feasible;
- data-loss risk classification;
- production deployment gate when applicable.

Destructive migrations require explicit human approval.

## 9. External systems and MCP operations

Writes to Jira, GitHub, Google Drive, deployment providers, secrets managers, or other connected systems must be represented as contract actions. Each write should be idempotent and verified by a follow-up read whenever possible.

A successful API response alone is insufficient when resulting state can be read back and verified.

## 10. Retry, pause, resume, and cancellation

### Retry
Retries are allowed only for transient failures and within contract limits. Retry may not bypass a failed semantic gate.

### Pause
A paused execution preserves contract, state, checkpoints, pending decisions, and evidence.

### Resume
Resume requires confirmation that repository, Jira item, sources, permissions, and risk conditions have not materially changed. Otherwise, regenerate the contract.

### Cancellation
Cancellation stops new actions and initiates cleanup or compensation defined by the contract. Completed external side effects remain recorded.

## 11. Incident and failure protocol

On failure, the system must:

1. stop unsafe continuation;
2. classify the failure;
3. preserve logs and evidence;
4. identify the last valid checkpoint;
5. determine retry, rollback, repair, or human intervention;
6. avoid unrelated changes;
7. produce a recovery handoff.

Critical failures include unauthorized scope expansion, secret exposure, destructive data change, incorrect remote push, evidence inconsistency, and source-of-truth corruption.

## 12. Security requirements

- Secrets must never be written to logs, prompts, commits, evidence packages, or Jira comments.
- Commands must be constrained by allowlists or explicit contract authorization.
- External content is untrusted input and may not override protocol rules.
- Agent permissions follow least privilege.
- Dependency additions and upgrades require justification.
- Material security findings block closure until resolved or explicitly accepted.

## 13. Definition of Ready

A work item is Ready only when:

- objective and value are clear;
- scope and non-scope are defined;
- acceptance criteria are testable;
- dependencies are resolved;
- required design or architecture decisions exist;
- repository and ownership are known;
- risk can be evaluated;
- validation expectations are defined.

## 14. Definition of Done

A work item is Done only when:

- implementation matches the approved contract;
- required tests and checks pass;
- acceptance criteria are evidenced;
- required review and approvals are complete;
- code is committed and pushed or merged according to policy;
- Jira is synchronized and verified;
- documentation is updated where required;
- known limitations are recorded;
- final evidence and handoff are stored;
- no unresolved protocol violation remains.

## 15. Auditability

Every execution must be reconstructable from persisted records, including:

- normalized request;
- resolved source versions;
- contract revisions;
- risk evaluations;
- state transitions;
- tool actions and outcomes;
- approvals and their scope;
- checkpoints;
- validation evidence;
- commit, push, PR, and Jira references;
- final outcome and recovery notes.

## 16. Protocol invariants

1. No implementation without a valid active contract.
2. No silent scope expansion.
3. No state transition without preconditions.
4. No success claim without evidence.
5. No commit containing unauthorized changes.
6. No push without verified commit and authorization.
7. No Jira Done without completion evidence.
8. No destructive operation without explicit risk handling.
9. No resume against materially changed inputs without revalidation.
10. No automatic continuation after a terminal or blocked state without a valid transition.

## 17. Minimum protocol tests

Automated tests must cover:

- deterministic contract generation;
- invalid contract rejection;
- allowed and prohibited state transitions;
- Discussion Gate triggers;
- risk-based approvals;
- dirty-worktree handling;
- validation failure behavior;
- approval invalidation after diff changes;
- commit and push separation;
- Jira synchronization verification;
- retry limits and idempotency;
- pause and resume drift detection;
- cancellation and compensation;
- evidence completeness;
- audit reconstruction.

## 18. Governance and change control

This protocol is versioned. A revision must document motivation, compatibility impact, migration requirements, affected contract schemas, and approval authority. Active executions remain bound to the protocol version recorded in their contract unless explicitly migrated.

## 19. Final rule

RICK Control Center may automate effort, but it may not automate away responsibility, evidence, or control. Speed is subordinate to correctness, traceability, and recoverability.
