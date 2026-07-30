# RICK Control Center — Claude Code Instructions

This file provides mandatory operating instructions for all Claude Code sessions in this repository. Read it before taking any action.

---

## 1. Governing Documents

All implementation must trace to an approved source of truth. Before writing code, read:

| Document | Path | Purpose |
|----------|------|---------|
| Development Protocol | `docs/12-development-protocol.md` | Governs all execution phases |
| Technical Architecture | `docs/03-technical-architecture.md` | Layer boundaries and component design |
| Data Model | `docs/06-data-model.md` | Entity definitions and persistence rules |
| State Machine | `docs/07-state-machine.md` | Valid state transitions |
| Execution Contract Spec | `docs/11-execution-contract-specification.md` | Contract format and authority model |

---

## 2. Required Skills

Two project skills are mandatory at specific phases. Invoke them with the `/` prefix.

### `/rick-code-quality`

**When:** After writing or modifying any TypeScript (`.ts`, `.tsx`) or Vue (`.vue`) file, before creating a commit.

**What it does:** Produces an implementation checklist (26 rules), a prohibited-pattern scan, required validation commands, an exception policy, and a final `COMPLIANT / NON_COMPLIANT` decision.

**Rule:** A commit must not be created if the compliance decision is `NON_COMPLIANT`.

### `/rick-code-review`

**When:** After `/rick-code-quality` returns `COMPLIANT`, and before `git commit`.

**What it does:** Performs an independent review pass — type-safety, architecture, tests, and scope — and returns `APPROVED`, `CHANGES_REQUIRED`, or `BLOCKED`.

**Rule:** A commit must not be created unless the review decision is `APPROVED`. If `CHANGES_REQUIRED`, fix and rerun both skills. If `BLOCKED`, stop and escalate.

---

## 3. Mandatory Validation Commands

Every commit candidate must pass all four gates in order:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm validate` to execute all four in sequence.

---

## 4. Prohibited Patterns

| Pattern | Rule |
|---------|------|
| `: any` | Forbidden — use `unknown` and narrow |
| `as any` | Forbidden — use type guards |
| `@ts-ignore` | Forbidden — fix the type error |
| `@ts-expect-error` without comment + test | Forbidden without exception |
| Empty `catch` blocks | Forbidden — always handle or rethrow with context |
| Weakening `tsconfig.json` | Forbidden |
| Inline `eslint-disable` without justification | Forbidden |

---

## 5. Architecture Boundaries

Respect the package dependency direction:

```
@rick/shared  →  @rick/domain  →  @rick/application  →  apps/web
```

- `@rick/domain` must not import from `apps/web` or infrastructure packages.
- `@rick/application` must not import database or HTTP libraries directly.
- External inputs must be typed as `unknown` at the boundary.
- Domain types and HTTP DTOs must remain separate.

---

## 6. Branch and Commit Policy

- Every task runs on a dedicated branch.
- The `main` branch does not receive direct commits.
- Commit messages follow Conventional Commits.
- Commit only after validation and an `APPROVED` review.

---

## 7. Scope and Safety Rules

- Modify only files required by the active task.
- Do not refactor unrelated code opportunistically.
- Do not add dependencies beyond what the task requires.
- Secrets must never appear in code, logs, commits, or comments.
- If a required change would expand scope, stop and report.

---

## 8. Mandatory Code Quality Policy

Never weaken these settings to make code pass.

### TypeScript Compiler

| Flag | Value |
|------|-------|
| `strict` | `true` |
| `useUnknownInCatchVariables` | `true` |
| `noUncheckedIndexedAccess` | `true` |
| `exactOptionalPropertyTypes` | `true` |
| `noImplicitReturns` | `true` |
| `noFallthroughCasesInSwitch` | `true` |
| `noUnusedLocals` | `true` |
| `noUnusedParameters` | `true` |

### ESLint Rules

| Rule | Severity | Scope |
|------|----------|-------|
| `@typescript-eslint/no-explicit-any` | error | All TS/Vue files |
| `@typescript-eslint/no-non-null-assertion` | error | All TS/Vue files |
| `@typescript-eslint/no-unsafe-assignment` | error | Package source files |
| `@typescript-eslint/no-unsafe-argument` | error | Package source files |
| `@typescript-eslint/no-unsafe-call` | error | Package source files |
| `@typescript-eslint/no-unsafe-member-access` | error | Package source files |
| `@typescript-eslint/no-unsafe-return` | error | Package source files |
| `complexity` | error (max 10) | All TS/Vue files |
| `max-depth` | error (max 3) | All TS/Vue files |
| `max-params` | error (max 4) | All TS/Vue files |
| `max-lines-per-function` | warn (max 60) | All TS/Vue files |

---

## 9. Type Safety Gate

External or untrusted data must be `unknown` at the boundary and narrowed before use.

```bash
pnpm quality:types
pnpm quality:forbidden-patterns
pnpm quality:review
```

Run `pnpm quality:review` in addition to `pnpm validate`.
