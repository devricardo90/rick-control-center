# DEC-RIC-007 — Deterministic readiness diagnostics

Status: APPROVED and ACTIVE for NDERCC-19
Authority: Jira comments 12234, 12239, 12240, 12241, 12242, 12243 and 12244
Contract: `RIC-EC-NDERCC-S2-04-001 v1.0.0`
Diagnostics version: `P0_032_V1`

## Decision

Readiness diagnostics are a computed, pure, project-scoped and read-only
projection over the normalized state already consumed by the P0-031 next-work
resolver. The resolver continues to expose exactly `SELECTED` and
`NO_ELIGIBLE_WORK`; both results carry the deterministic P0-032 diagnostics
version and ordered diagnostic array.

All v1 diagnostic codes have severity `ERROR`:

1. `INVALID_PROJECT_STATE`
2. `MISSING_REQUIRED_INPUT`
3. `AMBIGUOUS_CANDIDATE_ORDERING`
4. `BLOCKED_DEPENDENCY`
5. `STALE_OR_UNAPPROVED_TRUTH`
6. `STRATEGIC_CONFLICT`

Strategic conflict is structural only. The only recognized rules are
`DUPLICATE_DECISION_CODE`, `MULTIPLE_APPROVED_SUCCESSORS`,
`ACTIVE_PREDECESSOR_AND_SUCCESSOR` and `SUPERSESSION_CYCLE`. No semantic,
fuzzy, NLP, embedding or LLM interpretation is permitted.

Diagnostics contain a closed typed evidence payload, a sanitized subject and
related subjects, a deterministic message and the canonical fingerprint:

```text
[P0_032_V1,code,subject.kind,subject.id,evidenceKey,[[relatedKind,relatedId],...]]
```

Related subjects are de-duplicated and sorted by the frozen subject-kind and
JavaScript code-unit lexical ordering. Diagnostics use the frozen severity,
subject-kind, subject-id, code, evidence-key and related-subject ordering.

An error blocks only its applicable project, Sprint, Epic, Task or explicitly
referenced strategic fact scope. An unrelated diagnostic never contaminates an
independent safe candidate. Missing evidence is reported rather than inferred.

## Persistence and security boundary

The evaluator and resolver perform no database or external mutation and make
no provider calls. No readiness or diagnostic state is persisted. The existing
Decision read projection is extended only with already persisted `code`,
`chosenDecision` and `supersedesDecisionId` fields. The eight published Prisma
migrations, schema, dependencies and lockfile remain unchanged.

No lifecycle status (`READY`, `BLOCKED`, `AMBIGUOUS` or `CONFLICT`) is added.
No automatic conflict resolution, Jira synchronization, Risk Engine, SDD or
Execution Contract Engine, Kernel, Runtime, events, SSE or UI work is included.

## Delivery boundary

Implementation is limited to the activated NDERCC-19 contract and the
authorized domain/database, tests, exports and this decision record. Delivery
requires the full repository gates, one scoped commit, one Draft PR targeting
`main`, green CI on the exact head, sanitized Jira evidence and transition of
NDERCC-19 from `Fazendo` to `Em análise`. Merge and post-merge governance stay
with independent control.
