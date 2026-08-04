# Sprint 0 — Evidence Report

**Epic:** [NDERCC-1 — Sprint 0: RICK Foundation](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-1)
**Execution Contract:** `RIC-EC-S0-001` — [`docs/execution-contracts/sprint-0-foundation.md`](execution-contracts/sprint-0-foundation.md)
**This report's own commit candidate:** NDERCC-8, baseline `a2ded0a13a675ea5bea47b60e5d515a4bd21954e`
**Compiled from:** GitHub commit/PR history and Jira issue/comment history, both re-verified live while writing this report.

> **Path note:** this report lives at `docs/sprint-0-evidence.md`, not the
> `docs/evidence/sprint-0-evidence.md` path suggested by NDERCC-8's
> Execution Contract. `.gitignore` already contains an `evidence/` rule for
> large local runtime-evidence artifacts (a separate, pre-existing
> decision), which matches — and would silently exclude from Git — *any*
> directory literally named `evidence` anywhere in the tree, including
> under `docs/`. Editing `.gitignore` is outside this task's authorized
> scope (`docs/**` plus documentational `.env.example` corrections only),
> so this document was placed at the repository-root `docs/` level instead,
> keeping the same filename. See `docs/README.md` for the current index.

## 1. Objective and scope

Sprint 0 builds the executable technical foundation of RICK Control Center:
a Nuxt 3 + TypeScript application with PostgreSQL/Prisma persistence, a
single-operator authentication system, an initial `Project` domain model
with a minimal authenticated interface, automated quality gates and CI,
and the governance templates/documentation needed to hand the codebase to
the next phase of work. Full scope and exclusions are recorded in
`RIC-EC-S0-001`.

## 2. Tasks NDERCC-2 through NDERCC-8

| Task | Contract mapping | Summary | Jira status (at time of writing) | Delivery mechanism |
|---|---|---|---|---|
| [NDERCC-2](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-2) | RIC-S0-01 | Repository and application foundation | Feito | **PR** — #2 (merge `eee7717`), plus #1 (merge `77760cf`, TypeScript/ESLint hardening) and #3 (merge `373714f`, Rick quality skills) |
| [NDERCC-3](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-3) | RIC-S0-02 | Quality gates and CI | Feito | **PR** — delivered inside the same #1/#3 PRs as NDERCC-2 (evidence: Jira comment on NDERCC-3 citing final `main` state `77760cf`); no separate NDERCC-3-labeled commit exists in Git history |
| [NDERCC-4](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-4) | RIC-S0-03 | PostgreSQL and Prisma foundation | Feito | **PR** — #4 (merge `e177605`; commit `bb60c6a`) |
| [NDERCC-5](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-5) | RIC-S0-04 | Initial domain and persistence model (`Project`, `IntegrationConnection`) | Feito | **PR** — #5 (merge `6d533e2`; commit `9edc9b7`) |
| [NDERCC-6](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-6) | RIC-S0-05 | Single-user authentication (`Operator`, `AuthSession`) | Feito | **PR** — #6 (merge `4670d14`; commits `c71c9f4`, `1d750bb`, `7cf92ae` — the latter two are review-requested fixes made to the same unmerged PR before merge) |
| [NDERCC-7](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-7) | RIC-S0-06 | Minimal authenticated project interface (list/create/select) | Feito | **Direct commit to `main`** — `a2ded0a`, explicitly authorized (no branch, no PR) |
| [NDERCC-8](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-8) | RIC-S0-07 | Governance templates and developer handoff (this task) | Fazendo | **Direct commit to `main`**, explicitly authorized — this report is part of that commit |

**Historical accuracy note:** NDERCC-2 through NDERCC-6 were delivered
through reviewed pull requests, each merged into `main` after CI passed.
NDERCC-7 and NDERCC-8 were delivered through explicitly authorized direct
commits to `main` under their own Execution Contracts
(`RIC-EC-NDERCC-7-001`, `RIC-EC-NDERCC-8-001`) — this is a real change in
delivery policy for those two tasks specifically, not a retroactive
reinterpretation of how the earlier tasks shipped. Each row above states
its actual mechanism; none has been rewritten to match the others.

