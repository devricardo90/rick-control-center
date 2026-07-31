/**
 * PrismaClient singleton for the RICK Control Center.
 *
 * Instantiates once per process to avoid exhausting the connection pool in
 * development (Nuxt HMR re-evaluates modules on every file change).
 *
 * NDERCC-4: persistence foundation — sprint 0.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

function requireDatabaseUrl(): string {
  const url: string | undefined = process.env['DATABASE_URL']

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure it.',
    )
  }

  return url
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() })

  return new PrismaClient({
    adapter,
    log: process.env['NODE_ENV'] === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  })
}

// In production, always create a fresh client.
// In development, reuse the client attached to globalThis to survive HMR.
const globalForPrisma = globalThis as typeof globalThis & {
  __rickPrisma?: PrismaClient
}

export const prisma: PrismaClient =
  globalForPrisma['__rickPrisma'] ?? createPrismaClient()

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma['__rickPrisma'] = prisma
}
