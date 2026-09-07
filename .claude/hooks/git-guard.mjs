// Claude Code PreToolUse guard for Bash: token-aware Git governance.
//
// Why this exists (NDERCC-39 / GAP-02 review finding): Claude Code permission
// rules such as `Bash(git credential:*)` match the raw command by PREFIX. Git's
// grammar is `git [global-options] <subcommand> [args]`, so `git -C . credential
// fill` begins with neither `git credential` nor `git push` and slips past every
// prefix rule. Enumerating more prefixes cannot close that class — the
// subcommand simply is not at a fixed offset.
//
// This guard therefore tokenises the command, walks Git's global options, and
// classifies the resolved subcommand. The static rules in settings.json remain
// as defence-in-depth; neither layer is claimed to be sufficient alone.
//
// Scope: this governs ordinary Claude Code execution in this project. It is not
// a defence against a machine owner who edits or disables the hook.
//
// No shebang and .mjs (not .ts): hooks are invoked as `node <path>`, and the
// sibling test imports the pure classifier through Vite. Mirrors the existing
// scripts/check-patterns.mjs convention.

import { readFileSync } from 'node:fs'

/** Git global options that consume the following argv entry as their value. */
const GLOBAL_VALUE_OPTIONS = new Set([
  '-C', '-c', '--git-dir', '--work-tree', '--namespace',
  '--exec-path', '--super-prefix', '--config-env',
])

/** Git global options that stand alone before the subcommand. */
const GLOBAL_FLAGS = new Set([
  '-p', '--paginate', '-P', '--no-pager', '--bare', '--no-replace-objects',
  '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-optional-locks', '--no-lazy-fetch', '--no-advice',
])

/** Push options that rewrite or delete remote history. Position-independent. */
const DESTRUCTIVE_PUSH_OPTIONS = new Set([
  '--force', '-f', '--force-with-lease', '--force-if-includes',
  '--mirror', '--delete', '-d', '--prune',
])

/** Long push options whose destructive form may carry an `=value` suffix. */
const DESTRUCTIVE_PUSH_PREFIXES = ['--force-with-lease=', '--force-if-includes=']

/** Short push flags that are destructive when bundled, e.g. `-fu`. */
const DESTRUCTIVE_SHORT_FLAGS = ['f', 'd']

export const Decision = {
  DENY: 'deny',
  ASK: 'ask',
  DEFER: 'defer',
}

const QUOTE_CHARS = new Set(['\'', '"'])
const OPERATOR_CHARS = new Set([';', '&', '|', '\n'])

/**
 * Splits a Bash command into argv segments, honouring quoting so an operator
 * inside a quoted string does not split the command.
 *
 * Returns `ambiguous` rather than a best guess whenever the input cannot be
 * tokenised with confidence — unbalanced quotes, or command substitution, whose
 * result this guard cannot see. Callers must fail closed on that.
 */
export function tokenizeSegments(command) {
  const state = { segments: [], current: [], token: '', quote: null, escaped: false }

  for (const char of command) {
    if (hasSubstitutionRisk(state, char)) return { ambiguous: true, reason: 'command substitution' }
    consumeCharacter(state, char)
  }

  if (state.quote !== null) return { ambiguous: true, reason: 'unbalanced quote' }
  flushToken(state)
  flushSegment(state)
  return { ambiguous: false, segments: state.segments }
}

function hasSubstitutionRisk(state, char) {
  if (state.escaped || state.quote === '\'') return false
  if (char === '`') return true
  return char === '(' && state.token.endsWith('$')
}

function consumeCharacter(state, char) {
  if (state.escaped) {
    state.token += char
    state.escaped = false
    return
  }
  if (char === '\\' && state.quote !== '\'') {
    state.escaped = true
    return
  }
  if (handleQuote(state, char)) return
  if (state.quote !== null) {
    state.token += char
    return
  }
  handleUnquoted(state, char)
}

function handleQuote(state, char) {
  if (!QUOTE_CHARS.has(char)) return false
  if (state.quote === null) {
    state.quote = char
    state.quoted = true
    return true
  }
  if (state.quote === char) {
    state.quote = null
    return true
  }
  return false
}

function handleUnquoted(state, char) {
  if (OPERATOR_CHARS.has(char)) {
    flushToken(state)
    flushSegment(state)
    return
  }
  if (char === ' ' || char === '\t' || char === '\r') {
    flushToken(state)
    return
  }
  state.token += char
}

function flushToken(state) {
  if (state.token.length > 0 || state.quoted === true) {
    state.current.push(state.token)
    state.token = ''
    state.quoted = false
  }
}

function flushSegment(state) {
  if (state.current.length > 0) {
    state.segments.push(state.current)
    state.current = []
  }
}

/** Drops leading `NAME=value` environment assignments so `FOO=bar git push` still resolves to git. */
export function stripEnvironmentAssignments(argv) {
  let index = 0
  while (index < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[index])) index += 1
  return argv.slice(index)
}

/**
 * Whether argv[0] names the Git executable. Compares the path basename rather
 * than the literal string, so `/usr/bin/git`, `C:\Program Files\Git\bin\git.exe`
 * and a bare `git` are all recognised without enumerating spellings.
 */
