# NDERCC-20 — Sprint 2 Integrated Exit Audit Evidence

## Authority and verified candidate

- Audit date: 2026-08-23
- Contract: `RIC-EC-NDERCC-S2-05-001` version `1.0.1`
- Human-readable amendment: Jira comment `12391`
- Canonical machine envelope: Jira comment `12392`
- Reproduced canonical SHA-256: `037d3ecf2bf18549213af65f144232cd57497da43f3467dddcd06a45d1b9fa22`
- Repository: `devricardo90/rick-control-center`
- Authorized baseline: `2573db5387dacbba32a7c5c0fe5689dbf4039b7c`
- `origin/main` and the fresh audit worktree both matched the authorized baseline before the tracked write.
- Execution branch: `chore/NDERCC-20-sprint-2-exit-evidence-v2`
- Historical blocked baseline preserved separately: `2315d1c9ffa68b8c21a4a3e99eaef0e2abdf2038`
- Authorized tracked path: `docs/evidence/NDERCC-20-sprint-2-exit-evidence.md` only.
- No product, test, schema, migration, dependency, lockfile, workflow or unrelated configuration change was made.

The final evidence commit SHA and Draft PR head SHA are recorded in the delivery Jira comment and PR metadata after this one-time evidence commit. The file is intentionally evidence-only; no second tracked commit is permitted to make a commit hash self-referential.

## Preconditions

| Check | Result | Evidence |
| --- | --- | --- |
| Fresh worktree from exact authorized baseline | PASS | New worktree `.worktrees/ndercc20-v2`, branch exact, HEAD `2573db5387dacbba32a7c5c0fe5689dbf4039b7c`. The historical `.worktrees/ndercc20` was not reused, rebased, reset or overwritten. |
| `main` / `origin/main` baseline | PASS | `origin/main` was fetched and matched the authorized SHA before the worktree was created. |
| Working tree before tracked write | PASS | Clean branch status; no tracked changes. |
| Jira dependency state | PASS | NDERCC-16/17/18/19/31/32 were `Feito`; NDERCC-15 and NDERCC-20 were `Fazendo`. |
| Permanent RCC PostgreSQL | PASS | Existing Docker PostgreSQL container remained healthy on `127.0.0.1:5455`. It was not stopped or altered. |
| Docker availability | PASS | Docker Desktop daemon and PostgreSQL 16 disposable fixture were available. |
| Migration inventory | PASS | Exactly eight directories under `packages/database/prisma/migrations`. |
| `DATABASE_URL` precondition | PASS | No process, user or machine `DATABASE_URL` override was present before the audit. Database commands used only a process-local disposable URL and verified it was absent afterward. |
| Canonical contract hash | PASS | The exact one-line canonical envelope from Jira comment `12392` reproduced SHA-256 `037d3ecf2bf18549213af65f144232cd57497da43f3467dddcd06a45d1b9fa22`. |

## Clean deployment proof

A fresh disposable PostgreSQL 16 container was bound only for the audit at `127.0.0.1:5545`, with no named volume. `pnpm db:migrate:deploy` reported eight migrations found and applied successfully. Direct verification of `_prisma_migrations` returned eight completed, non-rolled-back rows:

1. `20260731042518_init`
2. `20260731111843_initial_domain_model`
3. `20260731140025_single_user_authentication`
4. `20260805120000_github_integration_configuration`
5. `20260806151658_document_source_foundation`
6. `20260809140518_document_snapshot_immutable_history`
7. `20260811120000_strategic_truth_extraction`
8. `20260813120000_operational_backlog_model`

The disposable container was removed after migration and test collection. The permanent RCC database and unrelated containers were left unchanged.

## Repository gates

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS — all 7 workspace projects; lockfile current. |
| `pnpm db:generate` | PASS — Prisma Client 7.9.1 generated using the disposable process-local database URL. |
| `pnpm db:migrate:deploy` | PASS — fresh database, all 8 migrations applied. |
| `pnpm lint` | PASS — 0 errors; 2 pre-existing warnings in unchanged database tests. |
| `pnpm typecheck` | PASS — all 6 participating workspace packages. |
| `pnpm test` | PASS — 43 test files and 739 tests. |
| `pnpm build` | PASS — Nuxt client, server and Nitro production output. |
| `pnpm quality:forbidden-patterns` | PASS — no violations. |
| `pnpm quality:review` | PASS — typecheck and forbidden-pattern scan passed. |
| `git diff --check` | PASS before and after evidence authoring. |

