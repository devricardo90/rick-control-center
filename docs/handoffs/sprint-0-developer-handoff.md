# Sprint 0 → Next Phase — Developer Handoff

**Baseline this handoff describes:** `main` at the NDERCC-8 commit (see
[`docs/sprint-0-evidence.md`](../sprint-0-evidence.md)
for the exact SHA and full Sprint 0 evidence).

This document prepares the repository for whoever — human or agent —
resolves and executes the next sprint. **It does not choose or implement
that next sprint.** Per its own Execution Contract, RIC-EC-NDERCC-8-001,
resolving the next sprint from Google Docs is explicitly reserved for the
control process that runs after this task closes.

## 1. Start here

To run the system from a clean checkout, follow
[`docs/guides/local-development.md`](../guides/local-development.md) start
to finish. Do not improvise setup steps from memory or from an older
document — that guide is the single canonical source and is verified
against the actual repository configuration.

To validate a change before committing anything, run:

```bash
pnpm validate                   # lint + typecheck + test + build
pnpm quality:forbidden-patterns
pnpm quality:review
```

and the repository's `/rick-code-quality` and `/rick-code-review` skills,
per [`CLAUDE.md`](../../CLAUDE.md).

## 2. What is implemented

- Nuxt 3 / Vue 3 / strict TypeScript monorepo, ESLint 9, Vitest, CI.
- PostgreSQL 16 + Prisma 7 persistence, 3 migrations.
- `Project` and `IntegrationConnection` domain models (data model only —
  no connector logic for any provider).
- Single-operator authentication: bootstrap CLI, Argon2id hashing, opaque
  session tokens, server-side route/API protection.
- Minimal authenticated project interface: list, create, select. No edit,
  archive, or delete.
- Governance templates (ADR, Execution Contract) and this documentation
  set.

## 3. What is not implemented (do not assume otherwise)

- No multi-user support, roles, registration, password recovery, or MFA.
- No GitHub, Jira, or Google Drive connector behavior — only the
  `IntegrationConnection` table exists, unpopulated by any real
  integration.
- No agent execution runtime, web terminal, workspace editor, Design
  Studio, or SSE event stream.
- No project edit/archive/delete API or UI.
- `packages/domain` and `packages/application` are stubs — the next phase
  is expected to be where real domain/use-case logic starts landing there,
  but that decision is not made by this document.

## 4. Authoritative source hierarchy

When sources disagree, resolve in this order, highest authority first:

1. **Google Docs** — the strategic source of truth (product vision, PRD,
   roadmap, architecture, design system, data model, backlog). RICK's own
   internal state is never authoritative over an approved Google Doc.
2. **Jira** — operational planning and status. Each task's Jira issue
   carries its own Execution Contract text and evidence trail; Jira status
   reflects what has actually been verified, not what is merely intended.
3. **GitHub** — code truth. The actual `main` history, diffs, and CI runs
   are ground truth for what shipped, independent of what any document
   *says* shipped. If a document and the Git history disagree about what
   was delivered, trust the Git history and fix the document.
4. **CI / evidence** — execution truth. A gate result, test count, or
   smoke-test outcome is only as good as the exact commit it was produced
   against; evidence from an earlier commit does not carry forward
   automatically after any change, however small.

Never resolve a conflict between these layers by guessing — stop and
surface the conflict instead (see §7).

## 5. Current domain boundaries

- Every operational entity belongs to a `Project` (root isolation
  aggregate) — this must hold for anything added later.
- `@rick/database` is the only package allowed to talk to PostgreSQL
  directly; `apps/web` server routes consume its typed surface, never
  Prisma directly.
- Domain types (`Project`, `Operator`, …) and HTTP DTOs (`PublicProject`,
  …) are kept as separate types on purpose — do not collapse them back
  together for convenience.
- External inputs (HTTP bodies, env vars) are typed `unknown` at the
  boundary and narrowed before use everywhere in this codebase — this is
  enforced by lint/typecheck, not just convention.

## 6. Known risks and technical debt

