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

## Filesystem boundary

Discovery produces Git paths; each path is then validated against the real
filesystem before any content is read. This is part of the repository-authored
security boundary, not an optimisation. Its purpose is to guarantee that the
mandatory gate only ever reads files that the repository itself authors.

- **Only regular-file entries are scanned.** Directories and every non-regular
  entry are excluded.
- **Final-component symlinks are excluded.** The scanner uses `lstat`, never
  `stat`, so a Git-tracked symlink is inspected as a link and is never resolved
  to its target. A tracked `.ts` symlink pointing outside the repository is
  dropped at discovery and its target is never read.
- **Paths whose resolved location escapes the repository through symlinked path
  components are excluded.** `lstat` refuses only the final component, so every
  surviving candidate is canonicalised with `realpath` and rejected unless its
  real location is contained within the canonical repository root. Containment
  is computed with path-aware relative resolution — never a string prefix test,
  which would accept a sibling directory such as `<root>-external`.
- **Git paths are used verbatim.** `git ls-files -z` already emits repository
  paths with `/` separators on every platform, so no separator rewriting is
  performed. A literal backslash is a legal character in a POSIX filename and
  must not be reinterpreted as a directory separator; doing so would resolve to
  a non-existent path and silently drop an authored file from the gate.
- **A tracked path missing from the working tree is skipped without error.**
  This is the ordinary deleted-but-tracked state and is not a failure.
- **A canonicalisation failure fails the gate.** Only `ENOENT` is tolerated,
  and only as the deletion race: `lstat` already confirmed a regular file, so
  the entry vanished in between and there is nothing left to scan. Every other
  canonicalisation error — `EACCES`, `ELOOP`, `ENAMETOOLONG`, descriptor
  exhaustion, `EPERM`, or an unrecognised code — aborts the run instead of
  dropping the candidate. Silently skipping a confirmed authored file would let
  a mandatory gate pass while scanning less than it should.

`lstat` must not be replaced with `stat`, and the canonical containment check
must not be removed. Both are load-bearing controls, and both are covered by
regression tests in `scripts/check-patterns.test.ts`.

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
future directories, ignored artifacts, declaration exclusion, deterministic
discovery/diagnostics, and the filesystem boundary described above. Boundary
cases that cannot exist on a given platform — symlink creation and literal
backslash filenames on Windows — are skipped there and execute in Linux CI.
Canonicalisation outcomes are injected rather than provoked through filesystem
permissions, so the tolerated-`ENOENT` race, the fail-closed policy for every
other error, and the sibling-prefix containment case all execute on every
platform, including where symlinks cannot be created.

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