## 3. Delivered capabilities

- **Monorepo foundation** (NDERCC-2/3): pnpm workspace, Nuxt 3 + Vue 3 +
  strict TypeScript, ESLint 9 flat config, Vitest, CI (lint → typecheck →
  test → build), and the repository's own `/rick-code-quality` /
  `/rick-code-review` quality skills.
- **Persistence foundation** (NDERCC-4): PostgreSQL 16 via Docker Compose,
  Prisma 7 with the `@prisma/adapter-pg` driver adapter, reproducible
  migration workflow.
- **Domain model** (NDERCC-5): `Project` (root isolation aggregate) and
  `IntegrationConnection` (project-owned, providers `GITHUB` / `JIRA` /
  `GOOGLE_DRIVE` / `AGENT_RUNTIME`), with a typed, framework-independent
  persistence surface.
- **Authentication** (NDERCC-6): single primary operator per installation,
  Argon2id password hashing, opaque random session tokens stored server-side
  only as a SHA-256 digest, `HttpOnly`/`SameSite=Lax` cookie, 24-hour
  absolute session expiry, server-side route/API protection.
- **Minimal project interface** (NDERCC-7): authenticated list/create of
  projects with loading/empty/populated/validation-error/server-error
  states, immediate list update after creation, click-to-select with a
  visible selected-project indicator.
- **Governance and handoff** (NDERCC-8, this task): ADR template, Execution
  Contract template, canonical local-development guide, this evidence
  report, and the developer handoff document.

## 4. Final architecture baseline

Modular-monolith monorepo, per `docs/03-technical-architecture.md`:

```
apps/web              — Nuxt 3 application (pages, server API routes, middleware)
packages/database      — Prisma schema, migrations, typed persistence surface (@rick/database)
packages/domain        — domain layer (stub — Sprint 0 introduces no entities here beyond @rick/database's own models)
packages/application   — application layer (stub — no use cases yet)
packages/shared         — Result type, branded IDs, shared constants
```

`apps/web` server routes import `@rick/database` directly (the established
pattern since NDERCC-6/7); `@rick/domain` and `@rick/application` remain
stubs pending the next phase of work, per the dependency direction fixed in
`CLAUDE.md` (`@rick/shared → @rick/domain → @rick/application → apps/web`).

## 5. Migrations and database status

3 versioned migrations exist under `packages/database/prisma/migrations/`,
all additive, none rewritten after merge:

1. `20260731042518_init` — NDERCC-4 health-check proof-of-pipeline table.
2. `20260731111843_initial_domain_model` — NDERCC-5; drops the NDERCC-4
   health table, adds `projects` and `integration_connections`.
3. `20260731140025_single_user_authentication` — NDERCC-6; adds `operators`
   and `auth_sessions`, including the `operators_singleton_check` CHECK
   constraint added during PR #6 review (singleton-invariant hardening).

NDERCC-7 and NDERCC-8 introduced **no new migration** and **no schema
change** — both were explicitly excluded from their scope and re-confirmed
by running the full migration chain against a clean disposable PostgreSQL
16 container during each task's validation.

## 6. Authentication policy (final state)

See `packages/database/README.md` for full detail. Summary: one operator
per installation, provisioned only via `pnpm auth:bootstrap`; Argon2id
(`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`); session tokens are
32-byte random values, never stored raw, looked up by SHA-256 digest;
cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production;
absolute 24-hour expiry, no refresh/remember-me; changing the password
revokes every existing session atomically (hardened during PR #6 review —
see `upsertPrimaryOperatorAndRevokeSessions`).

## 7. Project-interface behavior (final state)

