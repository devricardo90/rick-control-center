# RIC-010 — Backlog

Status: Draft baseline

Owner: RICK Control Center

Purpose: Convert the approved product and architecture documents into an ordered, traceable implementation backlog.

## 1. Backlog principles

The backlog is not an informal task list. Every item must be traceable to an approved requirement, architectural rule, risk control, state transition, or MVP outcome. Jira is the operational source of truth once an item enters execution. Google Docs remains the strategic source of truth. GitHub contains the implementation and evidence.

Each backlog item must contain: objective, scope, exclusions, acceptance criteria, dependencies, risk level, required evidence, validation commands, affected repositories, expected state transitions, approval policy and completion definition.

## 2. Priority model

- P0 — Required to create a safe executable foundation.
- P1 — Required for the end-to-end MVP flow.
- P2 — Required for operational completeness and usability.
- P3 — Deferred improvements outside the first validated release.

## 3. Epic structure

### EPIC 0 — Foundation and repository baseline
- P0-001 Initialize Nuxt 3 and TypeScript workspace.
- P0-002 Configure lint, typecheck, unit tests and build pipeline.
- P0-003 Configure PostgreSQL, migrations and local development environment.
- P0-004 Establish environment configuration and secret-handling policy.
- P0-005 Add CI validation and protected completion gates.
- P0-006 Implement audit-safe structured logging.
- P1-007 Enforce repository-wide zero-any and forbidden-pattern quality gates in CI.
- P1-008 Enforce GitHub governed-branch protection/rulesets so required CI and review gates cannot be bypassed on main.
- P2-009 Configure stable local development hostname with Portless, preserving dedicated database ports and validating Nuxt/HMR/auth callbacks before adoption.

### EPIC 1 — Identity, workspace and projects
- P0-010 Implement user and workspace foundations.
- P0-011 Create project registration and project settings.
- P0-012 Connect a GitHub repository to a project.
- P1-013 Register Google Drive strategic-document locations.
- P1-014 Register Jira project and workflow configuration.
- P1-015 Display project health and integration status.

### EPIC 2 — Strategic truth resolution
- P0-020 Model documents, versions and approval status.
- P0-021 Import and snapshot approved Google Docs.
- P0-022 Extract requirements, decisions and constraints.
- P1-023 Detect missing or conflicting strategic inputs.
- P1-024 Build project truth summary and traceability graph.
- P1-025 Prevent execution from unapproved or stale truth.

### EPIC 3 — Backlog and sprint resolution
- P0-030 Model epics, backlog items, dependencies and priorities.
- P0-031 Determine the next executable item deterministically.
- P0-032 Detect blocked, ambiguous and conflicting items.
- P1-033 Synchronize approved work items with Jira.
- P1-034 Preserve external IDs and idempotent Jira operations.
- P1-035 Display backlog readiness and dependency status.
- P1-038 Implement governed SDD specification lifecycle: create, validate, version, approve, supersede and trace implementation specs before Execution Contract generation.

### EPIC 4 — Execution Contract
- P0-040 Define the canonical Execution Contract schema.
- P0-041 Generate immutable contracts from approved inputs.
- P0-042 Validate contract completeness before execution.
- P0-043 Hash and version every contract.
- P0-046 Implement deterministic state-transition decision engine.
- P0-047 Implement deterministic gate engine for scope, validation, evidence, risk and approval outcomes.
- P0-048 Implement bounded loop controller with retry limits, backoff and explicit stop conditions.
- P0-049 Integrate the Deterministic Orchestrator Kernel and persist replayable decision records.

Kernel component mapping: ContractCompiler = P0-040 through P0-043; TransitionEngine = P0-046; GateEngine = P0-047; LoopController = P0-048; Checkpoint/Recovery Engine = P0-064, P1-065 and P1-111; SideEffect Executor = P0-083 through P1-086 plus P1-090 through P1-093. P0-049 is the integration boundary that proves these components share one deterministic authority model rather than separate agent-controlled flows.

- P1-044 Render human-readable contract review.
- P1-045 Store contract provenance and linked requirements.

### EPIC 5 — Risk Engine and approvals
- P0-050 Implement deterministic risk scoring.
- P0-051 Classify file, database, infrastructure and Git operations.
- P0-052 Determine supervised versus autonomous execution policy.
- P0-053 Block prohibited or incomplete operations.
- P1-054 Create approval requests and record decisions.
- P1-055 Require fresh approval when material scope changes.

### EPIC 6 — Agent runtime and orchestration
- P0-060 Integrate the Claude Agent SDK runtime.
- P0-061 Create execution sessions from valid contracts.
- P0-062 Enforce allowed tools, paths and command boundaries.
- P0-063 Stream execution events through SSE.
- P0-064 Persist checkpoints, events and terminal outcomes.
- P1-065 Support controlled retry and resume.
- P1-066 Prevent concurrent conflicting executions.
- P1-067 Implement RICK Verification Gauntlet with Builder/Critic separation, fresh-context independent review, controlled fan-out/fan-in and Integration Review.

