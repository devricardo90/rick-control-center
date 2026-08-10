# NDERCC-14 / RIC-S1-05 — Sprint 1 exit evidence

**Contract:** `RIC-EC-NDERCC-S1-05-001` (v1.0.0, ACTIVE)
**Mode:** `CONTROLLED_AUTONOMOUS — audit/evidence only`
**Audit date:** 2026-08-10 (Europe/Berlin)
**Repository:** `devricardo90/rick-control-center`
**Authorized branch:** `chore/NDERCC-14-sprint1-exit-evidence`
**Authorized baseline:** `bb9e42cd9b59730065cb5c30c24b519687cfc130`

This document is the only tracked change authorized by the contract. It records an exit audit of the already delivered Sprint 1 implementation; it does not add product behavior, alter migrations, or claim Project State Resolver work.

## 1. Contract, source, and Jira snapshot

The contract was read from Jira NDERCC-14 before any tracked write. Activation evidence is comment `11731`. Jira remains the operational source of truth; Google Docs remains strategic truth; GitHub is implementation truth.

Frozen strategic sources from the contract:

| Source | Google Doc ID | Frozen provider revision |
|---|---|---|
| RIC-004 Roadmap | `1E2ViGWhRfOYb6j25vjAJ9qDYMmyNI06PCR9GIynV3zw` | `AIroW36ue73dSlTbMYypPwwM9frDWPJCDIn27FHC-4_7kXMsqjtChzIlbVoPoXr3j1mnJkkEKCw8catVROgBhEUywkhLBYOM9SM5BAL0Awk` |
| RIC-010 Backlog | `1WKBljGVrs-EXMvYY0SaeGIQynYrT1JxZap7vSf8Kal0` | `AIroW35iJBSDabzNbvScZRXOcPGzeAYeDatq_3XD0hAHwxu3_0Vo1FZDsd0hNtMOX7-CyvoYD3rA7kOmfOM0b0RPlq3o-M9m_oIK2WuhIHc` |
| RIC-011 Execution Contract Specification | `1FaWqGK6IDxx0kzAurULhznBmhGaKHmxrUDNoSS65YYc` | `AIroW355Yqr3yoOTy6PutbCEk9au-oZx0vaprEJQtXkx0MrPA7l09yz-jGjbZfd1PQgf7n7MG7vQ7NaI9sH4wkpjJ_wRC1CXfyRXFf9O5m0` |
| RIC-012 Development Protocol | `1iI5T5wKLuqRinGSONM3DCMNDMB-wKo36YsLEvH9TMBI` | `AIroW34DLo2YYfiFW3ya33hRPh3hvzblz-jjjnv6xTISwt-D6bxmZRXgWzBASt2LjNFfLnIjq4tk9tpBFaiGCxxjbDfILBYmXk3-3GX5FuM` |

The contract snapshot states that GitHub `main` is the reviewed NDERCC-13 integration state at the authorized baseline after integrated CI #56 success. No material source/Jira/Git contradiction was found.

Jira child state at audit start:

| Issue | Summary | Status | Delivery/control evidence |
|---|---|---|---|
| NDERCC-9 | Sprint 1 — Project Control Plane | `Fazendo` | Parent remains open for independent exit decision |
| NDERCC-10 | Complete project settings and lifecycle | `Feito` | Reviewed commit `ea66a0119b06344aa7951acc59b9ddc0ab1a2fd3`; CI later confirmed success |
| NDERCC-11 | Connect and verify GitHub repository | `Feito` | Corrective head `711ed1278b8ab10f0e28dbbc4c48c20b2cd69ccd`; CI confirmed success |
| NDERCC-12 | Add strategic document source foundations | `Feito` | Corrective head `680df4d3ac02fc81de75acc3c27570140ed6d886`; CI confirmed success |
| NDERCC-13 | Register and snapshot approved Google Docs | `Feito` | Final integrated main `bb9e42cd9b59730065cb5c30c24b519687cfc130`; CI #55/#56 success recorded by control |
| NDERCC-14 | Sprint 1 integration and exit evidence | `Fazendo` | This audit; executor must not transition it |

