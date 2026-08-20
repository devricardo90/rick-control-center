import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadPrismaDatabaseUrl,
  resolveRepositoryRootEnvPath,
} from './prisma-env.js'

const temporaryRoots: string[] = []

interface EnvFixture {
  moduleUrl: string
  unrelatedCwd: string
}

async function createEnvFixture(databaseUrl: string): Promise<EnvFixture> {
  const root = await mkdtemp(join(tmpdir(), 'rick-prisma-env-'))
  temporaryRoots.push(root)

  const modulePath = join(root, 'packages', 'database', 'src', 'prisma-env.ts')
  const unrelatedCwd = join(root, 'unrelated-cwd')
  await mkdir(dirname(modulePath), { recursive: true })
  await mkdir(unrelatedCwd)
  await writeFile(
    join(root, '.env'),
    `DATABASE_URL="${databaseUrl}"\nUNRELATED_SECRET="must-not-cross"\n`,
    'utf8',
  )

  return { moduleUrl: pathToFileURL(modulePath).href, unrelatedCwd }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryRoots.splice(0).map(root => rm(root, {
    recursive: true,
    force: true,
  })))
})

describe('Prisma DATABASE_URL environment boundary', () => {
  it('resolves the real repository-root .env from the ESM module URL', () => {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url))
    const expectedPath = resolve(sourceDirectory, '../../../.env')

    expect(resolveRepositoryRootEnvPath()).toBe(expectedPath)
  })

  it('loads only DATABASE_URL from the root fixture regardless of cwd', async () => {
    const fixtureUrl = 'postgresql://fixture:fixture@localhost:5999/fixture'
    const fixture = await createEnvFixture(fixtureUrl)
    const targetEnv: NodeJS.ProcessEnv = {}
    const originalCwd = process.cwd()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      process.chdir(fixture.unrelatedCwd)
      loadPrismaDatabaseUrl({
        moduleUrl: fixture.moduleUrl,
        processEnv: targetEnv,
      })
    }
    finally {
      process.chdir(originalCwd)
    }

    expect(targetEnv).toEqual({ DATABASE_URL: fixtureUrl })
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('preserves an externally supplied DATABASE_URL', async () => {
    const fixture = await createEnvFixture('postgresql://root-env/ignored')
    const externalUrl = 'postgresql://ci:ci@localhost:6000/disposable'
    const targetEnv: NodeJS.ProcessEnv = { DATABASE_URL: externalUrl }

    loadPrismaDatabaseUrl({
      moduleUrl: fixture.moduleUrl,
      processEnv: targetEnv,
    })

    expect(targetEnv).toEqual({ DATABASE_URL: externalUrl })
  })
})
