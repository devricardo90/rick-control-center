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

**Existing checkout upgrade:** if your `.env` predates the dedicated RCC
PostgreSQL port, update it before running Prisma, tests, or the application:

```text
postgresql://rick:rick@localhost:5432/rick_dev
```

must become:

```text
postgresql://rick:rick@localhost:5455/rick_dev
```

Pulling this repository does not update the ignored `.env` automatically.

## 4. Start PostgreSQL

```bash
docker compose up -d
```

This starts `postgres:16-alpine` (container `rick_postgres`) on
`localhost:5455` with the credentials declared in `docker-compose.yml`
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

## 10. Register and snapshot a strategic Google Doc (optional)

Everything else in this guide works without any Google configuration. This
step is required only to register and snapshot approved strategic Google
Docs (NDERCC-13 / [DEC-RIC-003](../decisions/DEC-RIC-003-google-drive-credential-and-snapshot-boundary.md)).

### 10.1 Prerequisites, once per installation

1. **Create a Google Cloud project** (or reuse one) at
   <https://console.cloud.google.com/>.
2. **Enable the Google Drive API** for it:
   *APIs & Services → Library → Google Drive API → Enable*.
3. **Create a dedicated service account**:
   *IAM & Admin → Service accounts → Create service account*. Give it a
   name that makes its purpose obvious (e.g. `rick-control-center`). It
   needs **no** IAM project roles — its access comes entirely from files
   being shared with it, not from project-level permissions.
4. **Create a JSON key** for that service account:
   *Keys → Add key → Create new key → JSON*. Download it and treat it as a
   password.
5. **Copy the service-account email** (it looks like
   `something@your-project.iam.gserviceaccount.com`).

Do **not** enable domain-wide delegation, and do not grant the service
account any broader Drive scope. Reader-only, explicitly shared access is
the whole boundary.

### 10.2 Share each approved document

Open the approved Google Doc (or the folder holding your strategic
documents), click **Share**, paste the service-account email, and set its
role to **Viewer**. Nothing else grants access — a document that has not
been shared is invisible to RICK, and Drive reports it identically to a
document that does not exist.

### 10.3 Configure the credential without printing it

Put the **entire JSON key on one line** as `GOOGLE_SERVICE_ACCOUNT_JSON`
in `.env`, then restart the dev server.

```bash
# .env — never commit this file
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"…","private_key":"-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n","client_email":"…"}
```

Some safe habits while doing this:

- do not `cat`, `echo`, or `console.log` the value, and do not paste it
  into a terminal that is being recorded or screen-shared;
- delete the downloaded JSON file from `~/Downloads` once it is in `.env`;
- to confirm it is set without revealing it, check only that it is
  non-empty — e.g. `[ -n "$GOOGLE_SERVICE_ACCOUNT_JSON" ] && echo present`.

The application never stores this value in PostgreSQL, never sends it to
the browser, never returns it from an API, and never logs it. It is read
once, in `apps/web/server/utils/google-drive-reader.ts`, and stays inside
the token provider.

### 10.4 Snapshot flow

Select a project's settings and find the **Strategic documents** section:

1. Paste the Google Doc link (or its bare file ID) and choose a document
   type. Click **Register document** — this performs a single read-only
   metadata call to confirm the service account can see the document and
   to capture its real title.
2. Click **Synchronize**. RICK reads the document's version, exports it as
   plain text, re-reads the version to confirm it did not change mid-read,
   normalizes the text, and stores an immutable snapshot with a SHA-256
   checksum.
3. The row then shows the provider version, a checksum prefix, and the
   last successful sync time.
4. Click **Re-synchronize** on an unchanged document: it reports
   *"Document unchanged — the existing snapshot was reused"* and appends no
   duplicate row. Edit the document in Google and re-synchronize to see a
   new version and a new checksum, with the previous snapshot still
   preserved in history.

RICK only ever reads. There is no code path in this application that
writes to Google Drive or Google Docs.

### 10.5 Troubleshooting Google access

