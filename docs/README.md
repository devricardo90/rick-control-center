# RICK Control Center — Documentation Index

This index exists so every document in `docs/` is easy to find. It groups
documents by what kind of truth they carry — see
[`docs/handoffs/sprint-0-developer-handoff.md`](handoffs/sprint-0-developer-handoff.md#4-authoritative-source-hierarchy)
for how these layers relate when they disagree.

## Strategic documents (RIC-001 – RIC-012)

Approved, numbered source-of-truth documents. Do not edit these to reflect
implementation drift — if the implementation legitimately needs to diverge
from one of these, that requires a new approved decision (see the
[ADR template](templates/architecture-decision-record.md)), not a silent edit.

| Doc | Title |
|---|---|
| [`00-documentation-approval-baseline.md`](00-documentation-approval-baseline.md) | Documentation approval baseline |
| [`01-product-vision.md`](01-product-vision.md) | Product vision |
| [`02-prd.md`](02-prd.md) | Product requirements document |
| [`03-technical-architecture.md`](03-technical-architecture.md) | Technical architecture |
| [`04-roadmap.md`](04-roadmap.md) | Roadmap |
| [`05-design-system.md`](05-design-system.md) | Design system |
| [`06-data-model.md`](06-data-model.md) | Data model |
| [`07-state-machine.md`](07-state-machine.md) | State machine |
| [`08-risk-engine.md`](08-risk-engine.md) | Risk engine |
| [`09-mvp.md`](09-mvp.md) | MVP definition |
| [`10-backlog.md`](10-backlog.md) | Backlog |
| [`11-execution-contract-specification.md`](11-execution-contract-specification.md) | Execution Contract specification (RIC-011) |
| [`12-development-protocol.md`](12-development-protocol.md) | Development protocol |

## Decisions

Approved Architecture Decision Records — each records a decision, but
never itself authorizes execution outside an approved Execution Contract
(see the [ADR template](templates/architecture-decision-record.md)).

| Doc | Covers |
|---|---|
| [`decisions/DEC-RIC-001-github-credential-boundary.md`](decisions/DEC-RIC-001-github-credential-boundary.md) | Server-only, optional `GITHUB_TOKEN`; no credential persistence or browser/agent exposure (NDERCC-11) |

## Execution contracts

Concrete, activated contracts for a specific sprint or task — frozen source
snapshots, not living documents. See the
[Execution Contract template](templates/execution-contract.md) to author a
new one.

| Doc | Scope |
|---|---|
| [`execution-contracts/sprint-0-foundation.md`](execution-contracts/sprint-0-foundation.md) | `RIC-EC-S0-001` — Sprint 0 foundation |

## Templates

Reusable, blank templates — copy them, don't edit them in place.

| Doc | Use for |
|---|---|
| [`templates/architecture-decision-record.md`](templates/architecture-decision-record.md) | Recording an architecture/technical decision (ADR) |
| [`templates/execution-contract.md`](templates/execution-contract.md) | Authoring a new task/sprint Execution Contract |

## Guides

Practical, operational how-to documentation — verified against the actual
repository, kept in sync with it.

| Doc | Covers |
|---|---|
| [`guides/local-development.md`](guides/local-development.md) | Clone-to-running-app setup, validation commands, database reset, troubleshooting |

For `@rick/database`-specific detail (schema, domain models, authentication
internals) beyond what the local-development guide covers end to end, see
[`packages/database/README.md`](../packages/database/README.md).

## Evidence

Point-in-time records of what was actually delivered and validated.
Evidence is never silently rewritten — corrections are added as new
sections/entries, not edits that erase what was previously recorded.

Kept directly under `docs/`, not in a `docs/evidence/` subdirectory: the
repository's `.gitignore` already has an `evidence/` rule for large local
runtime-evidence artifacts, which would silently exclude a same-named
subdirectory under `docs/` from Git too.

| Doc | Covers |
|---|---|
| [`sprint-0-evidence.md`](sprint-0-evidence.md) | Full Sprint 0 (NDERCC-2 – NDERCC-8) delivery evidence and exit-criteria evaluation |

## Handoffs

Prepares the repository for the next phase of work without deciding what
that phase is.

| Doc | Covers |
|---|---|
| [`handoffs/sprint-0-developer-handoff.md`](handoffs/sprint-0-developer-handoff.md) | Post-Sprint-0 baseline, what's implemented/not, source hierarchy, risks, next-task procedure, direct-`main` rules, recovery |

## Root-level references outside `docs/`

| File | Purpose |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | Mandatory operating instructions for Claude Code sessions in this repository |
| [`../packages/database/README.md`](../packages/database/README.md) | `@rick/database` package detail |
| [`../.env.example`](../.env.example) | Non-secret environment variable template |
| [`../docker-compose.yml`](../docker-compose.yml) | Local PostgreSQL service definition |
