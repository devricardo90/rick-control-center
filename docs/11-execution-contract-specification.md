# RIC-011 — Execution Contract Specification

Status: Approved baseline  
Product: RICK Control Center  
Version: 1.0

## 1. Purpose

The Execution Contract is the immutable, machine-readable agreement that defines exactly what an agent may execute, under which constraints, with which evidence, and which approvals are required before Git and Jira side effects occur.

It is the deterministic boundary between strategic documentation, operational planning, autonomous execution, validation, and human control.

## 2. Core principles

- Every execution starts from a versioned contract.
- The contract is generated from approved sources of truth.
- The contract is immutable after execution begins.
- Scope, permissions, risks, validations, and expected evidence must be explicit.
- Agents may not infer authority absent from the contract.
- Commit, push, Jira transition, deployment, destructive operation, or secret access require explicit policy authorization.
- Every decision and side effect must be traceable to the contract ID.

## 3. Contract identity

Required fields:

- `contract_id`
- `contract_version`
- `project_id`
- `sprint_id`
- `task_ids`
- `created_at`
- `created_by`
- `source_snapshot_id`
- `content_hash`
- `status`: `DRAFT`, `READY`, `ACTIVE`, `COMPLETED`, `FAILED`, `CANCELLED`, or `SUPERSEDED`

## 4. Source snapshot

The contract freezes approved document revisions, Jira issue versions and statuses, repository URL, default branch, HEAD SHA, working-tree condition, decisions, exceptions, environment profile, agent and skill versions, protocol version, and Risk Engine version.

Changes after activation require a new contract version or an explicit re-resolution flow.

## 5. Objectives

The contract contains:

- `product_objective`
- `phase_objective`
- `sprint_objective`
- `task_objectives`
- `non_goals`

Objectives describe measurable outcomes, not only implementation activity.

## 6. Scope definition

Scope is expressed through allowlists and denylists for repository paths, file patterns, services, database schemas, Jira issues, commands, integrations, and documentation targets.

Denied scope overrides allowed scope. Unlisted resources are denied by default.

The contract must define how pre-existing dirty-worktree changes are handled.

## 7. Execution modes

- `SUPERVISED`: human approval before material transitions and Git side effects.
- `CONTROLLED_AUTONOMOUS`: execution, validation, commit, and push allowed within an isolated branch when every gate passes.
- `DRY_RUN`: planning, resolution, risk analysis, and simulated evidence only.
- `RECOVERY`: limited operations to restore a verified safe checkpoint.

The execution mode cannot be elevated during execution without a new approved contract.

## 8. Agent assignment

The contract defines the primary agent, specialist agents, models, runtime versions, MCP servers, tools, skills, maximum parallelism, work ownership, handoff format, and escalation rules.

Concurrent write scopes must not overlap unless a deterministic merge strategy is defined.

## 9. Preconditions

Typical preconditions include approved documentation, eligible Jira state, repository access, expected HEAD, accepted working-tree condition, available dependencies, secret references, tool versions, environment health, and absence of conflicting active contracts.

Each precondition records `PASS`, `FAIL`, `BLOCKED`, or `WAIVED`, with evidence and evaluator identity.

## 10. Work units

Each deterministic work unit defines:

- `work_unit_id`
- objective
- dependencies
- allowed paths
- expected outputs
- commands
- validation gates
- rollback checkpoint
- completion condition

Successful command exit alone does not complete a work unit.

## 11. Command policy

Commands are classified as:

- `READ_ONLY`
- `LOCAL_WRITE`
- `EXTERNAL_WRITE`
- `DESTRUCTIVE`

The contract specifies allowed classes, exact commands or patterns, timeouts, retries, working directories, environment variables, and output capture.

Shell expansion outside approved patterns is prohibited.

## 12. Risk declaration

The Risk Engine attaches findings, severity, confidence, affected resources, mitigations, approval level, residual risk, and blocking decisions.

Risk levels:

- `LOW`: normal automated execution.
- `MEDIUM`: additional validation or checkpoint.
- `HIGH`: explicit human approval.
- `CRITICAL`: blocked unless an authorized emergency or recovery procedure exists.

## 13. Validation contract

Mandatory gates may include format, lint, typecheck, unit tests, integration tests, end-to-end tests, build, migration verification, security scanning, accessibility, responsive UI checks, `git diff --check`, and runtime smoke tests.

