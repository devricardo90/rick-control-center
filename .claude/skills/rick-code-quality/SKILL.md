---
name: rick-code-quality
description: Enforce strict, maintainable, type-safe TypeScript implementation in the RICK Control Center codebase. Invoke before committing any TypeScript, Vue, or domain-layer code to produce an implementation checklist, prohibited-pattern scan, required validation commands, exception policy, and final compliance decision.
---

# RICK Code Quality — TypeScript Strictness Enforcement

Evaluate every new or modified TypeScript / Vue file against the rules below before the code is committed. Produce the required output sections in order. Do not skip sections even if no violations are found.

---

## 1. Invocation

Invoke this skill whenever you have written or modified TypeScript (`.ts`, `.tsx`) or Vue (`.vue`) files in this repository and are about to commit.

```
/rick-code-quality
```

---

## 2. Implementation Checklist

Work through each item. Mark **PASS**, **FAIL**, or **N/A**.

### 2.1 TypeScript Compiler Requirements

| # | Rule | Status |
|---|------|--------|
| 1 | `strict: true` is active in the relevant `tsconfig.json` | |
| 2 | `noUncheckedIndexedAccess: true` is active | |
| 3 | `exactOptionalPropertyTypes: true` is active | |
| 4 | `noImplicitReturns: true` is active | |
| 5 | No `tsconfig.json` flag was weakened to make new code pass | |

### 2.2 Type Safety Rules

| # | Rule | Status |
|---|------|--------|
| 6 | No `any` annotation appears in new or modified code | |
| 7 | No `as any` cast appears in new or modified code | |
| 8 | No `@ts-ignore` appears in new or modified code | |
| 9 | Every `@ts-expect-error` has an inline justification comment and a corresponding test | |
| 10 | All data entering from external or untrusted sources (HTTP, filesystem, env, IPC) is typed as `unknown` at the boundary | |
| 11 | `unknown` values are narrowed via type guards, assertion functions, or a schema library before use | |
| 12 | No broad `as SomeType` cast bypasses narrowing at a trust boundary | |
| 13 | Domain types and transport DTOs are separate — domain types do not import HTTP or serialization concerns | |

### 2.3 Code Structure Rules

| # | Rule | Status |
|---|------|--------|
| 14 | Functions are small and single-purpose (no function exceeds ~40 lines without documented justification) | |
| 15 | No speculative abstraction was introduced for hypothetical future use | |
| 16 | Generics are used only when the type parameter is actually constrained or reused across callers | |
| 17 | No broad index signatures (`[key: string]: unknown`) unless justified by an external protocol | |
| 18 | No duplicate logic introduced that already exists in `@rick/shared` or an adjacent utility | |

### 2.4 ESLint Rules

| # | Rule | Status |
|---|------|--------|
| 19 | No `eslint-disable` comment was added without an inline justification | |
| 20 | No ESLint rule was downgraded from `error` to `warn` or `off` in config files to make new code pass | |

### 2.5 Error Handling

| # | Rule | Status |
|---|------|--------|
| 21 | Errors are not silently swallowed — every `catch` block either rethrows, returns a typed `Err`, or logs with context | |
| 22 | Error objects preserve the original cause via `{ cause: originalError }` or `Error.cause` | |
| 23 | No `console.error` in domain or application layer — use structured logging | |

### 2.6 Testing

| # | Rule | Status |
|---|------|--------|
| 24 | New logic has at least one test for a success path | |
| 25 | New logic has at least one test for a relevant failure or edge-case path | |
| 26 | Tests do not use `as any` or suppress TypeScript to satisfy the test runner | |

---

## 3. Prohibited Patterns

Search the diff or changed files for each pattern. Report every match — zero matches is the expected result.

```bash
# Run these searches on the staged diff or modified files:

# 1. Explicit any annotation
grep -rn ': any' --include='*.ts' --include='*.tsx' --include='*.vue' .

# 2. Cast to any
grep -rn 'as any' --include='*.ts' --include='*.tsx' --include='*.vue' .

# 3. ts-ignore
grep -rn '@ts-ignore' --include='*.ts' --include='*.tsx' --include='*.vue' .

# 4. Unjustified ts-expect-error (must have inline comment)
grep -n '@ts-expect-error' --include='*.ts' --include='*.tsx' --include='*.vue' -r .

# 5. Unjustified eslint-disable
grep -rn 'eslint-disable' --include='*.ts' --include='*.tsx' --include='*.vue' --include='*.mjs' .

# 6. Silenced errors (empty catch)
grep -rn 'catch\s*(.*)\s*{\s*}' --include='*.ts' --include='*.tsx' .
```

For every match found, state:
- file path and line number
- the matched text
- whether an exception applies (see §5)
- whether the match blocks the compliance decision

---

## 4. Required Validation Commands

Run every command below in order. A later command must not run if an earlier one fails. Report the exit code and relevant output for each.

```bash
# Gate 1 — Lint (static and style rules)
pnpm lint

# Gate 2 — TypeScript type check (all packages)
pnpm typecheck

# Gate 3 — Unit tests
pnpm test

# Gate 4 — Production build
pnpm build
```

All four gates must exit with code `0` before the compliance decision can be `COMPLIANT`.

---

## 5. Exception Policy

An exception may be granted for a specific finding only when **all** of the following are true:

1. The reason the pattern is necessary is documented in an inline comment on the same line or the line immediately above.
2. The scope is narrowed to the minimum required (a single expression, not a whole file).
3. A test exists that exercises the code path covered by the exception.
4. The exception is recorded in the **Exception Register** below in this output.

**Exception Register** (append one row per exception granted):

| File | Line | Pattern | Justification | Test Reference |
|------|------|---------|---------------|----------------|
| _none_ | | | | |

---

## 6. Final Compliance Decision

State exactly one of:

- **COMPLIANT** — all checklist items PASS or N/A, zero prohibited patterns without valid exceptions, all four validation gates exit 0.
- **NON_COMPLIANT** — one or more checklist items FAIL, or a prohibited pattern has no valid exception, or a validation gate fails.

If `NON_COMPLIANT`, list every blocking item and the correction required before the code may be committed.

```
COMPLIANCE DECISION: [COMPLIANT | NON_COMPLIANT]

Blocking items:
- (list or "none")

Required corrections before commit:
- (list or "none")
```
