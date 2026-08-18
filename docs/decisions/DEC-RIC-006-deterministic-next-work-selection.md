# DEC-RIC-006 — Deterministic next-work selection semantics

**Status:** APPROVED
**Proposal:** Jira comment 12049
**Clarification Amendment 1:** Jira comment 12082
**Clarification Amendment 2:** Jira comment 12083
**Product Owner approval:** Jira comment 12084
**Approved SDD:** RIC-SPEC-NDERCC-S2-03-001 v1.0.0 — proposal 12117, approval 12118
**Applies to:** NDERCC-18 / RIC-S2-03 / RIC-010 P0-031

## Decision

P0-031 computes **one deterministic next work item for governed preparation**
from already persisted project-owned truth and backlog state. A `SELECTED`
result is **not execution authorization**: it names the next backlog item the
Project State Resolver would prepare, and nothing more. Execution still
requires the later governed chain — Execution Contract, policy/risk gates and
runtime authority — none of which exists yet. P0-031 must not fabricate those
gates, must not generate an Execution Contract and must not start an agent.

The resolver is pure and read-only. It makes no database mutation, no Jira,
GitHub or Google provider call, no filesystem write and no lifecycle
transition while selecting; it persists no `READY`, `BLOCKED`, `AMBIGUOUS` or
`CONFLICT` state; and it returns the same result for the same normalized
project state and resolver version. The initial resolver version is the stable
constant `P0_031_V1`.

The resolver returns a discriminated read-only result with exactly two
top-level outcomes: `SELECTED` and `NO_ELIGIBLE_WORK`. Per Clarification
Amendment 2, `NO_ELIGIBLE_TASK` is not an alias, enum value, persisted state,
API/result outcome, test terminology or alternative contract terminology, and
must not exist anywhere in the implementation surface. Inside a
`NO_ELIGIBLE_WORK` result the permitted coarse reason labels are exactly
`PROJECT_NOT_ACTIVE`, `STRATEGIC_TRUTH_UNSAFE` and `NO_ELIGIBLE_WORK`. These
are evidence labels, never top-level outcomes and never persisted workflow
states; reason ordering is defined explicitly by code rather than left to set
or insertion accident.

Selection is allowed only for an existing Project whose lifecycle is exactly
`ACTIVE`. A paused or archived Project yields a first-class
`NO_ELIGIBLE_WORK`, not an exception. Cross-project state never influences
ranking, exclusion or output, and another project's identifiers cannot be used
to alter or probe a result.

### Applicability-scoped strategic blocking

P0-031 must not guess task-to-document, task-to-requirement or
task-to-decision traceability that does not yet exist; P1-024 full
traceability remains deferred. Strategic-truth blocking is therefore
**candidate-scoped, not globally project-freezing by mere existence**.

For each candidate Task the resolver evaluates only the strategic truth that
is deterministically applicable to that candidate, supplied as explicit,
project-owned governed context by the composition boundary. Applicability is
never inferred from prose, titles, descriptions, code similarity, semantic
similarity, document proximity, Jira ordering, timestamps, LLM output or array
position. A Requirement or Decision may affect a candidate only when it
belongs to the candidate's Project **and** appears in that candidate's
applicable governed context. An applicable current Decision in `PROPOSED`
blocks only that candidate; `APPROVED` and `REJECTED` are resolved states for
this gate and `SUPERSEDED` is not part of the current Decision set. An
applicable fact backed by stale, unapproved, rejected-as-source,
superseded-as-source or otherwise no-longer-current provenance blocks only its
own candidate. A rule such as "any PROPOSED Decision in the Project blocks all
Tasks" is explicitly prohibited. When applicability cannot be established
deterministically, the resolver invents no relationship and that candidate
simply cannot be selected. This mechanism is a read-time input boundary only:
it creates no task-to-strategic persistence and no traceability graph.

### Fail-closed deterministic inputs

P0-031 uses no implicit defaults, synthesized identities, fallback ordering
values or inferred ranking values. A candidate is eligible for ranking only
when every deterministic input required for its eligibility and ranking is
present, valid, canonical and project-consistent: `Sprint.sequence` and
`Task.sequence` under the existing non-negative 32-bit integer contract,
`Task.priority` exactly `P0`/`P1`/`P2`/`P3`, canonical `Task.code` under the
DEC-RIC-005 backlog-code contract, and the required identity and ownership
relations — Project, Task, Sprint, optional Epic when present, and dependency
identities when an edge exists. The resolver validates rather than silently
normalizing malformed data into eligibility, and never substitutes
`createdAt`, insertion order, Jira key or order, title text, array position, a
timestamp or a random value for a missing input. Invalidity of one candidate
does not contaminate unrelated valid candidates: if another candidate
independently satisfies every invariant, it may still be selected.

### Operational candidate eligibility

