/**
 * Test-only helpers for @rick/database integration tests.
 * Not exported from the package's public surface (src/index.ts).
 *
 * Tests run against a real, disposable local PostgreSQL instance — no
 * table truncation between tests, since vitest runs test files in
 * parallel against the same database. Every test scopes its assertions
 * to rows it creates under a unique random key/name.
 *
 * NDERCC-5: initial domain and persistence model.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

function requireTestDatabaseUrl(): string {
  const url = process.env['DATABASE_URL']

  if (!url) {
    throw new Error(
      'DATABASE_URL is required to run @rick/database integration tests. '
      + 'Start the local Postgres (docker compose up -d) and set DATABASE_URL.',
    )
  }

  return url
}

export function createTestClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requireTestDatabaseUrl() })
  return new PrismaClient({ adapter })
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── P0-042 isolated database guard (RIC-SPEC-NDERCC-39-001 §9/§15) ───────────
//
// Narrow and specific to the P0-042 test target, on purpose: this is not a
// generic database-security framework. It exists to make it structurally
// impossible for a P0-042 integration/concurrency test to run its
// destructive operations against 127.0.0.1:5455/rick_dev (the shared
// development instance every other test file in this package legitimately
// targets through `createTestClient` above, which this guard never touches).

/** The exact, non-configurable P0-042 isolated test target — client port 5456 maps to the container's internal port 5432; see the SDD §15 reconciliation. */
export const P042_ISOLATED_DATABASE_TARGET = {
  host: '127.0.0.1',
  port: '5456',
  database: 'rick_p042_test',
  schema: 'public',
} as const

/** A redacted form of a connection URL safe to include in an error message — credentials are never echoed back. */
function redactDatabaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/\/[^/@]*@/, '//***@')
}

/**
 * Non-throwing check: does this URL point at exactly the P0-042 isolated
 * target? Used to decide, before any client is constructed, whether the
 * current process is even running against the isolated instance — so a
 * plain `pnpm test`/`pnpm validate` run against the shared development
 * database can skip the P0-042 integration suite instead of failing on it.
 */
export function isIsolatedP042DatabaseUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  }
  catch {
    return false
  }
  const database = parsed.pathname.replace(/^\//, '')
  const schema = parsed.searchParams.get('schema')
  return (
    parsed.hostname === P042_ISOLATED_DATABASE_TARGET.host
    && parsed.port === P042_ISOLATED_DATABASE_TARGET.port
    && database === P042_ISOLATED_DATABASE_TARGET.database
    && schema === P042_ISOLATED_DATABASE_TARGET.schema
  )
}

/**
 * Fail-closed guard: returns the URL unchanged when it is exactly the P0-042
 * isolated target, and throws otherwise — including for the development
 * target (127.0.0.1:5455 / rick_dev), any other host, port, database or
 * schema, and a malformed URL. Must be called before constructing any
 * Prisma/pg client a P0-042 test will use for a destructive or
 * state-mutating operation.
 */
export function requireIsolatedP042DatabaseUrl(rawUrl: string): string {
  if (!isIsolatedP042DatabaseUrl(rawUrl)) {
    const target = P042_ISOLATED_DATABASE_TARGET
    throw new Error(
      `P0-042 tests must target exactly ${target.host}:${target.port}/${target.database}?schema=${target.schema}; `
      + `refusing to run against '${redactDatabaseUrl(rawUrl)}'. Development targets (127.0.0.1:5455, rick_dev) `
      + 'are never valid for P0-042.',
    )
  }
  return rawUrl
}

/**
 * A Prisma client bound to the P0-042 isolated instance only. Reads the same
 * `DATABASE_URL` `createTestClient` reads — the isolation comes from which
 * value that variable is set to for the process running these tests, per
 * the SDD's `databaseUrlStrategy` — but never constructs a client unless
 * `requireIsolatedP042DatabaseUrl` has verified the exact target first.
 */
export function createP042TestClient(): PrismaClient {
  const verifiedUrl = requireIsolatedP042DatabaseUrl(requireTestDatabaseUrl())
  const adapter = new PrismaPg({ connectionString: verifiedUrl })
  return new PrismaClient({ adapter })
}