| What you see | What it usually means |
|---|---|
| **"This document does not exist or is not shared with the RICK service account."** (HTTP 422) | Drive returned `404`. Either the file ID is wrong, or the document was never shared with the service-account email. Drive deliberately does not distinguish the two, so neither do we — re-check the share dialog first. |
| **"Google Drive is temporarily unavailable."** (HTTP 503) | Covers a missing/invalid `GOOGLE_SERVICE_ACCOUNT_JSON` (`401`), a permission denial (`403`), rate limiting (`429`), a request timeout, or a network failure. Check the handle is set and the server was restarted; if the document is large or Drive is slow, retry. |
| **"Only native Google Docs can be registered and snapshotted."** (HTTP 415) | The link points at a PDF, a Sheet, a Slide, or an uploaded file. Only `application/vnd.google-apps.document` can be exported as text. |
| **"The document changed while it was being read."** (HTTP 409) | Someone was editing the document during all three read attempts. Nothing was corrupted and the previous snapshot is intact — retry when editing has settled. |
| **"Provide a valid Google Docs URL or file ID."** (HTTP 400) | The reference was not a `docs.google.com` / `drive.google.com` link, was a folder link, or contained no single unambiguous file ID. |
| **"Google returned a response this application cannot accept."** (HTTP 502) | Drive answered, but with an unparseable body or a document larger than the 5 MiB export limit. |

Note that a **failed** synchronization never destroys anything: the
source moves to `ERROR`, and its previous revision, checksum, metadata,
`lastSyncedAt`, and every stored snapshot are left exactly as they were.

### 10.6 Rotation and revocation

- **Revoke immediately:** delete the key in *IAM & Admin → Service
  accounts → Keys*. Access stops at once, with no code change or deploy.
  Deleting the whole service account, or removing its Viewer access on the
  documents, also works.
- **Rotate:** create a new JSON key, replace `GOOGLE_SERVICE_ACCOUNT_JSON`,
  restart the server, verify one synchronization succeeds, then delete the
  old key in Google Cloud.
- **If the key is ever exposed** — pasted into a log, a commit, a ticket,
  or a chat — treat it as compromised: delete that key first, then rotate.
- **Production direction:** a user-managed key is an accepted bootstrap
  mechanism for a runtime outside Google Cloud, not the intended end
  state. Workload Identity Federation is the preferred keyless path and
  can replace the key without changing the adapter or domain contract
  (DEC-RIC-003 §7). Adopting it is a separate, future decision.

## 11. Validation commands

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
Unlike Prisma CLI commands, Vitest does not load `prisma.config.ts`; export
the root `.env` value into the test process before running it. For example,
in PowerShell:

```powershell
$env:DATABASE_URL="postgresql://rick:rick@localhost:5455/rick_dev"
pnpm test
Remove-Item Env:DATABASE_URL
```

CI supplies its disposable `DATABASE_URL` directly in the same way.

## 12. Resetting the local database

To return to a completely clean database:

```bash
docker compose down -v   # stops Postgres and deletes the data volume
docker compose up -d     # starts a clean instance
pnpm db:migrate:deploy   # reapply all migrations
```

After a reset, the operator no longer exists — run `pnpm auth:bootstrap`
again before logging in.

## 13. Troubleshooting

**Port `5455` (PostgreSQL) or `3000` (Nuxt) is already in use**
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
sure you completed step 3 and that the repository-root `.env` contains
`DATABASE_URL="postgresql://rick:rick@localhost:5455/rick_dev"`.
If the checkout existed before RCC moved to port `5455`, replace any stale
`localhost:5432/rick_dev` value in `.env`; Git does not update this ignored
file, and the old value may connect to an unrelated local PostgreSQL.
The config loads that file explicitly for Prisma CLI commands regardless
of the package workspace cwd. An externally set `DATABASE_URL` takes
precedence, which is how CI and disposable databases override the local
value.

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

## 14. Security reminders

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
- `GOOGLE_SERVICE_ACCOUNT_JSON` (NDERCC-13 / DEC-RIC-003) is optional and
  server-only, but unlike `GITHUB_TOKEN` it is a **private key** — treat it
  with the same care as a production password. It is read in exactly one
  module, never persisted, never sent to the browser, never returned by any
  API, and never logged; the parsed credential is frozen and redacts itself
  if something tries to stringify it. Do not defeat that by printing the
  raw environment variable while debugging. Scope it by sharing only the
  specific documents RICK needs, as Viewer. If it is ever exposed, delete
  the key in Google Cloud immediately (§10.6) — revocation is instant and
  needs no deploy.
