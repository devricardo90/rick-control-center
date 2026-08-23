#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const EXTENSION_RE = /\.(?:ts|tsx|vue)$/

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function repositoryRoot() {
  return git(process.cwd(), ['rev-parse', '--show-toplevel']).trim()
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function discoverSourceFiles(root = repositoryRoot()) {
  const repositoryRootPath = resolve(root)
  const trackedAndUntracked = git(repositoryRootPath, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])

  return trackedAndUntracked
    .split('\0')
    .filter(Boolean)
    .map(file => file.replace(/\\/g, '/'))
    .filter(file => EXTENSION_RE.test(file) && !file.endsWith('.d.ts'))
    .filter((file) => {
      // lstat, never stat: a tracked symlink must not resolve to a target outside the repository.
      const entry = lstatSync(resolve(repositoryRootPath, file), { throwIfNoEntry: false })
      return entry !== undefined && entry.isFile()
    })
    .sort(comparePaths)
}

function sourceUnits(filePath, source) {
  if (!filePath.endsWith('.vue')) {
    return [{
      source,
      lineOffset: 0,
      kind: filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    }]
  }

  const units = []
  const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRe.exec(source)) !== null) {
    const blockStart = match.index + match[0].indexOf(match[1])
    const lineOffset = source.slice(0, blockStart).split('\n').length - 1
    units.push({
      source: match[1],
      lineOffset,
      kind: /\blang=(?:["'])tsx\1/i.test(match[0]) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    })
  }
  return units
}

function violationLocation(sourceFile, position, lineOffset) {
  const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(position)
  return {
    line: lineAndCharacter.line + 1 + lineOffset,
    col: lineAndCharacter.character + 1,
  }
}

export function scanSourceFile(file, source) {
  const violations = []

  for (const unit of sourceUnits(file, source)) {
    const sourceFile = ts.createSourceFile(file, unit.source, ts.ScriptTarget.ESNext, true, unit.kind)
    const location = position => violationLocation(sourceFile, position, unit.lineOffset)

    const tsIgnoreRe = /\/\/\s*@ts-ignore/g
    let match
    while ((match = tsIgnoreRe.exec(unit.source)) !== null) {
      const tokenOffset = match[0].indexOf('@ts-ignore')
      violations.push({
        file,
        ...location(match.index + tokenOffset),
        rule: '@ts-ignore',
        text: '@ts-ignore',
      })
    }

    function visit(node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const isAsAny = node.parent?.kind === ts.SyntaxKind.AsExpression && node.parent.type === node
        if (!isAsAny) {
          violations.push({
            file,
            ...location(node.getStart(sourceFile)),
            rule: 'explicit-any',
            text: 'any',
          })
        }
      }

      if (node.kind === ts.SyntaxKind.AsExpression && node.type.kind === ts.SyntaxKind.AnyKeyword) {
        const typeStart = node.type.getStart(sourceFile)
        const asToken = /\bas\s*$/.exec(unit.source.slice(0, typeStart))
        violations.push({
          file,
          ...location(asToken ? typeStart - asToken[0].length : node.getStart(sourceFile)),
          rule: 'as-any',
          text: 'as any',
        })
      }

      if (node.kind === ts.SyntaxKind.CatchClause && node.block.statements.length === 0) {
        violations.push({
          file,
          ...location(node.getStart(sourceFile)),
          rule: 'empty-catch',
          text: 'catch {}',
        })
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }

  return violations
}

function compareViolations(left, right) {
  return comparePaths(left.file, right.file)
    || left.line - right.line
    || left.col - right.col
    || comparePaths(left.rule, right.rule)
    || comparePaths(left.text, right.text)
}

export function scanRepository(root = repositoryRoot()) {
  const repositoryRootPath = resolve(root)
  return discoverSourceFiles(repositoryRootPath)
    .flatMap(file => scanSourceFile(file, readFileSync(resolve(repositoryRootPath, file), 'utf8')))
    .sort(compareViolations)
}

export function formatViolation(violation) {
  return `${violation.file}:${violation.line}:${violation.col}  [${violation.rule}]  ${violation.text}`
}

function isMainModule() {
  return process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
}

if (isMainModule()) {
  const violations = scanRepository()

  if (violations.length === 0) {
    console.log('✓ Forbidden-pattern scan: no violations found.')
    process.exit(0)
  }

  console.error(`✗ Forbidden-pattern scan: ${violations.length} violation(s) found.\n`)
  for (const violation of violations) console.error(`  ${formatViolation(violation)}`)
  process.exit(1)
}
