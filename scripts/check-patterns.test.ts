import { execFileSync } from 'node:child_process'
import type { PathLike } from 'node:fs'
import { mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverSourceFiles, scanRepository } from './check-patterns.mjs'

interface RealpathFailure {
  readonly path: string
  readonly code: string
}

interface RealpathRedirect {
  readonly path: string
  readonly to: string
}

// Canonicalisation outcomes are injected rather than provoked. chmod/ACL tricks behave
// differently on Windows, POSIX-as-root and CI containers, and symlink creation needs a
// privilege Windows withholds by default — so a purely filesystem-based test would be
// skipped exactly where it matters. Injection makes every branch deterministic everywhere.
const realpathOverride = vi.hoisted<{
  failure: RealpathFailure | null
  redirect: RealpathRedirect | null
}>(() => ({ failure: null, redirect: null }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const realpathSyncMock = (path: PathLike): string => {
    const requested = path.toString()
    const { failure, redirect } = realpathOverride
    if (failure !== null && requested === failure.path) {
      throw Object.assign(
        new Error(`${failure.code}: injected canonicalisation failure, realpath '${requested}'`),
        { code: failure.code },
      )
    }
    if (redirect !== null && requested === redirect.path) return redirect.to
    return actual.realpathSync(path, 'utf8')
  }
  return { ...actual, realpathSync: realpathSyncMock }
})

const temporaryRoots: string[] = []

