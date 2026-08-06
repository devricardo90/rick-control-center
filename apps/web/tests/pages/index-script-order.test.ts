/**
 * Regression guard for NDERCC-11's corrective fix: `pages/index.vue`
 * declares a `watch(selectedProjectId, ..., { immediate: true })`. Because
 * `immediate: true` invokes the callback synchronously during
 * `<script setup>` execution — while `selectedProjectId` is still its
 * initial `null` — any `const`/`reactive` ref the callback dereferences via
 * `.value` must already be declared *above* the watcher, or it is in the
 * temporal dead zone and throws `ReferenceError` on every page load.
 *
 * `@nuxt/test-utils` full component mounting is not used here: mounting
 * this page requires Nuxt's dev/build pipeline to resolve its auto-imports
 * (`useFetch`, `useRequestHeaders`, and the page's own `utils/*` helpers),
 * which is disproportionately slow in this environment (~240s default
 * setup timeout on Windows) for a single ordering invariant. This test
 * instead parses the actual script-setup source and asserts the ordering
 * invariant directly, statically, and deterministically. It is
 * intentionally paired with a real page-render smoke test against the
 * built application (see NDERCC-11 evidence) rather than replacing one.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const PAGE_PATH = fileURLToPath(new URL('../../pages/index.vue', import.meta.url))

function extractScriptSetupContent(source: string): string {
  const match = /<script setup[^>]*>([\s\S]*?)<\/script>/.exec(source)
  if (!match?.[1]) {
    throw new Error('index.vue has no <script setup> block to analyze.')
  }
  return match[1]
}

function extractImmediateWatchCall(script: string, watchedSource: string): string {
  const callStart = script.indexOf(`watch(${watchedSource},`)
  if (callStart === -1) {
    throw new Error(`No watch(${watchedSource}, ...) call found in index.vue.`)
  }

  let depth = 0
  let cursor = callStart + `watch(`.length - 1
  do {
    const char = script[cursor]
    if (char === '(') {
      depth += 1
    }
    else if (char === ')') {
      depth -= 1
    }
    cursor += 1
  } while (depth > 0 && cursor < script.length)

  return script.slice(callStart, cursor)
}

function collectRefValueNames(callText: string): string[] {
  const names = new Set<string>()
  for (const match of callText.matchAll(/\b([a-zA-Z_][\w]*)\.value\b/g)) {
    const name = match[1]
    if (name) {
      names.add(name)
    }
  }
  return [...names]
}

describe('pages/index.vue — immediate-watcher initialization order', () => {
  const source = readFileSync(PAGE_PATH, 'utf-8')
  const script = extractScriptSetupContent(source)
  const watchCall = extractImmediateWatchCall(script, 'selectedProjectId')

  it('is registered with { immediate: true } (guarding the premise of this test)', () => {
    expect(watchCall).toContain('{ immediate: true }')
  })

  it('only dereferences .value refs that are declared before the watcher runs', () => {
    const watcherStart = script.indexOf(watchCall)
    const referencedRefs = collectRefValueNames(watchCall)

    expect(referencedRefs.length).toBeGreaterThan(0)

    for (const refName of referencedRefs) {
      const declarationPattern = new RegExp(`const ${refName} = (ref|reactive)(<[^>]*>)?\\(`)
      const declarationMatch = declarationPattern.exec(script)

      expect(
        declarationMatch,
        `expected a "const ${refName} = ref(...)" or "reactive(...)" declaration in index.vue`,
      ).not.toBeNull()

      const declarationIndex = declarationMatch?.index ?? Number.POSITIVE_INFINITY
      expect(
        declarationIndex,
        `"${refName}" must be declared before the immediate watch(selectedProjectId, ...) callback that reads "${refName}.value", `
        + 'otherwise it is in the temporal dead zone when the callback runs synchronously at setup time (NDERCC-11 corrective fix).',
      ).toBeLessThan(watcherStart)
    }
  })
})
