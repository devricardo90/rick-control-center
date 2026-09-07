/**
 * Tests for the NDERCC-39 PreToolUse Git guard.
 *
 * These exercise the pure classifier only. Nothing here runs git, reaches a
 * network, or touches a credential helper — the point of the guard is that such
 * commands are refused, so proving it must never require performing one.
 *
 * The DENY cases below are the exact invocations raised by the PR #23 review
 * finding: Git accepts `git [global-options] <subcommand>`, so the subcommand is
 * not at a fixed offset and prefix matching cannot see it.
 */
import { describe, expect, it } from 'vitest'
import { classifyCommand, classifySegment, isGitExecutable, parseGitInvocation, stripEnvironmentAssignments, tokenizeSegments } from './git-guard.mjs'

/** Reads the decision without trusting the shape, so a contract change fails loudly here rather than silently weakening an assertion. */
function decisionOf(command: string): string {
  const result: unknown = classifyCommand(command)
  if (typeof result !== 'object' || result === null || !('decision' in result)) {
    throw new Error('classifyCommand must return an object carrying a decision')
  }
  const { decision } = result as { decision: unknown }
  if (typeof decision !== 'string') throw new Error('decision must be a string')
  return decision
}

describe('credential extraction is denied regardless of global options', () => {
  it.each([
    ['bare', 'git credential fill'],
    ['-C', 'git -C . credential fill'],
    ['--git-dir=', 'git --git-dir=.git credential fill'],
    ['--git-dir separate', 'git --git-dir .git credential fill'],
    ['--work-tree=', 'git --work-tree=. credential fill'],
    ['-c config', 'git -c foo=bar credential fill'],
    ['combined options', 'git -C . -c a=b --git-dir=.git credential fill'],
    ['flag then option', 'git --no-pager -C . credential fill'],
    ['helper subcommand', 'git credential-manager get'],
    ['absolute path', '/usr/bin/git -C . credential fill'],
    ['windows exe', 'git.exe --git-dir=.git credential fill'],
  ])('denies %s', (_label, command) => {
    expect(decisionOf(command)).toBe('deny')
  })
})

describe('destructive push is denied regardless of argument position', () => {
  it.each([
    ['--force before args', 'git push --force origin main'],
    ['--force after positional args', 'git push origin main --force'],
    ['-f short', 'git push -f origin main'],
    ['bundled short flags', 'git push -fu origin main'],
    ['--force-with-lease', 'git push --force-with-lease origin main'],
    ['--force-with-lease=value', 'git push --force-with-lease=main origin main'],
    ['--force-if-includes', 'git push --force-if-includes origin main'],
    ['--delete', 'git push --delete origin feat/x'],
    ['-d short', 'git push -d origin feat/x'],
    ['--mirror', 'git push --mirror origin'],
    ['--prune', 'git push --prune origin'],
    ['deletion refspec', 'git push origin :refs/heads/gone'],
    ['forced refspec', 'git push origin +refs/heads/main:refs/heads/main'],
    ['global option then force', 'git -C . push --force origin main'],
    ['global option then trailing force', 'git -C /repo push origin main --force'],
  ])('denies %s', (_label, command) => {
    expect(decisionOf(command)).toBe('deny')
  })
})

describe('ordinary push asks rather than silently proceeding', () => {
  it.each([
    ['plain', 'git push origin HEAD'],
    ['with -C', 'git -C . push origin HEAD'],
    ['no arguments', 'git push'],
    ['upstream flag', 'git push --set-upstream origin feat/x'],
    ['env prefix', 'FOO=bar git push origin HEAD'],
    ['quoted remote', 'git push "origin" HEAD'],
  ])('asks for %s', (_label, command) => {
    expect(decisionOf(command)).toBe('ask')
  })
})

describe('git operations hidden inside compound commands are still governed', () => {
  it('governs a push after &&', () => {
    expect(decisionOf('echo ok && git push origin HEAD')).toBe('ask')
  })

  it('governs a push after cd &&', () => {
    expect(decisionOf('cd repo && git -C . push origin HEAD')).toBe('ask')
  })

  it('denies credential access after &&', () => {
    expect(decisionOf('echo ok && git -C . credential fill')).toBe('deny')
  })

  it('denies a force push after a semicolon', () => {
    expect(decisionOf('pnpm test ; git push --force origin main')).toBe('deny')
  })

  it('denies a force push behind a pipe', () => {
    expect(decisionOf('echo x | git push --force origin main')).toBe('deny')
  })

  it('takes the strictest decision when several git operations appear', () => {
    expect(decisionOf('git push origin HEAD && git credential fill')).toBe('deny')
  })
})