Focused integrated suites passed in 8 files with 296 tests. The independent targeted adversarial pass passed 27 tests; the filtered run skipped unrelated tests by design. No gate required a source change or configuration workaround.

## Integrated Sprint 2 proof

| Required proof | Evidence | Result |
| --- | --- | --- |
| Immutable approved snapshot to strategic truth | Snapshot, approval, checksum and extraction tests persisted project-owned requirements, decisions and constraints. | PASS |
| Requirement / Decision / Constraint provenance | Persisted facts retained project, source, snapshot, extractor and canonical identity provenance. | PASS |
| Repeat extraction idempotency | Reprocessing the same immutable snapshot reused existing facts without duplicate identity or provenance drift. | PASS |
| New snapshot reconciliation | A later immutable snapshot appended history and reconciled affected facts without overwriting prior snapshot provenance. | PASS |
| Project-owned Sprint / Epic / Task composition | Hierarchy ownership, parentage, lifecycle, sequence, code, priority and external identity constraints passed. | PASS |
| Project-owned dependencies | Same-project cross-Sprint/cross-Epic prerequisites were allowed; cross-project prerequisites and malformed ownership were rejected. | PASS |
| Known-ready deterministic selection | Valid active Project A fixture returned exactly one `SELECTED` task with stable ranking and sanitized evidence. | PASS |
| Priority perturbations | P0, P1, P2 and P3 ranking changes selected the higher-priority eligible task deterministically. | PASS |
| Dependency perturbations | TODO, IN_PROGRESS, IN_REVIEW and CANCELLED prerequisites blocked; DONE prerequisites enabled, including same-project cross-Sprint DONE. | PASS |
| Lifecycle perturbations | Only TODO tasks in an ACTIVE sprint and valid ACTIVE epic context were eligible; non-active and terminal states were excluded. | PASS |
| Explicit no-work result | Empty, unsafe, blocked and structurally ambiguous inputs returned explicit `NO_ELIGIBLE_WORK`. | PASS |
| P0_032_V1 blocked/ambiguous/stale/unapproved/conflict diagnostics | Missing input, duplicate ordering, unsatisfied prerequisites, stale/unapproved provenance and structured strategic conflicts produced deterministic `ERROR` diagnostics. | PASS |
| Candidate-scoped blocking | An applicable error blocked only its governed candidate while unrelated safe work remained selectable. | PASS |
| Structural conflict coverage | Duplicate task identity, parentage, sequence/code, Sprint sequence and conflicting structured decisions were fail-closed; prose disagreement alone was not treated as conflict. | PASS |
| Deterministic perturbation | Collection reordering and timestamp perturbations preserved resolver and diagnostic output. | PASS |
| Two-project isolation | Snapshot, extracted truth, backlog, dependencies, resolver identity lookup and diagnostics remained project-scoped. | PASS |

## NDERCC-31 regression proof

`packages/domain/src/strategic-truth.test.ts` passed the amended test `canonicalizes a timezone-less decision date as UTC under multiple host timezones`. The same timezone-less decision date produced identical canonical UTC output under `UTC`, `Europe/Berlin` and `America/Los_Angeles`. The explicit-offset cases also passed for `Z`, `+02:00`, `-0730` and legacy named offsets, preserving their stated meaning. Invalid dates continued to produce the existing typed blocking diagnostic.

Result: **PASS**.

## NDERCC-32 regression proof

The focused and full suites passed the following adversarial branches:

- `keeps Project A selected when Project B reuses its task identity`;
- `ignores a foreign dependency row for a target task identity`;
- `fails closed for a dependency row with malformed ownership`;
- `resolves a prerequisite identity within the target project`;
- `isolates foreign task identity and dependency rows from structural diagnostics`;
- same-project duplicate identity and conflicting parentage remain fail-closed;
- duplicate Task sequence, Task code and Sprint sequence remain structural `ERROR` conditions;
- an invalid candidate does not contaminate an unrelated valid candidate.

