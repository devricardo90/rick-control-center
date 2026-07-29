# RIC-009 — MVP

Status: Draft  
Version: 1.0  
Project: RICK Control Center

## 1. Purpose

Define the smallest production-credible version of RICK Control Center that proves the complete governed development loop: resolve project truth, generate an execution contract, execute one controlled task, validate evidence, request approval when required, and synchronize GitHub and Jira.

## 2. MVP outcome

The MVP is successful when a user can register one software project, connect its strategic documentation, Jira project and GitHub repository, select an eligible work item, run a controlled agent execution, inspect live progress and evidence, approve or reject guarded actions, and obtain an auditable final result.

## 3. Included scope

- Project setup and integration health.
- Source-of-truth resolution across documents, Jira and GitHub.
- Immutable versioned Execution Contract generation.
- Single controlled agent execution with SSE events and checkpoints.
- Lint, typecheck, tests, build and evidence capture.
- Human approval for guarded actions.
- Isolated branch, commit and authorized push.
- Controlled Jira transitions and evidence updates.
- Dashboard with state, timeline, validations, diff and report.

## 4. Explicitly excluded

- Multi-agent parallel execution.
- Autonomous multi-sprint loops.
- Marketplace, billing or full organization RBAC.
- Native mobile applications.
- Full IDE replacement.
- Automatic production deployment.
- Arbitrary shell access.
- Cross-project dependency orchestration.

## 5. Golden path

1. Open a configured project.
2. Check integration health.
3. Resolve documentation, Jira and GitHub state.
4. Select an eligible Jira item.
5. Generate and review the Execution Contract.
6. Evaluate risk and start execution.
7. Stream and persist events.
8. Run mandatory validations.
9. Review evidence and approve guarded actions.
10. Commit, push and update Jira.
11. Produce an immutable final report.

## 6. Required entities

Project, Integration, DocumentSource, Requirement, JiraWorkItem, AgentProfile, ExecutionContract, Execution, ExecutionEvent, Evidence, ValidationRun, Approval, GitOperation, RiskAssessment, AuditEntry and Checkpoint.

## 7. Required screens

- Project list and setup.
- Project control center.
- Source-of-truth snapshot.
- Work-item selection.
- Execution Contract review.
- Live execution console.
- Validation and evidence view.
- Approval gate.
- Execution report and history.

## 8. Security baseline

- Secrets encrypted at rest.
- Least-privilege integration permissions.
- Server-side authorization for every write.
- No secrets in logs or agent context.
- Allowed-command and allowed-path enforcement.
- Immutable audit records for approvals and external mutations.
- Idempotency for GitHub and Jira writes.

## 9. Reliability baseline

- Durable event persistence before UI broadcast.
- Optimistic concurrency on state transitions.
- Recoverable execution after process restart.
- Timeout and retry policies for integrations.
- Duplicate-safe commit, push and Jira update operations.

## 10. Acceptance criteria

- MVP-AC-001: Configure a project with valid documentation, Jira and GitHub references.
- MVP-AC-002: Produce a provenance-backed project snapshot.
- MVP-AC-003: Generate and review a versioned Execution Contract.
- MVP-AC-004: Prevent execution outside contract scope.
- MVP-AC-005: Preserve live execution state and events after reload.
- MVP-AC-006: Block completion when mandatory validations fail.
- MVP-AC-007: Block guarded actions without matching approval.
- MVP-AC-008: Create a commit and authorized push after success.
- MVP-AC-009: Update Jira only after the corresponding milestone.
- MVP-AC-010: Produce a report linking contract, events, evidence, approvals and outcomes.
- MVP-AC-011: Preserve execution history after application restart.
- MVP-AC-012: Prevent duplicate effects from repeated external-write requests.

## 11. Delivery slices

1. Foundation: repository structure, Nuxt, API boundary, PostgreSQL, migrations and audit primitives.
2. Project and integrations: setup, health and normalized adapters.
3. Contract and governance: Execution Contract, Risk Engine, approvals and State Machine.
4. Runtime: Claude Agent SDK orchestration, tool policy, events, checkpoints and cancellation.
5. Evidence and validation: validation runner, artifact storage, diff viewer and reporting.
6. External completion: commit, push, Jira transition, recovery and end-to-end tests.

## 12. Definition of MVP done

The golden path must pass end to end in a clean test project. P0 acceptance criteria must be automated where practical, security and recovery scenarios must be verified, documentation must match implementation, and no external mutation may occur outside the State Machine, Risk Engine and Execution Contract rules.
