# DEC-RIC-005 — Canonical operational backlog model and dependency semantics

**Status:** APPROVED
**Proposal:** Jira comment 11943
**Product Owner approval:** Jira comment 11944
**Applies to:** NDERCC-17 / RIC-S2-02 / RIC-010 P0-030

## Decision

P0-030 persists exactly four aggregates — `Sprint`, `Epic`, `Task` and explicit
`TaskDependency` edges — as the minimal deterministic local planning state the
Project State Resolver will later consume. `RoadmapItem` persistence is
deferred, and no generic polymorphic `WorkItem` table is introduced: adding a
second strategic/backlog identity layer before P1-024 traceability semantics
are frozen would have to be reinterpreted later.

Every record belongs to exactly one `Project`. The hierarchy is
Project → Sprint → Epic and Project → Sprint → Task, with a Task optionally
naming an Epic inside that same Sprint. A Task may exist without an Epic but
never without a Sprint. Same-project and same-sprint ownership is enforced by
composite foreign keys in PostgreSQL rather than by application checks alone,
so cross-project contamination is structurally impossible. Deletion uses
`Restrict`, and no public hard-delete API exists for these records.

Identity is an immutable UUID plus an immutable, human-readable local `code`,
unique per Project and stored trimmed and uppercased. Local identity never
depends on Jira being connected. Epic and Task may additionally carry optional
Jira provenance (`externalProvider`, `externalId`, `externalKey`,
`externalUrl`, `lastSyncedAt`); `externalProvider` is required whenever
`externalId` is present, `(projectId, externalProvider, externalId)` is
duplicate-safe, and `externalKey` is mutable display metadata that is never the
database identity. No Jira API call, read or write synchronization is
authorized — P1-033/P1-034 own that.

Sprint and Epic use `PLANNED → ACTIVE → COMPLETED` with cancellation available
from `PLANNED` or `ACTIVE`. Task uses `TODO → IN_PROGRESS → IN_REVIEW → DONE`,
with `IN_REVIEW → IN_PROGRESS` as the rework edge and cancellation available
from any non-terminal state. `COMPLETED`/`CANCELLED` and `DONE`/`CANCELLED` are
terminal. Entering `ACTIVE`/`IN_PROGRESS` stamps `startedAt` and entering
`COMPLETED`/`DONE` stamps `completedAt` in the same update as the status;
cancellation never fabricates a completion timestamp. `READY`, `BLOCKED`,
`AMBIGUOUS` and `CONFLICT` are **not** persisted statuses — they are
resolver/diagnostic outcomes owned by P0-031/P0-032, and persisting them would
let stored lifecycle state drift away from deterministic evaluation.

Task type is required and uses the RIC-006 set (`STORY`, `TASK`, `BUG`,
`SPIKE`, `CHORE`). Priority is required and is exactly `P0`–`P3` with ranks
0–3; there is no `UNSPECIFIED` priority for an operational Task and priority is
never inferred from wording, Jira order or creation time. Planning order is
explicit non-negative integer `sequence` — unique per Project for Sprint, per
Sprint for Epic and Task — and is planning order only, never by itself an
eligibility decision. `acceptanceCriteriaJson` is a deterministic ordered JSON
array of non-empty strings; an empty array is a legitimate not-yet-ready
planning record, and NDERCC-17 draws no eligibility conclusion from it.

`TaskDependency(taskId, dependsOnTaskId)` means `taskId` requires
`dependsOnTaskId`. Both tasks must be in the same Project; self-dependencies,
duplicate edges and directed cycles are rejected; direction is never inferred
or reversed; cross-Sprint and cross-Epic edges are allowed inside one Project.
Dependency writes are permitted only while the dependent Task is `TODO`, and
the set freezes once it leaves `TODO`. For later resolver semantics only a
prerequisite in `DONE` satisfies an edge — `CANCELLED` deliberately does not,
because a cancelled prerequisite is a replanning signal rather than a silent
success. NDERCC-17 stores and validates this contract but computes no
eligibility.

Always immutable after create: `id`, `projectId`, local `code` and `createdAt`.
Task planning fields — sprint/epic placement, title, description, type,
priority, sequence, acceptance criteria and dependencies — are mutable only
while `TODO`. Sprint and Epic structural fields are mutable only while
`PLANNED`. Archival is separate from lifecycle status, is permitted only for
terminal records, and leaves them queryable as history.

## Implementation notes

These follow from the decision but are recorded because they were resolved
during implementation rather than stated in the approved text.

- Cycle rejection is the one dependency rule no relational constraint can
  express. It is a recursive reachability query run inside the same
  transaction as the insert. Soundness comes from the pre-existing
  `withMutableProjectTransaction` envelope, which holds a
  `SELECT ... FOR UPDATE` lock on the owning project row: because every
  uniqueness scope in this slice lives inside one Project, serializing on that
  row also makes the in-transaction uniqueness pre-checks authoritative, which
  is what lets the persistence layer return precise typed errors instead of
  parsing Prisma constraint metadata.
- Self-dependency is additionally enforced by a `CHECK` constraint written by
  hand in the migration, because `@@check` has no representation in this Prisma
  version — the same situation as `operators_singleton_check`.
- Adding an Epic or Task to a Sprint that has already reached a terminal status
  is rejected as frozen planning. The approved text froze a Sprint's own
  structural fields at `ACTIVE` but did not state a rule for adding children;
  adding work to a `COMPLETED` or `CANCELLED` Sprint is incoherent under any
  reading, whereas adding a Task to an `ACTIVE` Sprint is ordinary practice and
  remains allowed.
- A prerequisite in another Project is reported as a distinct
  cross-project-dependency failure rather than as not-found. This distinguishes
  "no such task" from "task in another project" only for a caller who already
  holds that random v4 UUID, which is not a usable existence oracle; every
  ordinary project-scoped lookup still treats another project's identifiers as
  not-found.

## Explicitly deferred

This decision does not authorize `RoadmapItem` persistence, the P0-031 next
executable item resolver, the P0-032 blocked/ambiguous/conflict classifier,
persisted `READY`/`BLOCKED`/`AMBIGUOUS`/`CONFLICT` states, Jira API calls or
synchronization, the P1-024 traceability graph, cross-project dependency
orchestration, automatic Epic/Sprint completion from children, automatic
priority inference, the Execution Contract Engine, the Risk Engine, the Agent
Runtime, UI work, or unrelated schema/refactor/dependency changes.

## Consequences

P0-031 receives a deterministic, cycle-free, same-project Task graph; local
planning works before any Jira write integration exists; Jira identity cannot
become the system's primary identity by accident; readiness stays computed
truth rather than duplicated persisted truth; and explicit sequence removes
`createdAt` ordering ambiguity.

In exchange, RoadmapItem-to-operational traceability is deferred, a Task that
has begun execution cannot be silently reparented, reprioritized or have its
dependencies rewritten, and a `CANCELLED` prerequisite leaves its dependents
unsatisfied until replanning. These trade-offs are intentional: stable local
execution inputs matter more than permissive mutation in the resolver
foundation.