A Task is eligible only when the target Project is `ACTIVE`; the Task belongs
to that Project, is unarchived and is exactly `TODO`; its Sprint belongs to
the same Project, is unarchived and is exactly `ACTIVE`; any Epic it names
belongs to the same Project and the same Sprint, is unarchived and is exactly
`ACTIVE`; its acceptance criteria form a valid ordered array with at least one
non-empty criterion; every prerequisite edge resolves inside the same Project
and every prerequisite status is exactly `DONE`; and its explicit governed
strategic applicability is established and safe. `CANCELLED`, `TODO`,
`IN_PROGRESS` and `IN_REVIEW` prerequisites do not satisfy an edge. Tasks in
`IN_PROGRESS`, `IN_REVIEW`, `DONE` or `CANCELLED` are never next-work
candidates. The resolver never changes Sprint, Epic or Task lifecycle to make
a candidate eligible.

### Deterministic total ranking

Eligible candidates are ranked ascending by exactly this tuple:

1. `Sprint.sequence`;
2. Task priority rank — `P0 = 0`, `P1 = 1`, `P2 = 2`, `P3 = 3`;
3. `Task.sequence`;
4. canonical uppercase `Task.code`, lexical ascending;
5. `Task.id`, lexical ascending.

No other field may enter ranking. `createdAt`, `updatedAt`, any timestamp,
database insertion order, array position, Jira ordering or key,
`Epic.sequence`, title or description wording, provider metadata, LLM/AI
judgment, randomness and wall-clock time are prohibited ranking inputs. The
final `Task.id` tie-break makes the order total, so equivalent business
candidates never require an LLM or an arbitrary choice: one deterministic
winner always exists when the eligible set is non-empty. `Epic.sequence` is
excluded because `Task.sequence` is already unique within a Sprint and Tasks
may legally exist without an Epic.

`SELECTED` carries deterministic sanitized evidence sufficient to reproduce
the decision — projectId, resolver version, the selected Task's id, code,
priority and sequence, the Sprint id, code and sequence, the optional Epic id
and code, the exact ranking tuple, a prerequisite satisfaction summary and an
applicable strategic-context safety summary — and never a secret, credential,
raw provider response or transport metadata. `NO_ELIGIBLE_WORK` carries
projectId, resolver version, the ordered coarse reasons and sanitized
deterministic counts and identifiers sufficient to reproduce why no selection
occurred.

## Implementation notes

These follow from the decision but are recorded because they were resolved
during implementation rather than stated in the approved text.

- Because no task-to-strategic persistence relation exists or is authorized,
  applicability is expressed as an explicit per-candidate input record
  carrying `taskId`, an `applicabilityEstablished` discriminant and the
  applicable Requirement, Decision and strategic-source identifiers. A
  candidate whose record is absent, or whose discriminant is false, is not
  selectable — the resolver has no other way to learn applicability and is
  forbidden from guessing it.
- Strategic-source safety in the read composition reuses the NDERCC-16
  source-eligibility contract exactly rather than restating it: an applicable
  source is safe only when its `approvalStatus` is `APPROVED`, its
  `syncStatus` is `SYNCED`, its synchronization pointer matches the snapshot
  it names, and that snapshot is still the current one for the source.
- Project lifecycle is checked before candidate evaluation, so a non-`ACTIVE`
  project reports `PROJECT_NOT_ACTIVE` alone rather than also reporting the
  incidental absence of eligible candidates.
- Reason ordering is a fixed declared sequence — `PROJECT_NOT_ACTIVE`, then
  `STRATEGIC_TRUTH_UNSAFE`, then `NO_ELIGIBLE_WORK` — so a result never
  depends on the order in which the evaluator happened to discover reasons.

## Explicitly deferred

This decision does not authorize the NDERCC-19 / P0-032 detailed
blocked/ambiguous/conflict diagnostic taxonomy, automatic conflict resolution,
LLM/AI ranking or adjudication, `RoadmapItem` persistence, the P1-024
traceability graph, a Task↔Requirement/Decision persistence relation, Jira API
calls or synchronization, Google/Drive provider calls, GitHub mutation,
Execution Contract generation or engine, the Risk Engine, the Deterministic
Orchestrator Kernel, the Verification Gauntlet, the Agent Runtime, SSE or
event persistence, automatic execution start, Task/Sprint/Epic lifecycle
mutation, cross-project dependency orchestration, persistence of resolver or
readiness outcomes, any schema or migration change, UI work, or unrelated
refactors and dependency changes.

## Consequences

One project state always produces one reproducible next-work decision. Later
Sprint work cannot silently preempt earlier active Sprint planning, because
`Sprint.sequence` ranks first. Priority stays explicit rather than inferred,
dependency satisfaction reuses DEC-RIC-005 exactly, and stale or unresolved
applicable strategic truth fails closed instead of being guessed through.
Resolver results remain computed truth and cannot drift from backlog state,
and the future Execution Contract, Risk and Kernel layers can consume the
selected Task without P0-031 usurping their authority.

In exchange, a Task inside a `PLANNED` Sprint or Epic is not selected until
that lifecycle is explicitly `ACTIVE`; a candidate whose governed strategic
applicability has not been explicitly established cannot be selected at all,
because inventing the relationship is prohibited; and the reasons for blocked,
conflicting or ambiguous state stay intentionally coarse until NDERCC-19.
These trade-offs are deliberate — a conservative false negative is preferable
to a nondeterministic or unsafe false positive in the resolver foundation.