## 2. Recovery and Git baseline audit

The original operator worktree was not switched, reset, cleaned, or overwritten.

| Check | Result |
|---|---|
| Remote repository | `https://github.com/devricardo90/rick-control-center.git` (`devricardo90/rick-control-center`) |
| Remote fetch | PASS; `origin/main` fetched and rechecked |
| `origin/main` | exactly `bb9e42cd9b59730065cb5c30c24b519687cfc130` |
| Operator worktree branch | `feat/NDERCC-13-google-doc-snapshots` (left untouched) |
| Operator worktree HEAD | `8a597edeb0aa2b11cedff1efd1c60f31140ce31f` |
| Pre-existing local state | one untracked `.claude/settings.local.json`; preserved untouched |
| Pre-existing stash | `stash@{0}: WIP on feat/skills-rick-code-quality-review: 354840e ...`; preserved untouched |
| Audit worktree | fresh, clean worktree at the exact baseline on the authorized branch |
| Docker | available (server 29.6.2) |
| Validation PostgreSQL | existing `rick_ndercc13_pg`, running and accepting on host port 5443; no blind recreation |
| Google credential handle | absent from the shell environment; approved `$HOME\\.secrets\\rick-google-drive.json` present and loaded only into smoke-server process memory; value never printed |
| GitHub credential | no `GITHUB_TOKEN` required or used for the public-read smoke |

## 3. Clean-checkout reproducibility and migrations

WU-2 ran in the disposable worktree `C:\Users\RICARD~1\AppData\Local\Temp\ndercc14-sprint1-exit-audit`.

- `pnpm install --frozen-lockfile` — **PASS** (lockfile up to date; 7 workspace projects installed).
- `pnpm db:generate` — **PASS** (Prisma Client 7.9.1 generated).
- `pnpm db:migrate:deploy` on a new disposable database — **PASS**.
- Six published migrations applied, without editing migration history:
  `20260731042518_init`, `20260731111843_initial_domain_model`,
  `20260731140025_single_user_authentication`,
  `20260805120000_github_integration_configuration`,
  `20260806151658_document_source_foundation`, and
  `20260809140518_document_snapshot_immutable_history`.
- `pnpm build` prerequisites were satisfied; the built node-server started on disposable port 3912 with only the documented database/credential handles.

## 4. Repository validation gates

All commands were run against the exact baseline in the clean audit worktree. The evidence-only candidate contains no TypeScript/Vue/configuration/schema/dependency changes.

| Gate | Result and captured evidence |
|---|---|
| `pnpm lint` | **PASS**, 0 errors. Two existing warnings remain in untouched database tests (`integration-connection.test.ts`, `project.test.ts`); no warning was introduced by this evidence file. |
| `pnpm typecheck` | **PASS** for all six checked workspace projects. |
| `pnpm test` | **PASS**, 35 test files / **469 tests passed**. |
| `pnpm build` | **PASS**, Nuxt/Nitro production build completed. Only dependency deprecation warnings were emitted. |
| `pnpm quality:forbidden-patterns` | **PASS**, no violations. |
| `pnpm quality:review` | **PASS** (typecheck + forbidden-pattern scan). |
| `git diff --check` | **PASS** on the evidence candidate. |
| `/rick-code-quality` | **COMPLIANT** for this evidence-only candidate: no TS/Vue file is changed; all four required gates are green and no prohibited pattern is present in the candidate diff. A baseline-only scan found 6 legacy `: any` matches, 0 `as any`, 0 `@ts-ignore`, and 0 empty catches; none is in the authorized diff. |
| `/rick-code-review` | **APPROVED**: the only candidate file is this Markdown evidence document; no implementation, architecture, dependency, or test scope is changed; required scans and gates are green. |

## 5. Integrated runtime acceptance smoke (WU-4)

The built application ran against disposable database `ndercc14_smoke_20260810` in the verified PostgreSQL container on port 5443 and disposable HTTP port 3912. The approved RICK PRD Google Doc was accessed through the server-side service-account reader. No Google Drive/Docs or GitHub repository write was issued.

