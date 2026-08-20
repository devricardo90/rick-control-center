/**
 * Prisma 7 CLI configuration.
 *
 * Loads DATABASE_URL from the repository-root .env so Prisma commands
 * behave consistently regardless of the workspace package cwd.
 *
 * NDERCC-4: persistence foundation — sprint 0.
 */
import { defineConfig, env } from 'prisma/config'
import { loadPrismaDatabaseUrl } from './src/prisma-env.js'

loadPrismaDatabaseUrl()

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
