/**
 * Prisma 7 CLI configuration.
 *
 * The Prisma CLI (generate, migrate) reads connection and schema location
 * from this file instead of a `url` field in schema.prisma.
 *
 * NDERCC-4: persistence foundation — sprint 0.
 */
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