Each gate defines command, timeout, expected result, evidence, failure policy, and retry policy.

Validation evidence must bind to the exact repository state and commit candidate.

## 14. Evidence contract

Evidence may include command output, exit code, duration, diff, screenshots, test reports, logs, database checks, URLs, generated artifacts, commit identifiers, and branch identifiers.

Every evidence record includes timestamp, producer, content hash, storage reference, and related work unit or validation gate.

Corrections create new evidence versions; they do not silently replace prior records.

## 15. Approval gates

Each approval gate defines:

- `approval_id`
- trigger state
- required role
- decision options
- minimum evidence
- expiration
- comment requirement
- authorized transition

Approval scopes are independent. Implementation approval does not automatically authorize push or deployment.

## 16. Git policy

The contract specifies repository, remote, base branch, expected SHA, execution branch, staging rules, allowed commit files, commit-message format, signing, push target, force-push policy, PR requirement, and merge strategy.

Before commit, staged paths must match contract scope. Before push, the pushed commit must equal the validated candidate.

## 17. Jira policy

The contract defines permitted issues, fields, comments, and transitions.

Jira updates occur only after corresponding evidence exists. Done requires the complete Definition of Done, not merely successful implementation commands.

External updates use idempotency keys derived from contract ID, operation type, and target.

## 18. Retry, pause, and recovery

Retry limits are defined independently for commands, validations, integrations, and work units. Original failure evidence is preserved.

Pause creates a checkpoint containing repository state, active work unit, completed validations, unresolved risks, and pending approvals.

Recovery requires checkpoint integrity and source compatibility verification.

## 19. Cancellation

Cancellation specifies whether local changes are preserved, reverted, or packaged as evidence. Completed external operations are not silently undone. Compensating actions require authorization and evidence.

## 20. Completion criteria

A contract reaches `COMPLETED` only when:

- all required work units are complete;
- mandatory validations pass against the final candidate;
- required evidence exists and passes integrity checks;
- approval gates are satisfied;
- authorized Git and Jira operations complete;
- no blocking risk remains;
- final summary and audit records are stored.

## 21. Canonical schema outline

Canonical serialization is JSON. YAML may be used for authoring but must compile to canonical JSON before activation.

```json
{
  "identity": {},
  "source_snapshot": {},
  "objectives": {},
  "scope": {},
  "execution_mode": "SUPERVISED",
  "agents": [],
  "preconditions": [],
  "work_units": [],
  "command_policy": {},
  "risk_assessment": {},
  "validations": [],
  "evidence_requirements": [],
  "approval_gates": [],
  "git_policy": {},
  "jira_policy": {},
  "retry_policy": {},
  "recovery_policy": {},
  "completion_policy": {},
  "signatures": []
}
```

## 22. Canonicalization and integrity

Before hashing, the contract uses deterministic key ordering, normalized Unicode, normalized line endings, explicit null handling, and stable number representation.

The content hash excludes mutable runtime status and signatures but includes all execution-authority fields.

## 23. Versioning

Schema changes follow semantic versioning:

- `PATCH`: clarification or backward-compatible optional field.
- `MINOR`: backward-compatible capability addition.
- `MAJOR`: incompatible semantic or structural change.

An active contract is interpreted using the exact schema version recorded at activation.

## 24. Security requirements

- Secrets are referenced, never embedded.
- Tool permissions follow least privilege.
- Agent prompts and external content are untrusted input.
- Prompt injection cannot expand contract authority.
- Remote writes require target verification.
- Sensitive evidence is redacted before display or export.
- Audit events are append-only.

## 25. Required tests

The implementation must include schema validation, canonicalization and hash stability, permission boundaries, allowlist/denylist precedence, invalid transitions, idempotency, approval scope, validation binding, dirty-worktree policy, checkpoint integrity, recovery, malicious input, and prompt-injection tests.

## 26. Acceptance criteria

The specification is implemented when RICK Control Center can generate, validate, hash, approve, activate, execute, pause, resume, supersede, and audit an Execution Contract without undocumented agent judgment.

Every authorized action must answer:

1. Which contract allowed it?
2. Which rule and scope covered it?
3. Which evidence proves it occurred correctly?
4. Which approval authorized any required side effect?
