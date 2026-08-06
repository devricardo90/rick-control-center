# Local Development Guide

This is the **single canonical guide** for running RICK Control Center on a
development machine, from a clean checkout to a working authenticated
session with a project created. Every command below is copied verbatim from
this repository's actual configuration (`package.json`,
`docker-compose.yml`, `.env.example`) — nothing here is invented.

For deeper detail on the database package specifically (schema, domain
models, authentication internals), see
[`packages/database/README.md`](../../packages/database/README.md). This
guide covers the whole application end to end; that README goes deeper on
`@rick/database` alone. If the two ever disagree, this guide is the
canonical entry point — treat a disagreement as a documentation bug and
fix the other file to match.

## 1. Required tools and versions

| Tool | Required version | Where it's pinned |
|---|---|---|
| Node.js | `24.15.0` | [`.node-version`](../../.node-version) |
| pnpm | `10.33.0` | `packageManager` field in [`package.json`](../../package.json) |
| Docker (with Compose) | any recent version supporting Compose v2 (`docker compose`) | used to run PostgreSQL locally |
| PostgreSQL | `16` (via the `postgres:16-alpine` image) | [`docker-compose.yml`](../../docker-compose.yml) |

Use a Node version manager (`nvm`, `fnm`, etc.) that respects
`.node-version` if your Node version differs.

## 2. Clone and install

```bash
git clone https://github.com/devricardo90/rick-control-center.git
cd rick-control-center
pnpm install
```

`pnpm install` installs every workspace package (`apps/web`,
`packages/shared`, `packages/domain`, `packages/application`,
`packages/database`) in one pass — this is a pnpm workspace monorepo.

## 3. Configure the environment

```bash
cp .env.example .env
```

Open `.env` and review the values — the defaults already match the
Docker Compose service started in the next step, so no edits are required
for a first run. **Never put a real credential in `.env`** — it is
git-ignored (`.gitignore`) precisely so it is safe to hold local secrets,
but this project has no real secrets to put there yet: every value in
`.env.example` is a non-secret local placeholder.

## 4. Start PostgreSQL

```bash
docker compose up -d
```

This starts `postgres:16-alpine` (container `rick_postgres`) on
`localhost:5432` with the credentials declared in `docker-compose.yml`
(`rick` / `rick`, database `rick_dev` — local-only, non-secret). Verify it
is healthy before continuing:

```bash
docker compose ps
```

The `postgres` service should show a healthy status (Compose polls
`pg_isready -U rick -d rick_dev` every 5 seconds).

## 5. Generate the Prisma client and apply migrations

```bash
pnpm db:generate
pnpm db:migrate:deploy
```

- `pnpm db:generate` generates the typed Prisma client into
  `@prisma/client` from `packages/database/prisma/schema.prisma`.
- `pnpm db:migrate:deploy` applies every existing migration in
  `packages/database/prisma/migrations/` non-interactively — this is the
  same command CI uses, and the correct one for a first-time local setup.
  (`pnpm db:migrate` is the separate, interactive command for *authoring* a
  new migration during development — do not use it just to apply the
  existing ones.)

## 6. Bootstrap the primary operator

RICK Control Center has exactly one operator per installation, created
only through this interactive command (there is no registration page):

```bash
pnpm auth:bootstrap
```

You will be prompted for a username and a password (typed without being
echoed to the terminal, minimum 12 characters, entered twice to confirm).
This command **requires a real interactive terminal (TTY)** — running it
through a pipe, a non-interactive CI step, or certain sandboxed tool
runners will fail with `A TTY is required to read a password without
echoing it.` by design, not by bug.

Re-running `pnpm auth:bootstrap` later updates the same operator's
username/password rather than creating a second one, and revokes every
existing session as part of the same operation.

## 7. Start the application

```bash
pnpm dev
```

This runs the Nuxt 3 dev server for `apps/web` (via
`pnpm --filter @rick/web dev`), by default at `http://localhost:3000`.

## 8. Log in and verify the minimal project flow

1. Open `http://localhost:3000/` — you will be redirected to `/login`
   (unauthenticated pages redirect; unauthenticated API calls return `401`).
2. Sign in with the username/password from step 6.
3. You land on the **Projects** page. On a fresh database this shows the
   empty state ("No projects yet…").
4. Use the **Create project** form (Key and Name are required; Description
   is optional) and submit it. The new project appears in the list
   immediately, without a manual page refresh.
5. Click a project row to select it — the selection is shown at the top of
   the page ("Selected: `<name>` (`<key>`)").
6. Reload the page — the project(s) you created are still listed (they are
   persisted in PostgreSQL, not held only in browser state).

## 9. Connect a GitHub repository (optional)

Select a project's settings and find the **GitHub repository** section.
This never asks for a token — it only ever takes an owner and a
repository name (NDERCC-11 / DEC-RIC-001):

1. Enter an owner (e.g. `devricardo90`) and a repository name (e.g.
   `rick-control-center`) for a **public** repository — this works with
   no configuration at all.
2. Click **Connect and verify**. On success you'll see the canonical
   `owner/repository` name, default branch, visibility, and a `CONNECTED`
   status with a verification timestamp.
3. Click **Re-verify** at any time to re-check the repository is still
   reachable and update the stored metadata.

