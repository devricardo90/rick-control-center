import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverSourceFiles, scanRepository } from './check-patterns.mjs'

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

afterEach(() => {
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
})
