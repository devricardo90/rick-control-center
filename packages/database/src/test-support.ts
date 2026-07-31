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
