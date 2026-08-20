/**
 * Narrow environment boundary for Prisma CLI configuration.
 *
 * Only DATABASE_URL may cross from the repository-root .env into the Prisma
 * process. Existing process values remain authoritative for CI and disposable
 * environments.
 */
import { fileURLToPath } from 'node:url'

import { configDotenv as loadEnv } from 'dotenv'

interface LoadPrismaDatabaseUrlOptions {
  moduleUrl?: string
  processEnv?: NodeJS.ProcessEnv
}

export function resolveRepositoryRootEnvPath(moduleUrl = import.meta.url): string {
  return fileURLToPath(new URL('../../../.env', moduleUrl))
}

export function loadPrismaDatabaseUrl(
  options: LoadPrismaDatabaseUrlOptions = {},
): void {
  const processEnv = options.processEnv ?? process.env

  if (processEnv['DATABASE_URL'] !== undefined) {
    return
  }

  const isolatedEnv: Record<string, string> = {}
  loadEnv({
    path: resolveRepositoryRootEnvPath(options.moduleUrl),
    processEnv: isolatedEnv,
    quiet: true,
  })

  const databaseUrl = isolatedEnv['DATABASE_URL']
  if (databaseUrl !== undefined) {
    processEnv['DATABASE_URL'] = databaseUrl
  }
}
