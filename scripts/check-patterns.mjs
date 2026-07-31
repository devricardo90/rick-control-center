#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.nuxt', '.output'])
const SCAN_DIRS = [
  join(ROOT, 'packages', 'shared', 'src'),
  join(ROOT, 'packages', 'domain', 'src'),
  join(ROOT, 'packages', 'application', 'src'),
  join(ROOT, 'packages', 'database', 'src'),
  join(ROOT, 'apps', 'web'),
]

function collectSourceFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) results.push(...collectSourceFiles(full))
    }
    else if (/\.(?:ts|tsx|vue)$/.test(entry) && !entry.endsWith('.d.ts')) {
      results.push(full)
    }
  }
  return results
}

function sourceUnits(filePath, source) {
  if (!filePath.endsWith('.vue')) return [{ source, lineOffset: 0, kind: filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS }]

  const units = []
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRe.exec(source)) !== null) {
    const blockStart = match.index + match[0].indexOf(match[1])
    const lineOffset = source.slice(0, blockStart).split('\n').length - 1
    units.push({ source: match[1], lineOffset, kind: /\blang=(?:["'])tsx\1/i.test(match[0]) ? ts.ScriptKind.TSX : ts.ScriptKind.TS })
  }
  return units
}

const violations = []

for (const filePath of SCAN_DIRS.flatMap(collectSourceFiles)) {
  const fileSource = readFileSync(filePath, 'utf8')
  const rel = relative(ROOT, filePath).replace(/\\/g, '/')

  for (const unit of sourceUnits(filePath, fileSource)) {
    const sf = ts.createSourceFile(filePath, unit.source, ts.ScriptTarget.ESNext, true, unit.kind)
    const location = (pos) => {
      const lc = sf.getLineAndCharacterOfPosition(pos)
      return { line: lc.line + 1 + unit.lineOffset, col: lc.character + 1 }
    }

    const tsIgnoreRe = /\/\/\s*@ts-ignore/g
    let match
    while ((match = tsIgnoreRe.exec(unit.source)) !== null) {
      violations.push({ file: rel, ...location(match.index), rule: '@ts-ignore', text: match[0].trim() })
    }

    function visit(node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const isAsAny = node.parent?.kind === ts.SyntaxKind.AsExpression && node.parent.type === node
        if (!isAsAny) violations.push({ file: rel, ...location(node.getStart(sf)), rule: 'explicit-any', text: ': any' })
      }
      if (node.kind === ts.SyntaxKind.AsExpression && node.type.kind === ts.SyntaxKind.AnyKeyword) {
        violations.push({ file: rel, ...location(node.getStart(sf)), rule: 'as-any', text: 'as any' })
      }
      if (node.kind === ts.SyntaxKind.CatchClause && node.block.statements.length === 0) {
        violations.push({ file: rel, ...location(node.getStart(sf)), rule: 'empty-catch', text: 'catch { }' })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}

if (violations.length === 0) {
  console.log('✓ Forbidden-pattern scan: no violations found.')
  process.exit(0)
}

console.error(`✗ Forbidden-pattern scan: ${violations.length} violation(s) found.\n`)
for (const violation of violations) {
  console.error(`  ${violation.file}:${violation.line}:${violation.col}  [${violation.rule}]  ${violation.text}`)
}
process.exit(1)