| Contracted behavior | Result |
|---|---|
| Protected unauthenticated route | `GET /api/projects` returned 401 |
| Operator login | POST login succeeded and issued the normal HTTP-only session cookie; no provider credential entered the request |
| ACTIVE project create/select | PASS |
| Settings edit and reload persistence | PASS for name, description, autonomy policy, branch policy, and workspace path |
| Pause/reactivate | PASS: `ACTIVE → PAUSED → ACTIVE` |
| GitHub public repository connection | PASS for `devricardo90/rick-control-center`; canonical repository identity/default branch and CONNECTED health persisted |
| GitHub re-verification | PASS; repeated connect/reverify reused the same project-scoped row |
| Approved RICK PRD registration | PASS through the Google read boundary (`documentType=PRD`) |
| Google metadata/export/normalization | PASS; normalized UTF-8 snapshot checksum is self-consistent |
| Google provider provenance | **Provider version 23**, normalized byte count **44,799**, SHA-256 **`a1803021ae05abf4873352fc09b95568791c29cbc7f411c84c4a680507fe107a`**; matches the previously stable source |
| Immutable snapshot | PASS; snapshot GET returned content only from the dedicated snapshot endpoint |
| Process reload | PASS; settings, source, snapshot, and GitHub state survived server restart |
| Unchanged Google re-sync | PASS; returned `snapshotCreated=false` and reused the existing snapshot row |
| Injected Google failure | PASS; invalid credential handle returned 503, set source `ERROR`, and preserved prior revision/checksum/last-success timestamp/snapshot; valid restart recovered with duplicate-safe sync |
| Injected GitHub failure | PASS; invalid disposable token returned 503, set connection `ERROR`, and preserved prior configuration/lastVerifiedAt; valid restart recovered the same row |
| Logical archive | PASS; project became `ARCHIVED`; the database row had a non-null `archived_at` |
| Archived read-only behavior | PASS; settings/lifecycle/integration/document mutations returned 409, while document/source/snapshot reads remained 200 |

The public project DTO intentionally omits `archivedAt`; the timestamp assertion above was made against the disposable database, while the API assertion used the public `ARCHIVED` state and documented 409/200 behavior.

## 6. Project-isolation audit (WU-5)

A second ACTIVE project used the same public GitHub repository and approved Google Doc. It received independent project-scoped GitHub, DocumentSource, and DocumentSnapshot rows. Updating project B did not change project A.

- Project data/settings remained independent after project B edits; an unknown project returned 404.
- GitHub connection rows were distinct; verifying project A's connection under project B (and vice versa) returned 404.
- Each project had its own DocumentSource and immutable snapshot; cross-project snapshot reads and sync attempts returned 404 in both directions.
- Disposable database aggregate after the smoke: 2 projects, 2 GitHub connections, 2 document sources, and 2 snapshots.

## 7. Secret and provenance audit (WU-6)

All checks were sanitized and returned counts/booleans only; no credential value, private key, JWT, Authorization header, or raw provider response was printed.

- The exact approved service-account JSON had 0 matches in tracked files and production build output.
- Runtime logs from all valid/invalid smoke restarts had 0 exact Google-secret matches, 0 private-key blocks/fields, 0 disposable GitHub-token matches, and 0 Bearer-header matches.
- Public DTO checks found no `token`, `credential`, `privateKey`, `authorization`, `passwordHash`, `configurationEncrypted`, or JWT-shaped field. The only body-content exception is the approved document text itself, returned solely by the snapshot endpoint.
- PostgreSQL aggregate checks: `configuration_encrypted` non-null rows = 0; GitHub credential-pattern hits in encrypted/configuration JSON = 0; document metadata credential-pattern hits = 0; plaintext operator-password-pattern hits = 0.
- Snapshot provenance is limited to normalized content, provider version, checksum, byte length, provider timestamp, and read-attempt metadata; raw provider payloads and credentials are not stored.

## 8. Read-only provider scans

- Google production adapter scan: the only network request method is `GET`; the scope is `https://www.googleapis.com/auth/drive.readonly`; metadata/export endpoints are read-only. Existing adapter tests also assert GET-only behavior.
- GitHub production adapter scan: the only network request method is `GET` against the fixed public API origin. Product routes have no GitHub write operation.
- No Google or GitHub provider content was mutated by this audit. The only remote writes authorized by this contract are the Git branch push and this Jira evidence comment.

