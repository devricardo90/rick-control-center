# RIC-010 — Backlog

Status: Draft baseline

Purpose: convert the approved product and architecture documents into an ordered, traceable implementation backlog.

## 1. Backlog principles

The backlog is not an informal task list. Every item must trace to an approved requirement, architectural rule, risk control, state transition, or MVP outcome. Jira becomes the operational source of truth once an item enters execution. Google Docs remains the strategic source of truth. GitHub contains implementation and evidence.

Each item must include objective, scope, exclusions, acceptance criteria, dependencies, risk level, required evidence, validation commands, affected repositories, expected state transitions, approval policy, and completion definition.

## 2. Priority model

- P0: required for a safe executable foundation.
- P1: required for the end-to-end MVP flow.
- P2: required for operational completeness and usability.
- P3: deferred beyond the first validated release.

## 3. Epic structure

### EPIC 0 — Foundation and repository baseline
- P0-001 Initialize Nuxt 3 and TypeScript workspace.
- P0-002 Configure lint, typecheck, unit tests, and build.
- P0-003 Configure PostgreSQL, migrations, and local development.
- P0-004 Establish environment and secret-handling policy.
- P0-005 Add CI validation and protected completion gates.
- P0-006 Implement structured audit-safe logging.

### EPIC 1 — Identity, workspace, and projects
- P0-010 Implement user and workspace foundations.
- P0-011 Create project registration and settings.
- P0-012 Connect a GitHub repository.
- P1-013 Register Google Drive strategic-document locations.
- P1-014 Register Jira project and workflow configuration.
- P1-015 Display project health and integration status.

### EPIC 2 — Strategic truth resolution
- P0-020 Model documents, versions, and approval status.
- P0-021 Import and snapshot approved Google Docs.
- P0-022 Extract requirements, decisions, and constraints.
- P1-023 Detect missing or conflicting strategic inputs.
- P1-024 Build project truth summary and traceability graph.
- P1-025 Prevent execution from unapproved or stale truth.

### EPIC 3 — Backlog and sprint resolution
- P0-030 Model epics, items, dependencies, and priorities.
- P0-031 Determine the next executable item deterministically.
- P0-032 Detect blocked, ambiguous, and conflicting items.
- P1-033 Synchronize approved items with Jira.
- P1-034 Preserve external IDs and idempotent Jira operations.
- P1-035 Display readiness and dependency status.

### EPIC 4 — Execution Contract
- P0-040 Define the canonical schema.
- P0-041 Generate immutable contracts from approved inputs.
- P0-042 Validate completeness before execution.
- P0-043 Hash and version every contract.
- P1-044 Render human-readable contract review.
- P1-045 Store provenance and linked requirements.

### EPIC 5 — Risk Engine and approvals
- P0-050 Implement deterministic risk scoring.
- P0-051 Classify file, database, infrastructure, and Git operations.
- P0-052 Determine supervised versus autonomous policy.
- P0-053 Block prohibited or incomplete operations.
- P1-054 Create approval requests and record decisions.
- P1-055 Require fresh approval when material scope changes.

### EPIC 6 — Agent runtime and orchestration
- P0-060 Integrate the Claude Agent SDK runtime.
- P0-061 Create sessions from valid contracts.
- P0-062 Enforce allowed tools, paths, and command boundaries.
- P0-063 Stream execution events through SSE.
- P0-064 Persist checkpoints, events, and outcomes.
- P1-065 Support controlled retry and resume.
- P1-066 Prevent concurrent conflicting executions.

### EPIC 7 — Validation and evidence
- P0-070 Execute contract-defined validation commands.
- P0-071 Capture test, lint, typecheck, and build results.
- P0-072 Capture diffs, logs, and artifacts.
- P0-073 Evaluate completion against acceptance criteria.
- P1-074 Build evidence bundles linked to executions.
- P1-075 Display failures and remediation context.

### EPIC 8 — Git and delivery lifecycle
- P0-080 Create isolated execution branches.
- P0-081 Record repository baseline and worktree state.
- P0-082 Generate deterministic commit messages.
- P0-083 Prevent commit or push before gates pass.
- P1-084 Commit approved changes.
- P1-085 Push to the configured remote.
- P1-086 Record commit SHA, branch, and remote evidence.
- P2-087 Support pull-request creation where required.

### EPIC 9 — Jira completion loop
- P1-090 Update Jira status from execution events.
- P1-091 Attach evidence and commit references.
- P1-092 Move an item to Done only after all gates pass.
- P1-093 Reconcile Jira drift and failed synchronization.
- P2-094 Select the next Ready item after completion.

### EPIC 10 — Control Center interface
- P1-100 Implement project selector and navigation.
- P1-101 Implement project overview dashboard.
- P1-102 Implement backlog and sprint views.
- P1-103 Implement Execution Contract viewer.
- P1-104 Implement live timeline and terminal.
- P1-105 Implement diff and evidence viewer.
- P1-106 Implement approval and risk panels.
- P2-107 Implement responsive mobile states.
- P2-108 Implement accessibility and keyboard navigation.

### EPIC 11 — Recovery, observability, and administration
- P1-110 Implement failed, blocked, and cancelled views.
- P1-111 Implement checkpoint recovery and safe resumption.
- P1-112 Implement audit-log search.
- P2-113 Implement integration diagnostics.
- P2-114 Implement retention and archival policies.
- P2-115 Implement administrative policy configuration.

## 4. MVP execution sequence

- Sprint 0: P0-001 through P0-006.
- Sprint 1: P0-010 through P0-012, P0-020, and P0-021.
- Sprint 2: P0-022 and P0-030 through P0-032.
- Sprint 3: P0-040 through P0-043.
- Sprint 4: P0-050 through P0-053.
- Sprint 5: P0-060 through P0-064.
- Sprint 6: P0-070 through P0-073.
- Sprint 7: P0-080 through P0-083.
- Sprint 8: P1-033, P1-034, and P1-090 through P1-092.
- Sprint 9: P1-100 through P1-106.
- Sprint 10: end-to-end hardening, recovery, and release evidence.

## 5. Definition of Ready

An item is Ready only when its objective is unambiguous, dependencies are satisfied, acceptance criteria are testable, required strategic documents are approved, risk classification is available, execution boundaries are explicit, and no unresolved decision blocks implementation.

## 6. Definition of Done

An item is Done only when implementation is complete, all required validations pass, evidence is stored, traceability is preserved, the approved Git operation is complete, Jira reflects the final state, and no material deviation from the Execution Contract remains unresolved.

## 7. Governance

Backlog changes that alter MVP scope, execution safety, source-of-truth boundaries, or approval policy require a documented decision. Priority changes must not bypass dependencies or risk controls. An agent may propose backlog changes but may not silently redefine strategic scope.

## 8. Exit condition

This baseline is complete when all P0 and required P1 items exist in Jira with dependencies, acceptance criteria, and evidence requirements, and Sprint 0 can be generated as deterministic Execution Contracts without unresolved strategic ambiguity.
