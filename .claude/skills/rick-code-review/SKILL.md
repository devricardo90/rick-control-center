---
name: rick-code-review
description: Perform an independent code-review pass on staged or modified files in the RICK Control Center repository. Invoke after implementation and before commit to produce a structured review report with type-safety, architecture, test, and scope findings, and a final APPROVED / CHANGES_REQUIRED / BLOCKED decision.
---

# RICK Code Review — Pre-Commit Review Gate

Perform a systematic, independent review of every file in the current diff. This review is distinct from the author's self-check. Produce all report sections in order. Do not skip a section even if it has no findings.

---

## 1. Invocation

Invoke this skill after implementation is complete and the `rick-code-quality` checklist has been run, but before the commit is created.

```
/rick-code-review
```

The review operates on: `git diff HEAD` (unstaged), `git diff --cached` (staged), or the explicit list of changed files provided by the execution contract.

---

## 2. Pre-Review Scans

Before reading files manually, run the following automated scans and include their output verbatim in the report.

```bash
# Scan 1 — explicit any
grep -rn ': any' --include='*.ts' --include='*.tsx' --include='*.vue' . \
  | grep -v node_modules | grep -v '.nuxt' | grep -v dist

# Scan 2 — cast to any
grep -rn 'as any' --include='*.ts' --include='*.tsx' --include='*.vue' . \
  | grep -v node_modules | grep -v '.nuxt' | grep -v dist

# Scan 3 — ts-ignore
grep -rn '@ts-ignore' --include='*.ts' --include='*.tsx' --include='*.vue' . \
  | grep -v node_modules | grep -v '.nuxt' | grep -v dist

# Scan 4 — ts-expect-error (list all; reviewer must verify each has justification + test)
grep -rn '@ts-expect-error' --include='*.ts' --include='*.tsx' --include='*.vue' . \
  | grep -v node_modules | grep -v '.nuxt' | grep -v dist

# Scan 5 — eslint-disable (list all; reviewer must verify each has justification)
grep -rn 'eslint-disable' --include='*.ts' --include='*.tsx' --include='*.vue' --include='*.mjs' . \
  | grep -v node_modules | grep -v '.nuxt' | grep -v dist

# Scan 6 — unsafe casts (object or unknown cast without guard)
grep -rn ' as [A-Z][a-zA-Z]\+' --include='*.ts' --include='*.tsx' . \
  | grep -v node_modules | grep -v '.nuxt' | grep -v dist
```

---

## 3. Files Reviewed

List every file in the diff and classify each:

| File | Change Type | Review Status |
|------|------------|---------------|
| _(populate from diff)_ | Added / Modified / Deleted | Reviewed / Skipped (reason) |

Skip only generated files (`.nuxt/`, `dist/`, `pnpm-lock.yaml`) and binary assets. All other files must be reviewed.

---

## 4. Findings by Severity

Use the following severity levels:

- **CRITICAL** — blocks commit; security risk, data loss, or correctness violation.
- **HIGH** — blocks commit; type-safety violation, prohibited pattern, or missing required test.
- **MEDIUM** — blocks commit; code-quality or architecture violation the team has agreed to enforce.
- **LOW** — non-blocking; style or minor improvement suggestion.
- **INFO** — observation with no required action.

List every finding:

```
[SEVERITY] file:line — finding description
```

If a severity level has no findings, write `[SEVERITY] none`.

---

## 5. Type-Safety Findings

Review each file for:

- [ ] `any` annotations — explicit or inferred
- [ ] `as any` casts
- [ ] `@ts-ignore` without documented necessity
- [ ] `@ts-expect-error` without inline justification and corresponding test
- [ ] Trust-boundary inputs not typed as `unknown`
- [ ] `unknown` values used without narrowing
- [ ] Broad `as SomeType` casts bypassing narrowing (e.g., `response.data as ProjectEntity`)
- [ ] Type assertions that hide runtime shape mismatches

For each violation found, state: file, line, pattern, impact, and required correction.

---

## 6. Architecture Findings

Review the changed files for:

- [ ] Domain types importing transport or HTTP concerns
- [ ] Application layer importing infrastructure directly (bypassing adapter)
- [ ] Infrastructure concerns leaking into `packages/domain` or `packages/application`
- [ ] Violation of the `@rick/shared → @rick/domain → @rick/application → apps/web` dependency direction
- [ ] New cross-package circular dependencies
- [ ] State mutation outside of designated state management boundaries

For each violation found, state: file, affected layer boundary, impact, and required correction.

---

## 7. Test Findings

Review test files and implementation files for:

- [ ] New logic with no corresponding test file or test case
- [ ] Success paths covered but no failure / edge-case path tested
- [ ] Tests that use `as any` or `@ts-ignore` to satisfy the test runner
- [ ] Tests asserting implementation details instead of behavior
- [ ] Test file imports from `dist/` or built output instead of source

For each gap found, state: file, untested path, and suggested test description.

---

## 8. Scope Findings

Review whether the diff contains changes outside the active task's scope:

- [ ] Files modified that are not listed in the execution contract's `allowedPaths`
- [ ] Files in `docs/` modified without documentation scope in the contract
- [ ] Refactors or cleanups not required by the task
- [ ] Dependencies added or upgraded beyond what the task requires
- [ ] Configuration files modified without explicit task requirement

For each out-of-scope change found, state: file, nature of change, and recommended action (revert / create separate task).

---

## 9. Additional Review Checks

Perform a manual read of each reviewed file for:

- [ ] **Error handling** — silent catch blocks, missing `cause`, errors swallowed in async code
- [ ] **Duplicated logic** — code that already exists in `@rick/shared` or a sibling module
- [ ] **Function and file complexity** — functions over ~40 lines, files over ~200 lines without justification
- [ ] **Boundary validation** — external inputs (HTTP body, env vars, CLI args, IPC messages) validated at the boundary
- [ ] **Secret exposure** — credentials, tokens, or API keys in code, logs, or comments

---

## 10. Required Corrections

List every correction required before the commit may proceed. Number each item.

```
1. [file:line] Description of required correction.
2. ...

(or "none — no required corrections")
```

---

## 11. Final Review Decision

State exactly one decision and justify it.

### APPROVED

All of the following are true:
- No CRITICAL, HIGH, or MEDIUM findings remain unaddressed.
- All validation gates (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) pass.
- No prohibited patterns (`any`, `as any`, `@ts-ignore`) appear without a valid exception.
- No out-of-scope changes are included in the diff.
- Test coverage exists for all new logic paths.

```
REVIEW DECISION: APPROVED
Reviewer: [agent name]
Reviewed at: [ISO timestamp]
Commit candidate: [git diff HEAD short SHA or "staged"]
```

### CHANGES_REQUIRED

One or more HIGH or MEDIUM findings must be corrected, but no CRITICAL finding blocks the task entirely.

```
REVIEW DECISION: CHANGES_REQUIRED
Blocking findings: [list finding numbers from §10]
After corrections: rerun /rick-code-quality and /rick-code-review before committing.
```

### BLOCKED

A CRITICAL finding exists (security risk, data loss, scope violation, or correctness failure) that cannot be resolved by a simple correction. The task must be paused and escalated.

```
REVIEW DECISION: BLOCKED
Blocking reason: [description]
Required action: [escalate / revert / create incident task]
Do not commit. Do not push.
```
