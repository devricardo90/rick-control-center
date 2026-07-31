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

## Running tests

Unit tests (`health.test.ts`) run against a mocked client. The domain
persistence tests (`project.test.ts`, `integration-connection.test.ts`) are
**integration tests that require a real, running PostgreSQL instance** with
`DATABASE_URL` set — database-enforced constraints (key uniqueness,
foreign-key integrity, delete-restrict behavior) cannot be proven with
mocks. Start Docker Compose and apply migrations before running
`pnpm test`; CI provisions its own disposable PostgreSQL service for the
same reason (see `.github/workflows/ci.yml`).

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