To verify a **private** repository, or to see real read/push/admin
permission values instead of `unknown`, set `GITHUB_TOKEN` in `.env`
first (see `.env.example`) and restart the dev server — the token is
read once from the server environment and is never visible in the
browser, never returned by any API response, and never stored in
PostgreSQL.

## 10. Validation commands

Run these from the repository root before considering any change ready:

```bash
pnpm lint                       # ESLint 9 flat config
pnpm typecheck                  # vue-tsc + tsc --noEmit across all packages
pnpm test                       # Vitest — requires DATABASE_URL and a running PostgreSQL (step 4)
pnpm build                      # Nuxt production build
pnpm quality:forbidden-patterns # AST scan for `any` / `as any` / `@ts-ignore` / empty catch
pnpm quality:review             # typecheck + quality:forbidden-patterns together
pnpm validate                   # lint + typecheck + test + build, in sequence
```

`pnpm test` runs real integration tests against PostgreSQL (uniqueness,
foreign-key, and session-expiry behavior are database-enforced and cannot
be proven against a mock) — Docker Compose must be running and migrations
applied before you run it, exactly as in CI
(see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), which
provisions its own disposable PostgreSQL service for the same reason).

## 11. Resetting the local database

To return to a completely clean database:

```bash
docker compose down -v   # stops Postgres and deletes the data volume
docker compose up -d     # starts a clean instance
pnpm db:migrate:deploy   # reapply all migrations
```

After a reset, the operator no longer exists — run `pnpm auth:bootstrap`
again before logging in.

## 12. Troubleshooting

**Port `5432` (PostgreSQL) or `3000` (Nuxt) is already in use**
Another process — including a previous `docker compose up -d` you forgot
was running, or an unrelated local service — is bound to that port. Check
with `docker compose ps` / your OS's port-listing tool and stop the
conflicting process, or run the Nuxt dev server on a different port with
`PORT=3901 pnpm dev` (Nitro reads `PORT` from the environment).

**Docker is not running / `docker compose` fails immediately**
Start Docker Desktop (or your Docker daemon) first. `docker compose up -d`
requires a running Docker engine, not just the CLI being installed.

**`Cannot resolve environment variable: DATABASE_URL`**
Prisma's config (`packages/database/prisma.config.ts`) reads the
connection string from `DATABASE_URL` and fails fast if it is unset. Make
sure you completed step 3 (`.env` exists) and that whatever is running the
command actually loads it — commands run directly in a shell that never
sourced `.env` need it set explicitly, e.g.
`DATABASE_URL="postgresql://rick:rick@localhost:5432/rick_dev" pnpm test`.

**Stale Prisma client / types don't match the schema**
Re-run `pnpm db:generate` after pulling changes that touch
`packages/database/prisma/schema.prisma`. The generated client is not
committed to Git and does not update itself.

**`pnpm auth:bootstrap` fails with "A TTY is required…"**
This is intentional (see step 6) — it refuses to read a password
insecurely when it cannot guarantee the terminal won't echo it. Run it
directly in an interactive terminal.

**Login succeeds but every page still redirects to `/login`, or an
existing session stops working after re-running bootstrap**
Expected if you changed the operator's password — `pnpm auth:bootstrap`
revokes every existing session as part of the same operation (see
[`packages/database/README.md`](../../packages/database/README.md#authentication-single-primary-operator)).
Log in again with the current password.

**GitHub connect fails with "This GitHub repository does not exist or is
not accessible"**
Either the owner/repository name is wrong, or it's a private repository
and `GITHUB_TOKEN` isn't set (or doesn't have access) — GitHub
deliberately returns the same signal for both, to avoid revealing whether
a private repository exists. Double-check the name, or set
`GITHUB_TOKEN` for a private repository and restart the server.

**GitHub connect/re-verify fails with "GitHub is temporarily
unavailable"**
Covers an invalid/expired token, a permission problem, GitHub rate
limiting, a request timeout, or GitHub itself being unreachable — the
repository's previously verified information (if any) is left untouched;
only its status moves to `ERROR`. Try again, or check `GITHUB_TOKEN` if
the repository is private.

## 13. Security reminders

- Never commit `.env` — it is already git-ignored; keep it that way, and
  never paste its contents into a commit message, a Jira comment, or a log.
- Never put a real password, API key, or token in `.env.example` — it is
  committed to Git and must only ever contain non-secret placeholders.
- Passwords are never logged anywhere in this codebase — the login and
  bootstrap flows are structurally unable to serialize a password hash or
  raw session token (see `SafeOperator` / `SafeAuthSession` in
  `packages/database/src/{operator,auth-session}.ts`). Do not add a
  `console.log` of a request body, a full `Operator` row, or a raw session
  token while debugging — log the safe, narrowed types instead.
- `GITHUB_TOKEN` (NDERCC-11 / DEC-RIC-001) is optional and server-only.
  Public repositories work without it. If you set it, prefer a
  fine-grained personal access token scoped to only the repository (or
  repositories) you need, with minimum read-only permissions — this
  application only ever calls `GET /repos/{owner}/{repo}`, never a write
  endpoint. It is never stored in PostgreSQL, never returned by any API
  response, and never logged. Restart the server after changing it.
