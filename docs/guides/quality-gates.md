# Repository quality gates

## Commands

Run the blocking forbidden-pattern scan with:

```text
pnpm quality:forbidden-patterns
```

Run the complete local quality review with:

```text
pnpm quality:review
```

`quality:review` runs the existing typecheck gate and then the forbidden-pattern
gate. Both commands fail with a non-zero exit code when a blocking violation is
found.

## Discovery boundary

The scanner asks Git for the repository-authored file set using the semantic
equivalent of:

```text
git ls-files --cached --others --exclude-standard -z
```

The NUL-delimited result is filtered and sorted by repository-relative path
before scanning. This includes:

- tracked files that exist in the working tree;
- non-ignored untracked files;
- files anywhere in the repository, including root configuration, tests,
  applications, packages, and future authored directories.

The scanner does not maintain a source-directory allowlist.

## Extensions and exclusions

Scanned extensions are `.ts`, `.tsx`, and `.vue`. Declaration files ending in
`.d.ts` are excluded.

Git's normal ignore rules exclude generated, vendor, build, output, ignored
worktree, and equivalent local artifacts. The scanner does not traverse the
filesystem independently, so ignored paths cannot enter through environment-
dependent directory traversal.

## Blocking rules

The following rules remain mandatory and blocking:

- `explicit-any` — an explicit `any` type;
- `as-any` — an `as any` assertion;
- `@ts-ignore` — a `@ts-ignore` directive;
- `empty-catch` — a catch block with no statements.

No rule is downgraded to a warning, suppressed, or bypassed.

## Diagnostics

Each violation is reported in deterministic form:

```text
repository/path.ts:line:column  [stable-rule-id]  minimal-pattern
```

File paths use repository-relative forward slashes. The file list and
diagnostics are sorted deterministically. Diagnostics expose only the
repository-relative location, stable rule identifier, and minimal offending
token or pattern; source text and secret-bearing values are not printed.

## Local usage

Run `pnpm quality:forbidden-patterns` while developing, or run
`pnpm quality:review` before opening a pull request. If the scan fails, use the
reported path, line, column, and rule to remove or replace the prohibited
pattern. Re-run the command and then the relevant typecheck/tests.

The regression coverage in `scripts/check-patterns.test.ts` uses temporary Git
repositories to prove blocking rules, compliant TS/TSX/Vue sources, root and
future directories, ignored artifacts, declaration exclusion, and deterministic
discovery/diagnostics.

## CI usage

The CI workflow runs `pnpm quality:review` as an explicit mandatory step for
governed pushes and pull requests targeting `main`. Existing install, Prisma
generation, migration, lint, typecheck, test, and build gates remain separate
mandatory steps.

## Remediation procedure

1. Read the exact diagnostic and open the referenced repository-relative file.
2. Replace the prohibited construct with a typed or otherwise compliant form;
   remove an unnecessary `@ts-ignore`; or add a meaningful statement to a
   catch block.
3. If the file is generated, vendor, build, output, or worktree material,
   correct its Git ignore boundary instead of weakening the scanner.
4. Re-run `pnpm quality:forbidden-patterns` and `pnpm quality:review`.
5. Run the normal repository gates before pushing.