- No end-to-end/browser test exists anywhere in the repository yet
  (`@nuxt/test-utils` full server-boot tests were deliberately deferred in
  both NDERCC-6 and NDERCC-7 — documented default setup timeout is
  disproportionate on Windows). All behavior proven so far relies on unit
  tests, real-database integration tests, and manual/scripted HTTP smoke
  tests. This gap should be revisited once UI surface area grows.
- The `operators_singleton_check` CHECK constraint (added during PR #6
  review) has no `@@check` representation in `schema.prisma` — this
  Prisma version (7.9.1) does not support that attribute. Any future
  `prisma migrate dev` run against the `operators` table must have its
  generated SQL reviewed by hand so this constraint is not silently
  dropped as unrepresented drift.
- `packages/domain` and `packages/application` are empty stubs — the
  architecture diagram in `CLAUDE.md` describes intended layering that has
  no real content yet.
- `IntegrationConnection.configurationEncrypted` exists as an opaque field
  with no encryption implementation behind it yet — do not start storing
  real data in it before that design exists.

## 7. Next-source-resolution procedure

Before starting any new task:

1. Confirm the task has an approved Jira issue **with an Execution
   Contract** (see [`docs/templates/execution-contract.md`](../templates/execution-contract.md)
   and [RIC-011](../11-execution-contract-specification.md)). **Do not
   start implementation work without one** — this is a hard rule, not a
   preference. An idea, a Jira issue with no contract, or a verbal/chat
   instruction alone is not sufficient authorization to modify the
   repository.
2. Resolve the contract's source snapshot against current Google
   Docs/Jira/GitHub state — if anything has drifted since the contract was
   written (a dependency task's status changed, `main` advanced, a
   referenced document changed), stop and re-resolve before proceeding.
3. If a conflict appears between the layers in §4, or between this handoff
   and the current repository state, stop and report the conflict rather
   than guessing which source wins.

## 8. Direct-`main` execution rules

Two Sprint 0 tasks (NDERCC-7, NDERCC-8) used explicitly authorized direct
commits to `main` instead of a branch and PR. If a future contract
authorizes this pattern again, every one of these must hold:

- **Single writer** — verify no other process/agent is writing to `main`
  before starting, and re-verify `origin/main` has not advanced
  immediately before the push (not just at the start of execution).
- **Clean baseline** — local `HEAD` and `origin/main` must equal the
  contract's declared baseline SHA exactly, and the working tree/index
  must be clean, before any file is touched.
- **Complete gates** — the full validation sequence in
  [`docs/guides/local-development.md`](../guides/local-development.md)
  (§9), plus `/rick-code-quality` and `/rick-code-review`, must pass
  against the exact commit that will be pushed — not an earlier, similar
  commit.
- **Exactly one commit**, with the exact message the contract specifies.
  No amend after push, no rebase, no second unrelated commit.
- **Green CI before Done** — the contract's issue is not transitioned to a
  Done-equivalent status until CI is confirmed green on the pushed `main`
  commit. This is normally the job of a separate control process, not the
  executing agent itself (see each Sprint 0 task's own Jira policy for the
  exact split of responsibility).

Branch-per-task remains the default for anything not explicitly authorized
otherwise — see the Execution Contract template's mandatory branch-policy
rule.

## 9. Recovery after an interrupted execution

If an execution is interrupted (crash, disconnect, timeout) before it
reports completion, do not assume nothing happened and do not assume
everything happened. Before resuming or retrying:

1. Re-fetch the remote and compare local `main`/the task's branch against
   `origin` — do not trust local state alone.
2. Check the task's Jira issue for any evidence comment that may have
   already been posted, and its current status.
3. Check GitHub directly for a PR, a merge, or a commit that may already
   reflect the intended work, including its CI result.
4. Only after confirming what actually happened, take the smallest action
   that reconciles remaining work — never re-run a destructive or
   external-write step (a second commit, a duplicate PR, a Jira
   transition, a push) speculatively "just in case" it didn't happen the
   first time.
5. If the repository or Jira state is inconsistent with what the contract
   expected, stop and report the exact discrepancy rather than forcing it
   back into the expected shape.

This mirrors how each Sprint 0 direct-`main` task (NDERCC-7, NDERCC-8) was
required to re-verify its baseline immediately before every commit and
push, specifically to make this kind of recovery possible.