Project B task IDs and foreign dependency rows no longer influence Project A selection, eligibility or diagnostics. Same-project duplicate identity behavior remains fail-closed according to the existing resolver semantics.

Result: **PASS**.

## Security, non-leakage and provider-mutation controls

- The audit used local deterministic extraction/resolver functions, existing tests and disposable PostgreSQL only.
- Jira contract and state reads were read-only. No Google, Jira, GitHub or other provider mutation was performed during the audit.
- No commit, push, PR creation, CI trigger or Jira transition occurred before all local proof passed.
- Resolver and snapshot outputs expose sanitized identifiers and provenance only; document content and credential-shaped metadata remain excluded.
- High-confidence credential-shaped-value scanning and the final diff review found no password-bearing URL, provider token, bearer credential, private-key block or raw provider payload.
- No product-path network/provider mutation or log-write primitive was exercised by the integrated audit scenarios.
- Disposable credentials and the disposable PostgreSQL container were removed after use.

Result: **PASS**.

## Independent adversarial QA

A separate review pass inspected the resolver, strategic extraction, diagnostic and persisted-composition paths and ran the targeted adversarial suite. It passed 27 targeted tests covering:

- timezone-less and explicit-offset decision dates;
- Project A / Project B colliding identities;
- foreign and malformed dependency ownership;
- same-project prerequisite resolution;
- P0_032_V1 missing-input, duplicate-ordering, prerequisite, provenance and conflict diagnostics;
- candidate-scoped blocking and unrelated-safe-candidate isolation;
- deterministic ordering and structural-conflict branches.

No HIGH or CRITICAL finding, material defect, migration failure, isolation failure or required production remediation was found.

Independent QA result: **PASS**.

## NDERCC-15 Sprint 2 exit criteria

| Exit criterion | Evidence | Result |
| --- | --- | --- |
| Approved snapshots become structured, project-owned requirement/decision/constraint truth with provenance | Snapshot-to-extraction and provenance integration tests | PASS |
| Extracted truth is deterministic and duplicate-safe on repeat immutable-snapshot processing | 296 focused integrated tests plus NDERCC-31 timezone/idempotency regression | PASS |
| Epics, backlog items, priorities and dependencies preserve ownership and source provenance | Backlog, dependency, hierarchy and database invariant suites | PASS |
| Resolver returns one deterministic executable item or explicit non-ready result | Known-ready, perturbation and `NO_ELIGIBLE_WORK` scenarios | PASS |
| Blocked, ambiguous and conflicting work is surfaced as evidence | P0_032_V1 diagnostics and structural-conflict branches | PASS |
| Cross-project IDs and source data remain isolated | Persisted and pure resolver NDERCC-32 adversarial regressions | PASS |
| Stale or unapproved truth cannot silently become executable work | Candidate-scoped stale, approval, revision, checksum and snapshot-currentness tests | PASS |
| Mandatory migrations, repository gates and tests pass | Eight fresh migrations; all gates and 739 tests green | PASS |
| Integrated evidence is published and Jira synchronized | This evidence file is the only authorized tracked output; delivery metadata is recorded after commit | PASS pending delivery actions |
| No unresolved HIGH or CRITICAL risk remains | Independent adversarial QA found none | PASS |

## Delivery record

- AUDIT_STATUS: **PASS**
- Authorized tracked change: this evidence file only.
- Evidence-only commit: to be recorded as the exact branch head after the single commit.
- Draft PR: to be opened against `main` after push; no merge authorized.
- Exact-head CI: required green before Jira synchronization.
- Jira execution evidence: sanitized comment to be added to NDERCC-20 after exact-head CI passes.
- Final Jira transition: NDERCC-20 `Fazendo` → `Em análise` only.
- NDERCC-15 remains `Fazendo`; NDERCC-20 is not marked `Feito`; Sprint 3 is not started.
