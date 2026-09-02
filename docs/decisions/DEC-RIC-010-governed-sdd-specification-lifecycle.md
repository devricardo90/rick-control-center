# DEC-RIC-010 — Governed SDD specification lifecycle

**Status:** APPROVED — recorded under the NDERCC-23 execution authorization
**Approved SDD:** RIC-SPEC-NDERCC-23-001 v1.0.0 — Jira comment 12984
**Execution Contract:** RIC-EC-NDERCC-23-001 v1.0.0 — Jira comment 12984
**Applies to:** NDERCC-23 / RIC-S3-01 / RIC-010 P1-038 / RIC-004 RIC-E07A
**Baseline:** `0a272627de427821e669755e4d534faed3d9b00b`
**Date:** 2026-09-02

> **This ADR records a decision. It does not authorize execution.** Independent
> review of the NDERCC-23 implementation is a separate step and is not granted
> by this record.

## Decision

P1-038 persists exactly one new aggregate — `ImplementationSpec` — plus the two
traceability link tables `implementation_spec_requirements` and
`implementation_spec_decisions`. Together they make Spec-Driven Development an
explicit RCC capability instead of the informal, protocol-only convention it
has been until now: specifications named `RIC-SPEC-<scope>-NNN` at a semantic
version, recorded only as Jira comments (DEC-RIC-006, DEC-RIC-009). Those
identifier and version conventions are **preserved**, not replaced — the model
formalises what the project already practises.

A specification is project-owned and binds to exactly one `Task`. It is the
mandatory layer RIC-E07A places between requirements and planning on one side
and the Execution Contract on the other. **No Execution Contract entity,
schema, generator, validator or hash is created by this decision.** P0-040
through P0-043 own the contract, and none of them exists yet.

## Identity and versioning

Identity has two independent halves that must not be conflated:

- **Lineage identity** is `(projectId, code)` — an immutable, trimmed and
  uppercased local code, unique per Project, using the same canonical-code rule
  as the operational backlog (reused rather than re-implemented, so the two
  cannot drift).
- **Version identity** is a plain `major.minor.patch` triple. It is stored both
  as three `INTEGER` columns — so ordering in SQL is a correct total order
  rather than lexicographic — and as the canonical string actually written in
  documents and Jira. Pre-release and build metadata are not accepted, and a
  leading `v` is rejected rather than stripped, so two different strings can
  never denote one version.

`(projectId, code, version)` is unique. A revision is a **new row**, and its
version must be strictly greater than every version its lineage already holds,
enforced transactionally under the project row lock. A revision inherits its
lineage's Task rather than accepting one: a lineage governs one unit of work
for its whole life, and letting a revision move would silently transfer
authority.

`contentHash` is the SHA-256 of a canonical serialization of the content
columns **together with the rule set that specification is interpreted
under**, recomputed by the persistence layer on every write and never accepted
from a caller — the `DocumentSnapshot` rule applied here. It identifies *what a
specification says*; `(projectId, code, version)` identifies *which
specification it is*. Two revisions with identical bodies **under the same
rules version** therefore share a hash, which is precisely the signal that a
revision changed nothing. **It is not an Execution Contract hash and does not
implement P0-043.**

### The rules version is part of the hash, and it is the specification's own

Every row stores the `rulesVersion` it was authored under, and the canonical
serialization takes that version as an **explicit input** rather than reading
the installed `SPEC_LIFECYCLE_VERSION` from module scope.

Both halves of that matter, for different reasons:

- **Including the rules version** keeps two otherwise identical bodies from
  collapsing to one canonical identity when the rules that govern them differ.
  The rules decide what the words *mean*, so the same words under different
  content rules are not the same specification.
- **Taking it as an argument** is what keeps history stable. Reading the
  installed constant during recomputation would mean that bumping
  `SPEC_LIFECYCLE_VERSION` silently rewrote the canonical identity of every
  specification already approved under earlier rules — including ones a later
  Execution Contract had already been derived against. Recomputation therefore
  always uses the row's persisted `rulesVersion`
  (`recomputeImplementationSpecContentHash`), never today's.

