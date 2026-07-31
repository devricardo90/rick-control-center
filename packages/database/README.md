# @rick/database

PostgreSQL persistence foundation for RICK Control Center, built on Prisma 7.
Sprint 0 — NDERCC-4 / RIC-S0-03. No domain models yet; see NDERCC-5 for
`Project` and `IntegrationConnection`.

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
