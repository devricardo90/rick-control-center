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
pnpm lint        # ESLint 9 flat config
pnpm typecheck   # vue-tsc + tsc --noEmit across all packages
pnpm test        # Vitest unit tests
pnpm build       # Nuxt production build
```

Run `pnpm validate` to execute all four in sequence.

---

## 4. Prohibited Patterns

The following are hard violations. Never introduce them:

| Pattern | Rule |
|---------|------|
| `: any` | Forbidden — use `unknown` and narrow |
| `as any` | Forbidden — use type guards |
| `@ts-ignore` | Forbidden — fix the type error |
| `@ts-expect-error` without comment + test | Forbidden without exception (see skill) |
| Empty `catch` blocks | Forbidden — always handle or rethrow with context |
| Weakening `tsconfig.json` | Forbidden — never lower strictness to make code pass |
| Inline `eslint-disable` without justification | Forbidden |

---

## 5. Architecture Boundaries

Respect the package dependency direction at all times:

```
@rick/shared  →  @rick/domain  →  @rick/application  →  apps/web
```

- `@rick/domain` must not import from `apps/web` or infrastructure packages.
- `@rick/application` must not import database or HTTP libraries directly.
- External inputs (HTTP, env vars, IPC) must be typed as `unknown` at the boundary.
- Domain types and HTTP DTOs must remain separate.

---

## 6. Branch and Commit Policy

- Every task runs on a dedicated branch: `feat/<JIRA-ID>-<slug>` or `fix/<JIRA-ID>-<slug>`.
- The `main` branch does not receive direct commits.
- Commit messages follow Conventional Commits: `type(scope): description — JIRA-ID`.
- A commit is created only after all validation gates pass and `/rick-code-review` returns `APPROVED`.
- A push occurs only after a successful commit.

---

## 7. Scope and Safety Rules

- Modify only files required by the active task.
- Do not refactor unrelated code opportunistically.
- Do not add dependencies beyond what the task requires.
- Secrets must never appear in code, logs, commits, or comments.
- If a required change would expand scope, stop and report — do not proceed silently.

---

## 8. Mandatory Code Quality Policy

All TypeScript code in this repository is subject to the following compiler and lint configuration. **Never weaken these settings to make code pass.**

### TypeScript Compiler (tsconfig.json)

| Flag | Value | Enforcement |
|------|-------|-------------|
| `strict` | `true` | Enables all strict checks including `useUnknownInCatchVariables` |
| `useUnknownInCatchVariables` | `true` | Explicit; catch error variables are typed `unknown` |
| `noUncheckedIndexedAccess` | `true` | Array/record access returns `T \| undefined` |
| `exactOptionalPropertyTypes` | `true` | Optional props cannot be set to `undefined` unless declared |
| `noImplicitReturns` | `true` | All code paths must return |
| `noFallthroughCasesInSwitch` | `true` | No fall-through between switch cases |
| `noUnusedLocals` | `true` | No dead variable declarations |
| `noUnusedParameters` | `true` | Prefix unused params with `_` |

### ESLint Rules (eslint.config.mjs)

| Rule | Severity | Scope |
|------|----------|-------|
| `@typescript-eslint/no-explicit-any` | error | All TS/Vue files |
| `@typescript-eslint/no-non-null-assertion` | error | All TS/Vue files |
| `@typescript-eslint/no-unsafe-assignment` | error | `packages/*/src/**/*.ts` (typed) |
| `@typescript-eslint/no-unsafe-argument` | error | `packages/*/src/**/*.ts` (typed) |
| `@typescript-eslint/no-unsafe-call` | error | `packages/*/src/**/*.ts` (typed) |
| `@typescript-eslint/no-unsafe-member-access` | error | `packages/*/src/**/*.ts` (typed) |
| `@typescript-eslint/no-unsafe-return` | error | `packages/*/src/**/*.ts` (typed) |
| `complexity` | error (max 10) | All TS/Vue files |
| `max-depth` | error (max 3) | All TS/Vue files |
| `max-params` | error (max 4) | All TS/Vue files |
| `max-lines-per-function` | warn (max 60) | All TS/Vue files |

---

## 9. Type Safety Gate

All data entering from external or untrusted sources must be typed as `unknown` at the boundary, then narrowed before use. This applies to:

- HTTP request/response bodies
- Environment variables (`process.env.*`)
- File system reads
- IPC and inter-process messages
- External library return values that lack precise types

**Pattern:**
```typescript
// ✓ Correct — unknown at boundary, narrowed before use
const raw: unknown = await fetch('/api/data').then(r => r.json())
if (!isMySchema(raw)) throw new Error('Invalid response shape')
const data: MySchema = raw

// ✗ Wrong — assumed type at boundary
const data = await fetch('/api/data').then(r => r.json() as MySchema)
```

**Quality scripts:**

```bash
pnpm quality:types              # TypeScript compiler type check only
pnpm quality:forbidden-patterns # AST-based scan for any/as-any/@ts-ignore/empty-catch
pnpm quality:review             # Both of the above in sequence
```

Run `pnpm quality:review` as a pre-commit check in addition to `pnpm validate`.