`rulesVersion` and `contentHash` are written together in the same statement as
the body, so a row can never hold a hash that disagrees with its own rules
version. Content is only ever *authored* — on creation, revision, or a draft
edit — and authoring always uses the installed rule set; there is deliberately
no path that rewrites a stored body under a different one.

Two related questions are kept apart on purpose. "What did this specification
say, under its own rules?" is the hash, and it is fixed for the life of the
row. "Would this specification still pass validation today?" is the
`INVALID_CONTENT` eligibility signal, and it is deliberately evaluated under
the *current* rules — a specification that no longer satisfies the rules in
force must stop being derivable from, without its historical identity
changing.

## Content model

The content columns map one-to-one onto what RIC-E07A requires a specification
to define. Four are always required for a specification to be approvable —
expected behaviour, scope, out of scope, and verifiable acceptance criteria.
The remaining five are RIC-E07A's *"quando aplicável"* fields — constraints,
dependencies, risks, interfaces/contracts and validation strategy. They are
always *recorded* as ordered arrays and may legitimately be empty, because an
empty list states "none recorded", which is a different claim from a missing
field.

An empty `acceptanceCriteria` is a hard finding rather than a warning, because
RIC-E07A's exit criterion is that no implementation advances without a valid
specification and *verifiable* criteria.

`Task.acceptanceCriteriaJson` (DEC-RIC-005 §9) is **not** superseded or
duplicated by this. The two sit at different layers of the canonical
planning → specification → contract ordering: a Task's criteria are
planning-level intent, and the approved specification is the execution
authority a contract will later be derived from. Neither is derived from the
other, and this decision does not change the Task model.

## Lifecycle

`DRAFT`, `APPROVED`, `REJECTED`, `SUPERSEDED` — the same four-state vocabulary
already used by `DecisionStatus` and `DocumentApprovalStatus`, kept a separate
enum so the specification lifecycle can evolve later without silently
redefining either of them.

```
DRAFT     → APPROVED   (only when deterministic validation returns VALID)
DRAFT     → REJECTED
APPROVED  → SUPERSEDED (only by an explicitly named newer APPROVED spec for the same Task)
REJECTED    terminal
SUPERSEDED  terminal
```

There is deliberately **no persisted `VALIDATED` state**, and no
`APPROVED → REJECTED` edge. Validity is a pure function of content, recomputed
on demand; persisting a verdict would let it drift away from the content it
describes — DEC-RIC-005 §5 applied to the specification layer. Retracting an
approval after the fact would rewrite the history a later Execution Contract
was derived against; a superseding specification replaces it instead, and both
rows survive.

Content is mutable only while `DRAFT`. Once a specification leaves `DRAFT` its
body is frozen permanently, and a change becomes a new version. An approval
that could be edited afterwards would be evidence of nothing.

## Approval and supersession

Approval is **explicit and attributed**: it records the approving `Operator`
and a timestamp, and it re-runs validation against the stored content inside
the transaction rather than trusting any earlier verdict.

Supersession is **explicit**: the successor names the predecessor it replaces,
and the system never chooses one. Approving a replacement therefore performs
three steps in one transaction, in this order — validate, retire the named
predecessor, install the successor — so no observer ever sees two approved
specifications for one Task.

That ordering is not merely an application convention: the partial unique index
`implementation_specs_task_approved_key` (`WHERE status = 'APPROVED'`) enforces
at most one approved specification per Task at the database level, so a later
contract generator can never face two competing authorities for one unit of
work. `implementation_specs_supersedes_key` keeps "what replaced this?"
singular, making supersession a chain rather than a tree, and
`implementation_specs_supersedes_self_check` rejects a one-element cycle.

## Traceability

Requirements and decisions are referenced by composite foreign key through
`(id, projectId)` and never copied, so no second source of truth for strategic
truth is created and a cross-project link cannot be inserted at all. Jira
traceability is inherited from the bound Task's existing external provenance —
this decision introduces no new Jira surface and authorizes no Jira API call.

Eligibility is the deterministic predicate RIC-E07A's exit criterion calls for.
It returns `ELIGIBLE`, or every applicable reason among `MISSING`,
`NOT_APPROVED`, `SUPERSEDED`, `INVALID_CONTENT` and `STALE_STRATEGIC_TRUTH` — a
specification is stale when a linked requirement is no longer `ACTIVE` or a
linked decision is no longer `APPROVED`. Like the validation verdict, it is
**computed on every call and never persisted**.