export function isGitExecutable(token) {
  if (typeof token !== 'string' || token.length === 0) return false
  const basename = token.split(/[/\\]/).pop() ?? ''
  return basename === 'git' || basename === 'git.exe'
}

/**
 * Walks Git's global options and returns the resolved subcommand with its own
 * argv. Returns `null` when the invocation cannot be resolved — an unknown
 * option, or no subcommand at all — so the caller fails closed.
 */
export function parseGitInvocation(argv) {
  let index = 0

  while (index < argv.length) {
    const token = argv[index]
    const step = globalOptionWidth(token)
    if (step === 0) {
      return token.startsWith('-') ? null : { subcommand: token, args: argv.slice(index + 1) }
    }
    index += step
  }

  return null
}

/** Argv entries consumed by a global option at this position: 2, 1, or 0 when it is not one. */
function globalOptionWidth(token) {
  if (GLOBAL_FLAGS.has(token)) return 1
  if (GLOBAL_VALUE_OPTIONS.has(token)) return 2
  const separator = token.indexOf('=')
  if (separator > 0 && GLOBAL_VALUE_OPTIONS.has(token.slice(0, separator))) return 1
  return 0
}

function isDestructivePushOption(arg) {
  if (DESTRUCTIVE_PUSH_OPTIONS.has(arg)) return true
  if (DESTRUCTIVE_PUSH_PREFIXES.some(prefix => arg.startsWith(prefix))) return true
  return isDestructiveShortBundle(arg)
}

/** `-fu` and friends: a bundle of short flags containing a destructive one. */
function isDestructiveShortBundle(arg) {
  if (!/^-[A-Za-z]+$/.test(arg)) return false
  return DESTRUCTIVE_SHORT_FLAGS.some(flag => arg.slice(1).includes(flag))
}

/**
 * Refspecs that delete or force-update a remote ref without any option flag:
 * `:branch` deletes, `+src:dst` forces. Detected by shape, not position.
 */
function isDestructiveRefspec(arg) {
  if (arg.startsWith('-')) return false
  if (arg.startsWith('+')) return true
  return arg.startsWith(':') && arg.length > 1
}

function classifyPush(args) {
  const destructive = args.find(arg => isDestructivePushOption(arg) || isDestructiveRefspec(arg))
  if (destructive !== undefined) {
    return { decision: Decision.DENY, reason: `destructive push argument '${destructive}'` }
  }
  return { decision: Decision.ASK, reason: 'push is a governed action (RIC-012 Phase 11)' }
}

function classifySubcommand(subcommand, args) {
  if (subcommand === 'credential' || subcommand.startsWith('credential-')) {
    return { decision: Decision.DENY, reason: `git ${subcommand} can read stored credentials` }
  }
  if (subcommand === 'push') return classifyPush(args)
  return { decision: Decision.DEFER, reason: 'not a governed git subcommand' }
}

/** Classifies one already-tokenised segment. Non-git segments defer. */
export function classifySegment(argv) {
  const command = stripEnvironmentAssignments(argv)
  if (command.length === 0 || !isGitExecutable(command[0])) {
    return { decision: Decision.DEFER, reason: 'not a git invocation' }
  }

  const invocation = parseGitInvocation(command.slice(1))
  if (invocation === null) {
    return { decision: Decision.ASK, reason: 'git invocation could not be resolved to a subcommand' }
  }

  return classifySubcommand(invocation.subcommand, invocation.args)
}

const RANK = { [Decision.DENY]: 3, [Decision.ASK]: 2, [Decision.DEFER]: 1 }

function mentionsGit(command) {
  return /(^|[^A-Za-z0-9_-])git(\.exe)?([^A-Za-z0-9_-]|$)/.test(command)
}

/**
 * Classifies a whole Bash command. The strictest outcome across all segments
 * wins, so a git operation hidden behind `echo ok && ...` is still governed.
 */
export function classifyCommand(command) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    return { decision: Decision.DEFER, reason: 'empty command' }
  }

  const tokenized = tokenizeSegments(command)
  if (tokenized.ambiguous) {
    return mentionsGit(command)
      ? { decision: Decision.ASK, reason: `git-bearing command is ambiguous (${tokenized.reason})` }
      : { decision: Decision.DEFER, reason: 'ambiguous but not git-bearing' }
  }

  return tokenized.segments
    .map(classifySegment)
    .reduce((worst, next) => (RANK[next.decision] > RANK[worst.decision] ? next : worst), {
      decision: Decision.DEFER,
      reason: 'no governed git operation',
    })
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  }
  catch {
    // No stdin attached (manual invocation, or a runtime that closed fd 0).
    // Returning empty makes main() defer rather than assert a verdict.
    return ''
  }
}

function emit(decision, reason) {
  if (decision === Decision.DEFER) return
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: `git-guard: ${reason}`,
    },
  }))
}

function main() {
  const raw = readStdin()
  let payload
  try {
    payload = JSON.parse(raw)
  }
  catch {
    // A payload this guard cannot read must not silently permit a git mutation.
    // Nothing is known about the command, so defer rather than assert a verdict
    // on a tool call that may not even be Bash.
    return
  }

  if (payload?.tool_name !== 'Bash') return
  const { decision, reason } = classifyCommand(payload?.tool_input?.command)
  emit(decision, reason)
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('git-guard.mjs')) {
  main()
}