### EPIC 7 — Validation and evidence
- P0-070 Execute contract-defined validation commands.
- P0-071 Capture test, lint, typecheck and build results.
- P0-072 Capture diffs, logs and generated artifacts.
- P0-073 Evaluate completion against acceptance criteria.
- P1-074 Build evidence bundles linked to executions.
- P1-075 Display validation failures and remediation context.
- P1-076 Implement canonical `rick-qa-review` adversarial QA gate with structured scenarios, findings, severity and evidence.
- P1-077 Implement machine-evaluable Definition of Done gate that consumes acceptance, validation, review, QA, CI, delivery, documentation and Jira evidence without allowing the implementation agent to self-declare Done.

### EPIC 8 — Git and delivery lifecycle
- P0-080 Create isolated execution branches.
- P0-081 Record repository baseline and worktree state.
- P0-082 Generate deterministic commit messages.
- P0-083 Prevent commit or push before validation gates pass.
- P1-084 Commit approved changes.
- P1-085 Push to the configured remote.
- P1-086 Record commit SHA, branch and remote evidence.
- P2-087 Support pull-request creation where policy requires it.

### EPIC 9 — Jira completion loop
- P1-090 Update Jira status from execution events.
- P1-091 Attach evidence and commit references to the issue.
- P1-092 Move an item to Done only after all completion gates pass.
- P1-093 Reconcile Jira drift and failed synchronization.
- P2-094 Select the next Ready item after completion.

### EPIC 10 — Control Center interface
- P1-100 Implement project selector and main navigation.
- P1-101 Implement project overview dashboard.
- P1-102 Implement backlog and sprint views.
- P1-103 Implement execution contract viewer.
- P1-104 Implement live execution timeline and terminal.
- P1-105 Implement diff and evidence viewer.
- P1-106 Implement approval and risk panels.
- P2-107 Implement responsive mobile states.
- P2-108 Implement accessibility and keyboard navigation.
- P1-109 Implement Agent Monitor UI with agent tree, roles, ownership, runtime state, gates and evidence drill-down.

### EPIC 11 — Recovery, observability and administration
- P1-110 Implement failed, blocked and cancelled execution views.
- P1-111 Implement checkpoint recovery and safe resumption.
- P1-112 Implement audit log search.
- P2-113 Implement integration diagnostics.
- P2-114 Implement retention and archival policies.
- P2-115 Implement administrative policy configuration.
- P1-116 Perform end-to-end release certification, recovery drill and final MVP evidence.

## 4. MVP execution sequence

- Sprint 0: P0-001 through P0-006.
- Sprint 1: P0-010 through P0-012, P0-020 and P0-021.
- Sprint 2: P0-022, P0-030 through P0-032.
- Quality Hardening Gate — complete before Sprint 3: P1-007 and P1-008.
- Sprint 3: P1-038 first, then P0-040 through P0-043.
- Kernel Foundation Gate — must complete before Sprint 4: P0-046 through P0-049.
- Sprint 4: P0-050 through P0-053.
- Sprint 5: P0-060 through P0-064.
- Sprint 6: P0-070 through P0-073.
- Quality & Completion Gate — complete after Sprint 6 and before the Verification Gauntlet: P1-076 and P1-077.
- Verification Gauntlet Gate — complete after Sprint 6 and before Sprint 7: P1-067.
- Sprint 7: P0-080 through P0-083.
- Sprint 8: P1-033, P1-034 and P1-090 through P1-092.
- Sprint 9: P1-100 through P1-106 plus P1-109 Agent Monitor UI.
- Sprint 10: P1-065, P1-066, P1-074, P1-075, P1-093, P1-110 through P1-112 and P1-116; include end-to-end hardening, recovery drills, reconciliation and final release evidence.

## 5. Definition of Ready

An item is Ready only when its objective is unambiguous, dependencies are satisfied, acceptance criteria are testable, required strategic documents are approved, risk classification is available, execution boundaries are explicit and no unresolved decision blocks implementation.

## 6. Definition of Done

The canonical Definition of Done is RIC-012 Section 14. An item is not Done merely because implementation or local tests are complete. Closure requires all applicable acceptance, validation, code-quality review, code review, adversarial QA, exact-head CI, authorized delivery/merge, post-merge checks when required, documentation, evidence and Jira synchronization conditions to be satisfied with no unresolved blocking finding. Before P1-076/P1-077 are implemented, independent control evaluates these conditions directly from evidence; afterward their structured gate results become mandatory closure inputs.

## 7. Governance

Backlog changes that alter MVP scope, execution safety, source-of-truth boundaries or approval policy require a documented decision. Priority changes must not bypass dependencies or risk controls. An agent may propose backlog changes but may not silently redefine strategic scope. To prevent roadmap drift, any future capability explicitly designated as a hardening gate, orchestration safeguard, SDD authority, operator-observability surface or release-certification requirement must also receive a Jira planning anchor before its execution window; the anchor remains A fazer and creates no implementation authority until its own approved SDD/Execution Contract is activated.

## 8. Exit condition

This backlog baseline is complete when all P0 and required P1 items are represented in Jira with dependencies, acceptance criteria and evidence requirements, and when Sprint 0 can be generated as deterministic Execution Contracts without unresolved strategic ambiguity.