`GET /api/projects` and `POST /api/projects`, both behind the same
authentication middleware as every other route. Create validates `key`
(required), `name` (required), `description` (optional),
`autonomyPolicy`/`defaultBranchPolicy` (optional, enum-constrained against
Prisma's own generated enum values), `workspacePath` (optional). Duplicate
`key` → `409`; malformed body → `400`; unexpected failure → `500` with no
internal detail exposed. The `/` page (evolved from the NDERCC-2 Sprint 0
placeholder) lists persisted projects, provides a create form, and supports
click-to-select with a visible "Selected: …" indicator.

## 8. Tests

| Checkpoint | Total tests |
|---|---|
| NDERCC-2 (`63d8e41`) | 5 |
| NDERCC-6 initial delivery (`c71c9f4`) | 64 |
| NDERCC-6 after review round 1 — singleton CHECK fix (`1d750bb`) | 65 |
| NDERCC-6 after review round 2 — atomic revocation fix (`7cf92ae`) | 66 |
| NDERCC-7 (`a2ded0a`, current `main`) | 88 |

`pnpm test` runs Vitest across every workspace package; tests that depend
on database-enforced behavior (uniqueness, foreign keys, session
expiry/revocation, the singleton CHECK constraint) run as integration tests
against a real PostgreSQL instance — never mocked — both locally and in CI.

## 9. Lint, typecheck, build, and quality gates

Every task from NDERCC-2 onward required, and recorded evidence for, this
exact gate sequence before commit:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm quality:forbidden-patterns
pnpm quality:review
git diff --check
```

plus the repository's own `/rick-code-quality` (must return `COMPLIANT`)
and `/rick-code-review` (must return `APPROVED`) skills. No task in Sprint
0 was committed with a failing gate or an unresolved `NON_COMPLIANT` /
`CHANGES_REQUIRED` skill result. See each task's Jira evidence comment for
the exact recorded output.

## 10. Commit and PR history

Full `main` history relevant to Sprint 0, oldest first:

| Commit | Description |
|---|---|
| `157a2df` … `0b5fb20` | Strategic documentation RIC-001 through RIC-012 |
| `354840e` | Documentation approval baseline |
| `0a58b7a` | Sprint 0 Execution Contract (`RIC-EC-S0-001`) |
| `63d8e41`, `49c2b5b` → **PR #2** (`eee7717`) | NDERCC-2 repository foundation |
| `e451597`…`5cf1796` → **PR #1** (`77760cf`) | TypeScript/ESLint quality hardening (NDERCC-2/3) |
| `bca123f` → **PR #3** (`373714f`) | Rick quality skills (NDERCC-2/3) |
| `bb60c6a`, `d968d87`, `8782297` → **PR #4** (`e177605`) | NDERCC-4 PostgreSQL/Prisma foundation |
| `9edc9b7` → **PR #5** (`6d533e2`) | NDERCC-5 domain and persistence model |
| `c71c9f4`, `1d750bb`, `7cf92ae` → **PR #6** (`4670d14`) | NDERCC-6 single-user authentication |
| `a2ded0a` | NDERCC-7 minimal project interface — **direct to `main`** |
| *(this task's commit)* | NDERCC-8 governance templates and handoff — **direct to `main`** |

## 11. Direct-`main` deliveries

NDERCC-7 and NDERCC-8 are the only two Sprint 0 tasks delivered by direct
commit to `main` rather than through a pull request. Both were governed by
their own dedicated Execution Contract (`RIC-EC-NDERCC-7-001`,
`RIC-EC-NDERCC-8-001`) requiring: an exact pre-verified baseline SHA, a
clean working tree, single-writer confirmation, a full local gate pass
before commit, exactly one commit with a pre-specified message, and a
post-push `origin/main` re-check before the push itself. See
[`docs/handoffs/sprint-0-developer-handoff.md`](handoffs/sprint-0-developer-handoff.md)
for the general rule this pattern must follow going forward.

## 12. Known limitations and deferred scope

Explicitly excluded from Sprint 0 (see `RIC-EC-S0-001` §4 and each task's
own exclusions) and therefore **not** present in the current baseline:

- Multi-user roles, public registration, password recovery, MFA, OAuth.
- Project edit/archive/delete flows or UI.
- GitHub/Jira/Google Drive integration implementation (only the
  `IntegrationConnection` data model exists; no connector logic).
- Real agent execution (Claude Agent SDK), web terminal, workspace editor,
  Design Studio, SSE event stream, Risk Engine runtime.
- Automatic Jira/GitHub project or repository creation by the application
  itself.
- `packages/domain` and `packages/application` remain stubs.

## 13. Rollback and recovery references

- NDERCC-6 (PR #6): revert commit `c71c9f4` on its branch, or the merge
  commit `4670d14` on `main` — no migration was ever applied to a shared
  database during implementation.
- NDERCC-7: revert `a2ded0a` on `main` — additive application code only,
  no migration applied.
- NDERCC-8 (this task): revert this commit on `main` — documentation only,
  no code, schema, or dependency change.
- General recovery procedure after an interrupted execution: see
  [`docs/handoffs/sprint-0-developer-handoff.md`](handoffs/sprint-0-developer-handoff.md#9-recovery-after-an-interrupted-execution).

## 14. Jira synchronization state

Jira and GitHub connectivity are **fully operational as of this report**,
confirmed by every task from NDERCC-2 onward recording live evidence
comments and status transitions in Jira. The historical note in
`RIC-EC-S0-001` §13 — `BLOCKED — Atlassian Rovo returned HTTP 403 because
the app is not installed on the Jira instance` — describes the connector
state **at the moment that contract was first authored**, before the
Atlassian Rovo app was installed. It is preserved here and in that
document as history; it must not be read as, and is not, the current
state.

## 15. Sprint 0 exit-criteria evaluation

Per `NDERCC-1` and `RIC-EC-S0-001` §12:

| Exit criterion | Status | Evidence |
|---|---|---|
| Application starts locally from documented steps | ✅ Met | `docs/guides/local-development.md`, verified via this task's own smoke test |
| PostgreSQL starts and migrations apply reproducibly | ✅ Met | §5 above; re-verified against a clean disposable container by every task NDERCC-4 through NDERCC-8 |
| The single operator can authenticate | ✅ Met | NDERCC-6; re-verified live in NDERCC-7's and this task's smoke tests |
| A project can be created and listed | ✅ Met | NDERCC-7 |
| Lint, typecheck, tests, and build pass | ✅ Met | §9 above, current baseline re-verified for this task (§16 below) |
| CI is configured | ✅ Met | `.github/workflows/ci.yml` (NDERCC-2/3) |
| No critical or high unresolved risk remains | ✅ Met | No unresolved CRITICAL/HIGH finding across any task's `/rick-code-review` |
| Evidence is published | ✅ Met | This report, plus each task's individual Jira evidence comment |
| Commit and push follow the configured policy | ✅ Met | PR-based for NDERCC-2–6, explicitly authorized direct-`main` for NDERCC-7/8 |
| Jira is updated, or the exact connector blocker is recorded | ✅ Met | §14 above |
| No functionality outside Sprint 0 is implemented | ✅ Met | §12 above; every task's diff audit confirmed scope containment |

**All Sprint 0 exit criteria are met as of this report.** Per NDERCC-8's
Jira policy, this task and the Sprint 0 Epic (`NDERCC-1`) are **not**
transitioned to Done by this report — that decision belongs to the
independent control process referenced in
[`docs/handoffs/sprint-0-developer-handoff.md`](handoffs/sprint-0-developer-handoff.md).

## 16. Validation results for this report's own commit (NDERCC-8)

See the NDERCC-8 Jira evidence comment for the complete, timestamped gate
output. Summary: `pnpm db:generate`, migration-chain-vs-clean-database,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
`pnpm quality:forbidden-patterns`, `pnpm quality:review`,
`git diff --check`, a secret/credential scan, `/rick-code-quality`
(`COMPLIANT`), `/rick-code-review` (`APPROVED`), and a full local-guide
smoke test (database → migration → bootstrap → app → login →
project list/create) were all run against this exact commit before it was
pushed.