### Eligibility is computed from one consistent state

A verdict is assembled from facts in four tables: which specification governs
the Task, its traceability links, and the statuses of the requirements and
decisions those links point at. Read independently they can describe a state
that never existed — an approved specification paired with strategic truth that
was only superseded after that specification had already been retired.

Eligibility therefore runs inside a transaction holding the owning project's
row lock. That is the existing RCC concurrency pattern, not a new one: every
writer that can move any of those facts already takes the same lock — the
specification lifecycle and traceability writes in `implementation-spec.ts`,
and the requirement and decision writes in `strategic-truth.ts`. While it is
held, none of them can commit, so every fact in one verdict belongs to one
state. `withConsistentProjectReadTransaction` is the read-only counterpart of
`withMutableProjectTransaction`, sharing its single lock implementation and
differing only in that it does not apply the archived-project write rule,
because reads remain permitted for archived projects.

### The surface is shaped so authority cannot be granted on a stale verdict

Two entry points exist, and the distinction between them is the whole point:

- `resolveImplementationSpecEligibilityInTransaction(tx, …)` computes the
  verdict inside a transaction the caller already owns. **This is the gate.**
- `resolveImplementationSpecExecutionEligibility(client, …)` wraps it in a
  consistent read for display and reporting. **This is a projection**, accurate
  for the instant it committed and possibly stale by the time it is read.

An answer is only as good as the transaction it was computed in. A caller that
obtained `ELIGIBLE` from the projection and then opened a *second* transaction
to create authority would have reintroduced exactly the gap the consistent read
closes, one layer up. P0-041 must therefore call the transaction-scoped
resolver inside the same `withMutableProjectTransaction` that persists the
contract, so the check and the write commit together or not at all.

P1-038 states this predicate and provides that primitive, and stops there. It
creates no contract, and there is no contract to block yet.

## Persistence

One additive migration on top of the eight published migrations
(`20260902120000_governed_sdd_specification_lifecycle`). No published migration
is edited, renamed, squashed or regenerated.

Two PostgreSQL objects have no Prisma schema representation and are written by
hand in that migration — the partial unique index and the self-supersession
`CHECK` described above — the same situation as `operators_singleton_check` and
`task_dependencies_no_self_check`. A future `prisma migrate dev` run touching
these tables must not let the schema differ drop them as unrepresented drift.

`requirements_id_project_key` is additive only: `id` is already unique on its
own, so the new index changes no existing behaviour. It exists so a
traceability link can reference a requirement through a composite foreign key.
The pre-existing NDERCC-16 foreign-key naming drift that `prisma migrate diff`
proposes on `requirements` and `decisions` is deliberately **not** absorbed
here, exactly as the NDERCC-17 migration declined to absorb it.

There is no delete operation anywhere on the package's public surface, and no
update operation for a specification that has left `DRAFT`. History is the
point: a superseded specification must stay queryable exactly as it was
approved.

## Non-goals

Not implemented, not modelled and not anticipated by this decision: the
canonical Execution Contract schema (P0-040); immutable contract generation
(P0-041); contract completeness validation (P0-042); contract hashing and
versioning (P0-043); the Kernel Foundation Gate (P0-046 through P0-049);
`AgentRuntimePort` decisions; Claude runtime integration; Cordis; the DeepSeek
Harness; `ContextAssembler`; multi-agent orchestration; the Agent Monitor; and
any UI.

P0-049 canonical sequencing debt remains upstream canonical debt, untouched by
this decision and still to be resolved before execution of the Kernel
Foundation Gate.

## Consequences

- Specification state becomes queryable, auditable and enforceable rather than
  living in Jira prose, and the SDD identifier convention now has a home in the
  data model.
- A later Execution Contract generator has a single, deterministic precondition
  to consult, and a single approved specification per Task to derive from.
- The cost is one more governed aggregate to keep in step with the strategic
  truth it traces: a superseded requirement or a retracted decision now makes an
  otherwise valid specification ineligible, which is intended — it forces a
  revision rather than a silent execution against stale truth.
- Approving a replacement is deliberately less convenient than editing an
  approved specification would be. That inconvenience is the guarantee.