function git(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function fixture(files: Record<string, string>, commit = true) {
  const root = mkdtempSync(join(tmpdir(), 'check-patterns-'))
  temporaryRoots.push(root)
  git(root, ['init', '--initial-branch=main', '--quiet'])
  git(root, ['config', 'user.name', 'Quality Gate Test'])
  git(root, ['config', 'user.email', 'quality-gate@example.test'])
  for (const [file, contents] of Object.entries(files)) {
    const absolutePath = join(root, file)
    mkdirSync(join(absolutePath, '..'), { recursive: true })
    writeFileSync(absolutePath, contents)
  }
  if (commit) {
    git(root, ['add', '--all'])
    git(root, ['commit', '--quiet', '-m', 'fixture'])
  }
  return root
}

function canCreateSymlink() {
  const probe = mkdtempSync(join(tmpdir(), 'check-patterns-probe-'))
  try {
    writeFileSync(join(probe, 'target.ts'), 'export const value = 1')
    symlinkSync(join(probe, 'target.ts'), join(probe, 'link.ts'), 'file')
    return true
  }
  catch {
    // Any failure means the platform denies symlink creation (Windows without developer mode).
    return false
  }
  finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

const symlinkSupported = canCreateSymlink()

// A literal backslash is a legal filename character on POSIX but a separator on Windows,
// where `we\ird.ts` would become the directory `we` containing `ird.ts` instead.
const BACKSLASH_NAME = 'we\\ird.ts'

function canCreateBackslashFilename() {
  const probe = mkdtempSync(join(tmpdir(), 'check-patterns-backslash-'))
  try {
    writeFileSync(join(probe, BACKSLASH_NAME), 'export const value = 1')
    return readdirSync(probe).includes(BACKSLASH_NAME)
  }
  catch {
    // Windows rejects the name outright; the escape this guards cannot exist there.
    return false
  }
  finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

const backslashFilenameSupported = canCreateBackslashFilename()

beforeEach(() => {
  realpathOverride.failure = null
  realpathOverride.redirect = null
})

afterEach(() => {
  realpathOverride.failure = null
  realpathOverride.redirect = null
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('repository-wide forbidden-pattern discovery and diagnostics', { timeout: 30_000 }, () => {
  it('blocks explicit any', () => {
    const root = fixture({ 'src/explicit.ts': 'const value: any = 1\n' })
    expect(scanRepository(root)).toEqual([
      { file: 'src/explicit.ts', line: 1, col: 14, rule: 'explicit-any', text: 'any' },
    ])
  })

  it('blocks as any', () => {
    const root = fixture({ 'src/assertion.ts': 'const value = input as any\n' })
    expect(scanRepository(root)).toEqual([
      { file: 'src/assertion.ts', line: 1, col: 21, rule: 'as-any', text: 'as any' },
    ])
  })

  it('blocks ts-ignore', () => {
    const token = ['@ts-', 'ignore'].join('')
    const root = fixture({ 'src/ignored.ts': `// ${token}\nconst value = 1\n` })
    expect(scanRepository(root)).toEqual([
      { file: 'src/ignored.ts', line: 1, col: 4, rule: '@ts-ignore', text: '@ts-ignore' },
    ])
  })

  it('blocks empty catch', () => {
    const source = ['try { throw new Error() } catch ', '{}'].join('')
    const root = fixture({ 'src/catch.ts': source })
    expect(scanRepository(root)).toEqual([
      { file: 'src/catch.ts', line: 1, col: 27, rule: 'empty-catch', text: 'catch {}' },
    ])
  })

  it('allows compliant TS, TSX and Vue script sources', () => {
    const root = fixture({
      'src/compliant.ts': `const value: string = 'ok'\n`,
      'src/view.tsx': `export const View = () => <div />\n`,
      'src/component.vue': `<script setup lang="ts">\nconst value: string = 'ok'\n</script>\n`,
    })
    expect(scanRepository(root)).toEqual([])
  })

  it('discovers root configs and future authored directories without an allowlist', () => {
    const root = fixture({
      'vitest.config.ts': 'export default {}\n',
      'future/source/new-file.ts': 'export const value = 1\n',
    })
    expect(discoverSourceFiles(root)).toEqual([
      'future/source/new-file.ts',
      'vitest.config.ts',
    ])
  })

  it('excludes ignored artifacts and declaration files', () => {
    const root = fixture({
      '.gitignore': 'generated/\nvendor/\ndist/\n.output/\n.worktrees/\n',
      'types.d.ts': 'declare const value: any\n',
      'src/authored.ts': 'export const value = 1\n',
      'generated/generated.ts': 'const value: any = 1\n',
      'vendor/vendor.ts': 'const value: any = 1\n',
      'dist/build.ts': 'const value: any = 1\n',
      '.output/output.ts': 'const value: any = 1\n',
      '.worktrees/local.ts': 'const value: any = 1\n',
    })
    expect(discoverSourceFiles(root)).toEqual(['src/authored.ts'])
    expect(scanRepository(root)).toEqual([])
  })

  it('sorts discovery and diagnostics deterministically', () => {
    const root = fixture({
      'z.ts': 'const z: any = 1\n',
      'a.ts': 'const a = value as any\n',
      'm.ts': 'const m: any = 1\n',
    })
    const first = scanRepository(root)
    const second = scanRepository(root)
    expect(discoverSourceFiles(root)).toEqual(['a.ts', 'm.ts', 'z.ts'])
    expect(first).toEqual(second)
    expect(first.map(({ file, line, col, rule, text }) => ({ file, line, col, rule, text }))).toEqual([
      { file: 'a.ts', line: 1, col: 17, rule: 'as-any', text: 'as any' },
      { file: 'm.ts', line: 1, col: 10, rule: 'explicit-any', text: 'any' },
      { file: 'z.ts', line: 1, col: 10, rule: 'explicit-any', text: 'any' },
    ])
  })

  it.skipIf(!symlinkSupported)('excludes tracked symlinks instead of scanning their external target', () => {
    const outside = mkdtempSync(join(tmpdir(), 'check-patterns-external-'))
    temporaryRoots.push(outside)
    writeFileSync(join(outside, 'external.ts'), 'const escaped: any = 1\n')

    const root = fixture({ 'src/authored.ts': 'export const value = 1\n' }, false)
    symlinkSync(join(outside, 'external.ts'), join(root, 'linked.ts'), 'file')
    git(root, ['add', '--all'])
    git(root, ['commit', '--quiet', '-m', 'fixture'])

    expect(git(root, ['ls-files']).split('\n')).toContain('linked.ts')
    expect(discoverSourceFiles(root)).toEqual(['src/authored.ts'])
    expect(scanRepository(root)).toEqual([])
  })
})

describe('repository-authored filesystem boundary', { timeout: 30_000 }, () => {
  it.skipIf(!backslashFilenameSupported)('scans a tracked filename containing a literal backslash', () => {
    const root = fixture({
      'src/authored.ts': 'export const value = 1\n',
      [BACKSLASH_NAME]: 'const value: any = 1\n',
    })

    // Git emits the name verbatim under -z; rewriting the backslash to a separator would
    // point at a path that does not exist and silently drop the file from the gate.
    expect(git(root, ['ls-files', '-z']).split('\0').filter(Boolean)).toContain(BACKSLASH_NAME)
    expect(discoverSourceFiles(root)).toContain(BACKSLASH_NAME)
    expect(scanRepository(root)).toEqual([
      { file: BACKSLASH_NAME, line: 1, col: 14, rule: 'explicit-any', text: 'any' },
    ])
  })

  it.skipIf(!symlinkSupported)('rejects a path escaping through a symlinked intermediate directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'check-patterns-external-'))
    temporaryRoots.push(outside)
    writeFileSync(join(outside, 'escaped.ts'), 'const escaped: any = 1\n')

    const root = fixture({
      'authored.ts': 'export const value = 1\n',
      'pkg/escaped.ts': 'export const clean = 1\n',
    })
    // lstat only refuses the final component, so the escape is mounted one level up.
    rmSync(join(root, 'pkg'), { recursive: true, force: true })
    symlinkSync(outside, join(root, 'pkg'), 'dir')

    expect(git(root, ['ls-files']).split('\n')).toContain('pkg/escaped.ts')
    expect(discoverSourceFiles(root)).toEqual(['authored.ts'])
    expect(scanRepository(root)).toEqual([])
  })

  it('excludes deleted-but-tracked files without crashing', () => {
    const root = fixture({
      'src/kept.ts': 'export const value = 1\n',
      'src/gone.ts': 'const value: any = 1\n',
    })
    rmSync(join(root, 'src', 'gone.ts'))

    expect(git(root, ['ls-files']).split('\n')).toContain('src/gone.ts')
    expect(discoverSourceFiles(root)).toEqual(['src/kept.ts'])
    expect(scanRepository(root)).toEqual([])
  })

  it.skipIf(!symlinkSupported)('rejects a sibling directory whose path shares the repository-root prefix', () => {
    const root = fixture({
      'authored.ts': 'export const value = 1\n',
      'pkg/escaped.ts': 'export const clean = 1\n',
    })

    // A literal sibling, not merely a nearby directory: `<root>` and `<root>-external`
    // share a complete string prefix, which is the exact shape naive containment accepts.
    const external = `${root}-external`
    temporaryRoots.push(external)
    mkdirSync(external, { recursive: true })
    writeFileSync(join(external, 'escaped.ts'), 'const escaped: any = 1\n')

    // Routed through an intermediate symlink, so lstat on the final component cannot catch it.
    rmSync(join(root, 'pkg'), { recursive: true, force: true })
    symlinkSync(external, join(root, 'pkg'), 'dir')

    const canonicalRoot = realpathSync(root)
    const canonicalEscaped = realpathSync(join(root, 'pkg', 'escaped.ts'))

    // Precondition, asserted rather than assumed: this fixture only proves anything if a
    // naive `candidate.startsWith(root)` check WOULD wrongly accept the escaped path.
    expect(canonicalEscaped.startsWith(canonicalRoot)).toBe(true)

    expect(git(root, ['ls-files']).split('\n')).toContain('pkg/escaped.ts')
    expect(discoverSourceFiles(root)).toEqual(['authored.ts'])
    expect(scanRepository(root)).toEqual([])
  })
})

describe('candidate canonicalisation failure policy', { timeout: 30_000 }, () => {
  it('tolerates a candidate deleted between lstat and canonicalisation', () => {
    const root = fixture({
      'src/kept.ts': 'export const value = 1\n',
      'src/racy.ts': 'const value: any = 1\n',
    })
    realpathOverride.failure = { path: resolve(root, 'src/racy.ts'), code: 'ENOENT' }

    // The deletion race is the one benign case: lstat already confirmed a regular file, so
    // ENOENT here means it vanished in between and there is nothing left to scan.
    expect(discoverSourceFiles(root)).toEqual(['src/kept.ts'])
    expect(scanRepository(root)).toEqual([])
  })

  it('rejects a canonical path in a sibling directory sharing the repository-root prefix', () => {
    const root = fixture({
      'authored.ts': 'export const value = 1\n',
      'pkg/escaped.ts': 'const escaped: any = 1\n',
    })
    const canonicalRoot = realpathSync(root)

    // Exactly what an intermediate symlink to `<root>-external` canonicalises to. Injected so
    // the sibling-prefix escape is still covered on platforms that cannot create symlinks —
    // the symlink-driven twin of this case lives in the filesystem-boundary suite above.
    const escapedCanonical = join(`${canonicalRoot}-external`, 'escaped.ts')
    realpathOverride.redirect = { path: resolve(root, 'pkg/escaped.ts'), to: escapedCanonical }

    // Precondition, asserted rather than assumed: this fixture only proves anything if a
    // naive `candidate.startsWith(root)` check WOULD wrongly accept the escaped path.
    expect(escapedCanonical.startsWith(canonicalRoot)).toBe(true)

    expect(git(root, ['ls-files']).split('\n')).toContain('pkg/escaped.ts')
    expect(discoverSourceFiles(root)).toEqual(['authored.ts'])
    expect(scanRepository(root)).toEqual([])
  })

  it.each(['EACCES', 'ELOOP', 'ENAMETOOLONG', 'EMFILE', 'ENFILE', 'EPERM', 'EUNKNOWNFAILURE'])(
    'fails closed when canonicalising a confirmed authored file fails with %s',
    (code) => {
      const root = fixture({
        'src/kept.ts': 'export const value = 1\n',
        'src/unreadable.ts': 'const value: any = 1\n',
      })
      realpathOverride.failure = { path: resolve(root, 'src/unreadable.ts'), code }

      // Swallowing this would drop a confirmed authored file from a mandatory gate, so the
      // gate would pass by scanning less than it should. It must fail the run instead.
      expect(() => discoverSourceFiles(root)).toThrowError(new RegExp(code))
      expect(() => scanRepository(root)).toThrowError(new RegExp(code))
    },
  )
})