## 9. NDERCC-9 exit-criteria matrix (WU-7)

| Exit criterion | Evidence | Result |
|---|---|---|
| Projects can be edited and logically archived without destructive deletion | Settings/lifecycle smoke; `ARCHIVED` plus non-null `archived_at`; mutation blocked | **PASS** |
| Autonomy, branch, and workspace settings are manageable | PATCH + reload smoke for all three settings | **PASS** |
| GitHub repository connects through a normalized adapter and verifies | Public-read connect, canonical metadata, idempotent reverify, failure preservation | **PASS** |
| Approved Google Docs register and snapshot with provenance/revision/checksum | Registration, metadata/export/normalize, version 23, checksum, immutable snapshot and duplicate-safe sync | **PASS** |
| Secrets never appear in plaintext, logs, or public responses | Static/build/log/API/DB scans above | **PASS** |
| Project isolation remains enforced | Two-project independent rows and bidirectional cross-ID 404 probes | **PASS** |
| Repository gates and CI pass | Local gates above; baseline `main` CI #56 success recorded in the contract | **PASS** (final branch CI remains a delivery handoff gate) |
| Evidence is registered and Jira synchronized | This file is the authorized artifact; sanitized NDERCC-14 comment follows delivery | **PASS** after publication |
| No unresolved critical/high risk remains | No product defect or critical/high audit finding discovered | **PASS** |

## 10. Mapping to RIC-010 Sprint 1 items

| Sprint 1 item | Delivered child / audit proof | Result |
|---|---|---|
| P0-010 | Sprint 0 single-operator installation/project foundation; login and ACTIVE project flow revalidated here | **PASS / already satisfied** |
| P0-011 | NDERCC-10 settings and lifecycle; edit, pause, reactivate, archive, archived read-only smoke | **PASS** |
| P0-012 | NDERCC-11 GitHub public-read adapter, canonical connection, idempotent verification and failure preservation | **PASS** |
| P0-020 | NDERCC-12 DocumentSource foundation, six-migration chain, project-scoped persistence and error-state preservation | **PASS** |
| P0-021 | NDERCC-13 approved Google Doc registration, normalization, immutable snapshots, provenance/checksum, duplicate safety and failure preservation | **PASS** |

This audit does **not** claim that requirement extraction, decision extraction, conflict resolution, or the broader Project State Resolver is implemented. Those remain outside NDERCC-14 and are handoff work for a later controlled phase.

## 11. Limitations and residual risk

- The live Google smoke depends on the approved service-account handle and the strategic document remaining shared read-only; the secret is an operational prerequisite and is never committed or persisted.
- GitHub coverage is public-read only and intentionally does not exercise private-repository credentials; no `GITHUB_TOKEN` was needed.
- The observed RICK PRD source remains provider version 23 / 44,799 bytes / checksum above. If the strategic source changes later, a new evidence run must record the new provider provenance rather than forcing these values.
- Two pre-existing lint warnings and six baseline-only `: any` scan matches were not modified under this evidence-only task and do not belong to this candidate diff.
- Runtime databases, logs, and the temporary worktree are disposable audit state, not production data.
- Final branch CI, Draft PR review, merge, NDERCC-14 completion, and the NDERCC-9 Sprint 1 exit decision remain independent-control responsibilities.

## 12. Sprint 1 exit recommendation and handoff

**Sprint 1 exit recommendation: PASS**, subject to the final pushed evidence commit's CI check remaining green and independent control review.

Handoff boundary:

1. Independent control reviews this evidence-only commit and final branch CI.
2. Independent control creates/reviews the Draft PR, merges if satisfied, and decides whether to close NDERCC-14 and NDERCC-9.
3. Requirement extraction, Project State Resolver, conflict resolution, agent runtime, and Sprint 2 implementation are not authorized by this audit.

Rollback/removal is a single normal Git revert of the evidence commit; no application, schema, migration, dependency, or provider rollback is required.
