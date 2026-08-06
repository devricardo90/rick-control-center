# @rick/database

PostgreSQL persistence foundation for RICK Control Center, built on Prisma 7.
Sprint 0 — NDERCC-4 / RIC-S0-03 (PostgreSQL + Prisma foundation) and
NDERCC-5 / RIC-S0-04 (initial domain and persistence model).

## Prerequisites

- Docker (for local PostgreSQL)
- pnpm workspace installed at the repo root (`pnpm install`)

## Local setup

1. Start PostgreSQL from the repo root:

   ```bash
   docker compose up -d
   ```

   This starts `postgres:16-alpine` on `localhost:5432` with the credentials
   defined in `docker-compose.yml` (local-only, non-secret).

2. Copy the environment example and adjust if needed:

   ```bash
   cp .env.example .env
   ```

   The default `DATABASE_URL` already matches the Docker Compose service.

3. Generate the Prisma client:

   ```bash
   pnpm db:generate
   ```

4. Apply migrations:

   ```bash
   pnpm db:migrate          # interactive, creates new migrations in development
   pnpm db:migrate:deploy   # applies existing migrations only (CI / non-interactive)
   ```

## Verifying connectivity

`checkDatabaseHealth` (exported from `@rick/database`) runs a trivial
`SELECT 1` probe and returns a typed result:

```ts
import { prisma, checkDatabaseHealth } from '@rick/database'

const result = await checkDatabaseHealth(prisma)
// { healthy: true, latencyMs: number } | { healthy: false, latencyMs: number, error: string }
```

Unit tests (`pnpm --filter @rick/database test`) exercise this logic against
a mocked client. To verify against a real database, start Docker Compose,
generate the client, apply migrations, then call `checkDatabaseHealth` from
any script or the Nuxt server context with `DATABASE_URL` set.

## Domain models

### Project

The root isolation aggregate — every operational entity belongs to a
`Project`. Key fields: `key` (globally unique, database-enforced), `status`
(`ACTIVE` / `PAUSED` / `ARCHIVED`), `autonomyPolicy`
(`SUPERVISED` / `CONTROLLED_AUTONOMOUS`), `defaultBranchPolicy`
(`BRANCH_PER_TASK` / `DIRECT_COMMIT`), and `archivedAt`. Archival is
**logical**: a `Project` is archived by setting `status: ARCHIVED` and
`archivedAt`, never by deleting the row.

### IntegrationConnection

A project-owned integration entity for `GITHUB`, `JIRA`, `GOOGLE_DRIVE` or
`AGENT_RUNTIME`. Every connection has a mandatory `projectId` foreign key.
Deleting a `Project` that still has connections is **restricted** at the
database level (`ON DELETE RESTRICT`) — connections must be removed first.
This is a deliberate choice: destructive project deletion should not
silently cascade away integration history.

`status` tracks verification lifecycle: `PENDING` (never verified),
`CONNECTED`, `ERROR`, or `DISCONNECTED`.

**Security:** `configurationEncrypted` is an opaque, already-encrypted
payload. Nothing in this package encrypts, decrypts, inspects, or logs it —
encryption is out of scope for this task. No plaintext token, password, or
credential field exists on this model; do not add one without an approved
encryption design.

### DocumentSource

A project-owned strategic document registry entry (NDERCC-12 / DEC-RIC-002).
Tracks provenance (`provider` — currently only `GOOGLE_DRIVE` —,
`externalFileId`), classification (`documentType`), and two **independent**
status dimensions: `approvalStatus` (`DRAFT` / `APPROVED` / `REJECTED` /
`SUPERSEDED`) and `syncStatus` (`PENDING` / `SYNCED` / `STALE` / `ERROR`).
The same external file may be registered only once per project
(`(projectId, provider, externalFileId)` is unique), but independently in a
different project, and a project may register more than one source of the
same `documentType`.

A synchronization failure or a `STALE` marking never overwrites the last
successful `revision`, `checksum`, `metadataJson`, or `lastSyncedAt` — only
`syncStatus` changes. There is no physical delete operation.

**This is persistence and provenance only.** NDERCC-12 does not call Google
Drive, does not import or parse document body content, and does not
generate a checksum from content — it validates and stores a
caller-supplied checksum shape only. Document content, versions, and
snapshots are explicitly deferred to a future, separately-decided task
(see `docs/decisions/DEC-RIC-002-document-source-persistence-boundary.md`).

**Security:** `metadataJson` is narrowed from `unknown` and recursively
rejected when any key (at any depth) is credential- or secret-shaped
(`token`, `authorization`, `cookie`, `password`, `secret`, `credential`,
`apiKey`, and case-insensitive variants) before it is ever persisted.