describe('ambiguity fails closed, never to allow', () => {
  it.each([
    ['command substitution $()', 'git $(echo push) origin HEAD'],
    ['backtick substitution', 'git `echo push` origin HEAD'],
    ['unbalanced quote', 'git push "origin'],
    ['unknown leading option', 'git --not-a-real-global-option push origin main'],
    ['no subcommand', 'git -C .'],
  ])('asks for %s', (_label, command) => {
    expect(decisionOf(command)).toBe('ask')
  })

  it('never returns allow for any git-bearing command', () => {
    const commands = [
      'git credential fill',
      'git -C . push --force origin main',
      'git $(echo push)',
      'git push origin HEAD',
      'git --git-dir=.git credential fill',
    ]
    for (const command of commands) {
      expect(decisionOf(command)).not.toBe('allow')
      expect(decisionOf(command)).not.toBe('defer')
    }
  })
})

describe('non-governed commands defer to the existing permission rules', () => {
  it.each([
    ['git status', 'git status'],
    ['git add', 'git add -A'],
    ['git fetch', 'git fetch origin'],
    ['git log', 'git -C . log --oneline'],
    ['non-git command', 'pnpm test'],
    ['git word inside a quoted string', 'echo "git push --force"'],
    ['empty command', '   '],
  ])('defers %s', (_label, command) => {
    expect(decisionOf(command)).toBe('defer')
  })
})

describe('executable recognition compares the basename, not the literal string', () => {
  it.each(['git', 'git.exe', '/usr/bin/git', 'C:\\Program Files\\Git\\bin\\git.exe'])(
    'recognises %s',
    (token) => {
      expect(isGitExecutable(token)).toBe(true)
    },
  )

  it.each(['gitk', 'git-lfs', 'legit', '', 'nodegit'])('rejects %s', (token) => {
    expect(isGitExecutable(token)).toBe(false)
  })
})

describe('git global option parsing resolves the real subcommand', () => {
  it('walks past value-taking options', () => {
    const parsed: unknown = parseGitInvocation(['-C', '.', '-c', 'a=b', 'push', 'origin', 'main'])
    expect(parsed).toMatchObject({ subcommand: 'push', args: ['origin', 'main'] })
  })

  it('walks past inline =value options', () => {
    const parsed: unknown = parseGitInvocation(['--git-dir=.git', 'credential', 'fill'])
    expect(parsed).toMatchObject({ subcommand: 'credential', args: ['fill'] })
  })

  it('returns null for an unknown option so the caller fails closed', () => {
    expect(parseGitInvocation(['--unknown-option', 'push'])).toBeNull()
  })

  it('returns null when no subcommand is present', () => {
    expect(parseGitInvocation(['-C', '.'])).toBeNull()
  })
})

describe('supporting helpers', () => {
  it('strips leading environment assignments', () => {
    expect(stripEnvironmentAssignments(['A=1', 'B=2', 'git', 'push'])).toEqual(['git', 'push'])
  })

  it('leaves a command with no assignments untouched', () => {
    expect(stripEnvironmentAssignments(['git', 'push'])).toEqual(['git', 'push'])
  })

  it('splits compound commands into segments', () => {
    const result: unknown = tokenizeSegments('echo ok && git push origin HEAD')
    expect(result).toMatchObject({
      ambiguous: false,
      segments: [['echo', 'ok'], ['git', 'push', 'origin', 'HEAD']],
    })
  })

  it('does not split on an operator inside quotes', () => {
    const result: unknown = tokenizeSegments('echo "a && b"')
    expect(result).toMatchObject({ ambiguous: false, segments: [['echo', 'a && b']] })
  })

  it('reports ambiguity rather than guessing', () => {
    expect(tokenizeSegments('git push "unterminated')).toMatchObject({ ambiguous: true })
  })

  it('classifies a segment that is not git as defer', () => {
    expect(classifySegment(['pnpm', 'test'])).toMatchObject({ decision: 'defer' })
  })
})