## Domain persistence surface

`@rick/database` exports a minimal, typed, framework-independent surface
over the models above (`src/project.ts`, `src/integration-connection.ts`):

```ts
import { prisma, createProject, findProjectByKey, createIntegrationConnection } from '@rick/database'

const project = await createProject(prisma, { key: 'rick-core', name: 'RICK Core' })
await createIntegrationConnection(prisma, {
  projectId: project.id,
  provider: 'GITHUB',
  displayName: 'Primary GitHub',
})
```

Invalid references and duplicate keys are surfaced as typed errors
(`ProjectNotFoundError`, `DuplicateProjectKeyError`) rather than raw Prisma
errors — see `src/errors.ts`.

## Authentication (single primary operator)

RICK Control Center supports exactly one operator per installation, with
login-and-password authentication and server-enforced sessions
(NDERCC-6 / RIC-S0-05).

### Provisioning the operator

There is no registration page. The operator is created or updated only
through the interactive bootstrap command, which reads the password from
the terminal without echoing it and never logs or persists it in plaintext:

```bash
pnpm auth:bootstrap
```

This is idempotent: running it again updates the same canonical operator
(username and/or password) rather than creating a second one — a second
operator is rejected at the database level even if some future code tried
to bypass this command. Changing the password revokes every existing
session.

### Password hashing

Passwords are hashed with **Argon2id** via `@node-rs/argon2`, using the
OWASP-recommended baseline profile, set explicitly in
`src/auth/password.ts`:

| Parameter | Value |
|---|---|
| Memory cost | 19456 KiB (19 MiB) |
| Time cost (iterations) | 2 |
| Parallelism | 1 |

A precomputed hash of a fixed, explicitly artificial string is used to keep
login timing similar for a nonexistent username vs. a wrong password
(`DUMMY_PASSWORD_HASH`) — it can never authenticate a real operator.

### Sessions

- The raw session token is a 32-byte cryptographically random value
  (`node:crypto` `randomBytes`), returned to the browser **only** via an
  `HttpOnly` cookie (`rick_session`). It is never returned in a JSON body.
- PostgreSQL stores only its SHA-256 digest (`AuthSession.tokenDigest`) —
  the raw token cannot be recovered from the database.
- Cookie policy: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when
  `NODE_ENV=production` (`apps/web/server/utils/auth-cookie.ts`).
- Sessions expire 24 hours after creation (absolute — no refresh, no
  sliding expiration, no remember-me).
- Logout (`POST /api/auth/logout`) revokes the session server-side and
  clears the cookie.

### Route protection

`apps/web/server/middleware/auth.ts` runs before every request. Public
paths (`/login`, `/api/auth/login`, `/api/auth/logout`, framework assets,
`/favicon.ico`, `/robots.txt`) pass through; everything else requires a
valid session — unauthenticated page requests redirect to `/login`,
unauthenticated API requests receive `401`. This is enforced entirely
server-side; there is no client-side-only route guard.

## Running tests

Unit tests (`health.test.ts`, `auth/password.test.ts`,
`auth/session-token.test.ts`) run against mocks or pure functions. The
domain persistence tests (`project.test.ts`, `integration-connection.test.ts`,
`document-source.test.ts`, `authenticate.test.ts`) are **integration tests that require a real,
running PostgreSQL instance** with `DATABASE_URL` set —
database-enforced constraints (key uniqueness, foreign-key integrity,
delete-restrict behavior, session expiry/revocation) cannot be proven with
mocks. Start Docker Compose and apply migrations before running
`pnpm test`; CI provisions its own disposable PostgreSQL service for the
same reason (see `.github/workflows/ci.yml`).

`authenticate.test.ts` covers `Operator` and `AuthSession` together,
deliberately in one file: unlike `Project`, `Operator` is a singleton
table, so its tests cannot use unique-key-per-test isolation and rely
instead on vitest's default sequential execution within a single file.

## Configuration notes

- Prisma 7 reads the connection string from `prisma.config.ts`
  (`datasource.url`), not from `schema.prisma`. `schema.prisma` only declares
  the `postgresql` provider and models.
- `PrismaClient` is constructed with the `@prisma/adapter-pg` driver adapter
  (`src/client.ts`), which Prisma 7 requires for all databases.
- Credentials are never logged: query logging (`log: ['query', ...]`) is
  enabled only in development and Prisma does not include connection
  credentials in query logs.

## Resetting local data

```bash
docker compose down -v   # stops Postgres and deletes the data volume
docker compose up -d     # starts a clean instance
pnpm db:migrate:deploy    # reapply migrations
```
