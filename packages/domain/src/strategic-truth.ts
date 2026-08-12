export const STRATEGIC_TRUTH_EXTRACTOR_VERSION = 'p0-022-v1' as const

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits))
}

type Sha256State = [number, number, number, number, number, number, number, number]

function compressSha256Block(view: DataView, offset: number, initial: Sha256State): Sha256State {
  const words = new Uint32Array(64)
  for (let index = 0; index < 16; index += 1) {
    words[index] = view.getUint32(offset + index * 4)
  }
  for (let index = 16; index < 64; index += 1) {
    const a = words[index - 15] ?? 0
    const b = words[index - 2] ?? 0
    const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3)
    const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10)
    words[index] = ((words[index - 16] ?? 0) + s0 + (words[index - 7] ?? 0) + s1) >>> 0
  }
  let [a, b, c, d, e, f, g, h] = initial
  for (let index = 0; index < 64; index += 1) {
    const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
    const choose = (e & f) ^ (~e & g)
    const temp1 = (h + s1 + choose + (SHA256_CONSTANTS[index] ?? 0) + (words[index] ?? 0)) >>> 0
    const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
    const majority = (a & b) ^ (a & c) ^ (b & c)
    const temp2 = (s0 + majority) >>> 0
    h = g
    g = f
    f = e
    e = (d + temp1) >>> 0
    d = c
    c = b
    b = a
    a = (temp1 + temp2) >>> 0
  }
  return [
    (initial[0] + a) >>> 0,
    (initial[1] + b) >>> 0,
    (initial[2] + c) >>> 0,
    (initial[3] + d) >>> 0,
    (initial[4] + e) >>> 0,
    (initial[5] + f) >>> 0,
    (initial[6] + g) >>> 0,
    (initial[7] + h) >>> 0,
  ]
}

function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const bitLength = bytes.length * 8
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 4, bitLength >>> 0)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))

  let state: Sha256State = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  for (let offset = 0; offset < padded.length; offset += 64) {
    state = compressSha256Block(view, offset, state)
  }
  return state
    .map(item => item.toString(16).padStart(8, '0'))
    .join('')
}

export const RequirementType = {
  FUNCTIONAL: 'FUNCTIONAL',
  NON_FUNCTIONAL: 'NON_FUNCTIONAL',
  CONSTRAINT: 'CONSTRAINT',
} as const
export type RequirementType = typeof RequirementType[keyof typeof RequirementType]

export const RequirementPriority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  UNSPECIFIED: 'UNSPECIFIED',
} as const
export type RequirementPriority = typeof RequirementPriority[keyof typeof RequirementPriority]

export const RequirementStatus = {
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
} as const
export type RequirementStatus = typeof RequirementStatus[keyof typeof RequirementStatus]

export const DecisionStatus = {
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
} as const
export type DecisionStatus = typeof DecisionStatus[keyof typeof DecisionStatus]

export interface StrategicSourceLocator {
  readonly kind: 'REQUIREMENT' | 'CONSTRAINT' | 'DECISION'
  readonly sectionKey: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly ordinal: number
}

export type ExtractionDiagnosticSeverity = 'WARNING' | 'ERROR'

export type ExtractionDiagnosticCode =
  | 'UNSUPPORTED_STRUCTURE'
  | 'AMBIGUOUS_REQUIREMENT'
  | 'INVALID_PRIORITY'
  | 'DUPLICATE_REQUIREMENT_CODE'
  | 'AMBIGUOUS_DECISION'
  | 'INVALID_DECISION_STATUS'
  | 'DUPLICATE_DECISION_CODE'
  | 'SOURCE_CONFLICT'
  | 'DECISION_DISAPPEARED_AMBIGUITY'

export interface ExtractionDiagnostic {
  readonly code: ExtractionDiagnosticCode
  readonly severity: ExtractionDiagnosticSeverity
  readonly message: string
  readonly lineStart: number
  readonly lineEnd: number
}

export interface RequirementCandidate {
  readonly code: string
  readonly title: string
  readonly description: string
  readonly type: RequirementType
  readonly priority: RequirementPriority
  readonly status: 'ACTIVE'
  readonly acceptanceCriteria: readonly string[] | null
  readonly sourceLocator: StrategicSourceLocator
}

export interface DecisionCandidate {
  readonly code: string
  readonly title: string
  readonly context: string | null
  readonly chosenDecision: string
  readonly consequences: string | null
  readonly status: DecisionStatus
  readonly supersedesDecisionCode: string | null
  readonly decidedAt: Date | null
  readonly sourceLocator: StrategicSourceLocator
}

export interface StrategicTruthCandidate {
  readonly extractorVersion: string
  readonly documentSourceId: string
  readonly sourceSnapshotId: string
  readonly requirements: readonly RequirementCandidate[]
  readonly decisions: readonly DecisionCandidate[]
  readonly diagnostics: readonly ExtractionDiagnostic[]
  readonly valid: boolean
}

interface LineRecord {
  readonly number: number
  readonly text: string
}

interface SectionRecord {
  readonly key: string
  readonly start: number
  readonly end: number
}

interface BulletRecord {
  readonly text: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly ordinal: number
}

const CONSTRAINT_SECTIONS = new Map<string, string>([
  ['constraints', 'CONSTRAINTS'],
  ['constraint', 'CONSTRAINTS'],
  ['restricoes', 'CONSTRAINTS'],
  ['restricao', 'CONSTRAINTS'],
  ['invariants', 'INVARIANTS'],
  ['invariant', 'INVARIANTS'],
  ['invariantes', 'INVARIANTS'],
  ['invariante', 'INVARIANTS'],
  ['rules', 'RULES'],
  ['rule', 'RULES'],
  ['regras', 'RULES'],
  ['regra', 'RULES'],
  ['explicit exclusions', 'EXPLICIT_EXCLUSIONS'],
  ['explicit exclusion', 'EXPLICIT_EXCLUSIONS'],
  ['exclusoes explicitas', 'EXPLICIT_EXCLUSIONS'],
  ['exclusao explicita', 'EXPLICIT_EXCLUSIONS'],
  ['security requirements', 'SECURITY_REQUIREMENTS'],
  ['security requirement', 'SECURITY_REQUIREMENTS'],
  ['requisitos de seguranca', 'SECURITY_REQUIREMENTS'],
  ['requisito de seguranca', 'SECURITY_REQUIREMENTS'],
  ['non goals', 'NON_GOALS'],
  ['non goal', 'NON_GOALS'],
  ['non-goals', 'NON_GOALS'],
  ['non-goal', 'NON_GOALS'],
  ['nao objetivos', 'NON_GOALS'],
])

const NON_GOAL_PROHIBITION = /(?:\b(?:must|shall|do|does|can)\s+not\b|\b(?:no|never|without|exclude(?:d)?|out of scope|prohibit(?:ed)?|not permitted|forbidden)\b|\b(?:não|nao)\s+(?:deve|pode|é permitido|e permitido)\b|fora de escopo|proibido)/i
const PRIORITY_LABEL = /\b(?:priority|prioridade)\s*(?::|=|is|é|é)?\s*\[?\(?\s*(P[0-3])\s*\)?\]?\b/i
const PRIORITY_BRACKET = /(?:\[|\()\s*(P[0-3])\s*(?:\]|\))/i
const PRIORITY_SEPARATOR = /(?:^|[\s|:–—-])\s*(P[0-3])\s*(?=[|:–—-]|$)/i
const INVALID_PRIORITY_LABEL = /\b(?:priority|prioridade)\s*(?::|=|is|é|é)?\s*\[?\(?\s*(P[4-9]|P\d{2,})\b/i

function normalizeNewlines(contentText: string): string {
  return contentText.normalize('NFC').replace(/\r\n?/g, '\n')
}

function normalizedInline(value: string): string {
  return value.normalize('NFC').replace(/[\t ]+/g, ' ').trim()
}

function normalizedHeading(value: string): string {
  return normalizedInline(value)
    .replace(/:$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function headingRecord(line: LineRecord): { level: number, text: string } | null {
  const match = /^\s*(#{1,6})\s+(.+?)\s*$/.exec(line.text)
  if (!match) {
    return null
  }
  const marker = match[1]
  const text = match[2]
  return marker && text ? { level: marker.length, text } : null
}

function canonicalHeadingKey(value: string): string {
  const key = normalizedHeading(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return key || 'DOCUMENT'
}

function stripListAndTableMarkers(value: string): string {
  let result = value.trim()
  result = result.replace(/^\|\s*/, '').replace(/\s*\|$/, '')
  result = result.replace(/^(?:[-*+•]|\d+[.)])\s+/, '')
  return result.trim()
}

function explicitCode(value: string, prefix: 'REQ' | 'NFR' | 'CON'): { code: string, remainder: string } | null {
  const pattern = new RegExp(`^(${prefix}-[0-9A-Z][0-9A-Z-]*)\\b(?:\\s*(?:[:.)]|[-–—])\\s*|\\s+)?(.*)$`, 'i')
  const match = pattern.exec(stripListAndTableMarkers(value))
  if (!match) {
    return null
  }
  const code = match[1]
  const remainder = match[2]
  return code ? { code: code.toUpperCase(), remainder: remainder ? remainder.trim() : '' } : null
}

function extractPriority(text: string, lineStart: number, lineEnd: number, diagnostics: ExtractionDiagnostic[]): RequirementPriority {
  if (INVALID_PRIORITY_LABEL.test(text)) {
    diagnostics.push({
      code: 'INVALID_PRIORITY',
      severity: 'ERROR',
      message: 'An explicit priority label is not one of P0, P1, P2 or P3.',
      lineStart,
      lineEnd,
    })
    return RequirementPriority.UNSPECIFIED
  }
  const match = PRIORITY_LABEL.exec(text) ?? PRIORITY_BRACKET.exec(text) ?? PRIORITY_SEPARATOR.exec(text)
  return match?.[1]?.toUpperCase() as RequirementPriority ?? RequirementPriority.UNSPECIFIED
}

function extractAcceptanceCriteria(lines: readonly string[]): readonly string[] | null {
  const values: string[] = []
  let collecting = false
  for (const line of lines) {
    const label = /^\s*(?:acceptance criteria|acceptance|critérios de aceitação|criterios de aceitacao)\s*:\s*(.*)$/i.exec(line)
    if (label) {
      collecting = true
      if (label[1]) {
        values.push(normalizedInline(label[1]))
      }
      continue
    }
    if (!collecting) {
      continue
    }
    const bullet = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line)
    if (bullet?.[1]) {
      values.push(normalizedInline(bullet[1]))
      continue
    }
    if (line.trim() !== '') {
      collecting = false
    }
  }
  return values.length > 0 ? values : null
}

function lineRecords(contentText: string): LineRecord[] {
  return normalizeNewlines(contentText).split('\n').map((text, index) => ({ number: index + 1, text }))
}

function findConstraintSections(lines: readonly LineRecord[]): SectionRecord[] {
  const starts: Array<{ key: string, index: number }> = []
  const headingIndexes: number[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    const heading = headingRecord(line)
    if (!heading) {
      continue
    }
    headingIndexes.push(index)
    const key = CONSTRAINT_SECTIONS.get(normalizedHeading(heading.text))
    if (key) {
      starts.push({ key, index })
    }
  }
  return starts.map(entry => ({
    key: entry.key,
    start: entry.index,
    end: headingIndexes.find(index => index > entry.index) ?? lines.length,
  }))
}

function collectBullets(lines: readonly LineRecord[], section: SectionRecord): BulletRecord[] {
  const result: BulletRecord[] = []
  let current: { text: string, lineStart: number, lineEnd: number } | null = null
  let blankSinceCurrent = false
  const flush = (): void => {
    if (current) {
      result.push({ ...current, ordinal: result.length + 1 })
      current = null
    }
    blankSinceCurrent = false
  }
  for (let index = section.start + 1; index < section.end; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    if (headingRecord(line)) {
      flush()
      continue
    }
    const bullet = /^\s*(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line.text)
    if (bullet?.[1]) {
      flush()
      current = { text: normalizedInline(bullet[1]), lineStart: line.number, lineEnd: line.number }
      continue
    }
    if (!current) {
      continue
    }
    if (line.text.trim() === '') {
      blankSinceCurrent = true
      continue
    }
    if (blankSinceCurrent) {
      flush()
      continue
    }
    current.text = normalizedInline(`${current.text} ${line.text}`)
    current.lineEnd = line.number
  }
  flush()
  return result
}

function parseConstraintCandidates(
  lines: readonly LineRecord[],
  documentSourceId: string,
  diagnostics: ExtractionDiagnostic[],
): RequirementCandidate[] {
  const candidates: RequirementCandidate[] = []
  for (const section of findConstraintSections(lines)) {
    for (const bullet of collectBullets(lines, section)) {
      if (section.key === 'NON_GOALS' && !NON_GOAL_PROHIBITION.test(bullet.text)) {
        diagnostics.push({
          code: 'UNSUPPORTED_STRUCTURE',
          severity: 'WARNING',
          message: 'A non-goal without an explicit prohibition was not promoted to a constraint.',
          lineStart: bullet.lineStart,
          lineEnd: bullet.lineEnd,
        })
        continue
      }
      const coded = explicitCode(bullet.text, 'CON')
      const normalizedText = normalizedInline(coded?.remainder || bullet.text)
      if (!normalizedText) {
        diagnostics.push({
          code: 'AMBIGUOUS_REQUIREMENT',
          severity: 'ERROR',
          message: 'A structured constraint bullet has no text.',
          lineStart: bullet.lineStart,
          lineEnd: bullet.lineEnd,
        })
        continue
      }
      const code = coded?.code ?? syntheticConstraintCode(documentSourceId, section.key, normalizedText)
      candidates.push({
        code,
        title: normalizedText,
        description: normalizedText,
        type: RequirementType.CONSTRAINT,
        priority: extractPriority(normalizedText, bullet.lineStart, bullet.lineEnd, diagnostics),
        status: RequirementStatus.ACTIVE,
        acceptanceCriteria: null,
        sourceLocator: {
          kind: 'CONSTRAINT',
          sectionKey: section.key,
          lineStart: bullet.lineStart,
          lineEnd: bullet.lineEnd,
          ordinal: bullet.ordinal,
        },
      })
    }
  }
  return candidates
}

function requirementBlocks(lines: readonly LineRecord[]): Array<{ code: string, type: RequirementType, start: number, end: number, body: string[] }> {
  const starts: Array<{ code: string, type: RequirementType, index: number, remainder: string }> = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line || line.text.trim().startsWith('```')) {
      continue
    }
    const heading = headingRecord(line)
    const source = heading?.text ?? line.text
    const req = explicitCode(source, 'REQ')
    const nfr = explicitCode(source, 'NFR')
    const match = req ?? nfr
    if (match) {
      starts.push({
        code: match.code,
        type: req ? RequirementType.FUNCTIONAL : RequirementType.NON_FUNCTIONAL,
        index,
        remainder: match.remainder,
      })
    }
  }
  return starts.map((start, index) => {
    const nextRequirement = starts[index + 1]?.index ?? lines.length
    const nextHeading = lines.findIndex((line, lineIndex) => lineIndex > start.index && Boolean(headingRecord(line)))
    const nextBlank = lines.findIndex((line, lineIndex) => lineIndex > start.index && line.text.trim() === '')
    const end = [nextRequirement, nextHeading >= 0 ? nextHeading : lines.length, nextBlank >= 0 ? nextBlank : lines.length]
      .reduce((minimum, value) => Math.min(minimum, value), lines.length)
    const body: string[] = [start.remainder]
    for (const line of lines.slice(start.index + 1, end)) {
      if (line.text.trim() === '') {
        break
      }
      const structured = /^\s*(?:[-*+•]|\d+[.)]|acceptance criteria|acceptance|critérios de aceitação|criterios de aceitacao)\b/i.test(line.text)
        || /^\s+/.test(line.text)
      if (!structured) {
        break
      }
      body.push(line.text)
    }
    return { code: start.code, type: start.type, start: start.index, end: end - 1, body }
  })
}

type RequirementBlock = ReturnType<typeof requirementBlocks>[number]

function parseRequirementBlock(
  lines: readonly LineRecord[],
  block: RequirementBlock,
  ordinal: number,
  diagnostics: ExtractionDiagnostic[],
): RequirementCandidate | null {
  const lineStart = lines[block.start]?.number ?? 1
  const lineEnd = lines[block.end]?.number ?? lineStart
  const statement = normalizedInline(block.body.filter(Boolean).join(' '))
  if (!statement) {
    diagnostics.push({
      code: 'AMBIGUOUS_REQUIREMENT',
      severity: 'ERROR',
      message: `Requirement ${block.code} has no explicit statement.`,
      lineStart,
      lineEnd,
    })
    return null
  }
  return {
    code: block.code,
    title: statement,
    description: statement,
    type: block.type,
    priority: extractPriority(statement, lineStart, lineEnd, diagnostics),
    status: RequirementStatus.ACTIVE,
    acceptanceCriteria: extractAcceptanceCriteria(block.body),
    sourceLocator: {
      kind: 'REQUIREMENT',
      sectionKey: headingSectionKey(lines, block.start),
      lineStart,
      lineEnd,
      ordinal,
    },
  }
}

function parseRequirementCandidates(
  lines: readonly LineRecord[],
  diagnostics: ExtractionDiagnostic[],
): RequirementCandidate[] {
  const candidates: RequirementCandidate[] = []
  const seen = new Set<string>()
  for (const block of requirementBlocks(lines)) {
    if (seen.has(block.code)) {
      diagnostics.push({
        code: 'DUPLICATE_REQUIREMENT_CODE',
        severity: 'ERROR',
        message: `Requirement code ${block.code} occurs more than once in the snapshot.`,
        lineStart: lines[block.start]?.number ?? 1,
        lineEnd: lines[block.end]?.number ?? lines.length,
      })
      continue
    }
    seen.add(block.code)
    const candidate = parseRequirementBlock(lines, block, candidates.length + 1, diagnostics)
    if (candidate) {
      candidates.push(candidate)
    }
  }
  return candidates
}

function headingSectionKey(lines: readonly LineRecord[], index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = lines[cursor]
    if (!line) {
      continue
    }
    const heading = headingRecord(line)
    if (heading) {
      return canonicalHeadingKey(heading.text)
    }
  }
  return 'DOCUMENT'
}

function decisionHeader(value: string): { code: string, title: string } | null {
  const source = stripListAndTableMarkers(value)
  const match = /^(DEC-[0-9A-Z][0-9A-Z-]*)(?:\s*(?:[-–—:]\s*)(.*))?$/i.exec(source)
  if (!match) {
    return null
  }
  const code = match[1]
  const title = match[2]
  return code ? { code: code.toUpperCase(), title: title ? normalizedInline(title) : '' } : null
}

function decisionBlocks(lines: readonly LineRecord[]): Array<{ header: { code: string, title: string }, start: number, end: number, body: string[] }> {
  const starts: Array<{ header: { code: string, title: string }, index: number }> = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }
    const heading = headingRecord(line)
    if (!heading) {
      continue
    }
    const header = decisionHeader(heading.text)
    if (header) {
      starts.push({ header, index })
    }
  }
  return starts.map((start, index) => {
    const nextDecision = starts[index + 1]?.index ?? lines.length
    const nextHeading = lines.findIndex((line, lineIndex) => lineIndex > start.index && Boolean(headingRecord(line)))
    const nextBlank = lines.findIndex((line, lineIndex) => lineIndex > start.index && line.text.trim() === '')
    const end = [nextDecision, nextHeading >= 0 ? nextHeading : lines.length, nextBlank >= 0 ? nextBlank : lines.length]
      .reduce((minimum, value) => Math.min(minimum, value), lines.length)
    return {
      header: start.header,
      start: start.index,
      end: end - 1,
      body: lines.slice(start.index + 1, end).map(line => line.text),
    }
  })
}

type DecisionField = 'title' | 'status' | 'chosenDecision' | 'context' | 'consequences' | 'supersedes' | 'decidedAt'

const DECISION_LABELS: Array<{ pattern: RegExp, field: DecisionField }> = [
  { pattern: /^(?:title|subject|t[ií]tulo|assunto)\s*:\s*(.*)$/i, field: 'title' },
  { pattern: /^(?:status|estado)\s*:\s*(.*)$/i, field: 'status' },
  { pattern: /^(?:decision|chosen decision|outcome|decis[aã]o|escolha)\s*:\s*(.*)$/i, field: 'chosenDecision' },
  { pattern: /^(?:context|contexto)\s*:\s*(.*)$/i, field: 'context' },
  { pattern: /^(?:consequences|consequ[eê]ncias)\s*:\s*(.*)$/i, field: 'consequences' },
  { pattern: /^(?:supersedes|supersede|substitui)\s*:\s*(.*)$/i, field: 'supersedes' },
  { pattern: /^(?:decided at|decidedAt|decidido em)\s*:\s*(.*)$/i, field: 'decidedAt' },
]

function labeledDecisionFields(lines: readonly string[]): Map<DecisionField, string> {
  const fields = new Map<DecisionField, string>()
  let active: DecisionField | null = null
  for (const rawLine of lines) {
    const line = stripListAndTableMarkers(rawLine)
    const label = DECISION_LABELS.find(entry => entry.pattern.test(line))
    if (label) {
      const match = label.pattern.exec(line)
      fields.set(label.field, normalizedInline(match?.[1] ?? ''))
      active = label.field
      continue
    }
    if (active && line !== '') {
      fields.set(active, normalizedInline(`${fields.get(active) ?? ''} ${line}`))
    }
  }
  return fields
}

type DecisionBlock = ReturnType<typeof decisionBlocks>[number]

interface ParsedDecisionValues {
  readonly title: string
  readonly status: DecisionStatus
  readonly chosenDecision: string
  readonly context: string | null
  readonly consequences: string | null
  readonly supersedesDecisionCode: string | null
  readonly decidedAt: Date | null
}

function parseDecisionStatus(
  code: string,
  value: string | undefined,
  locator: { lineStart: number, lineEnd: number },
  diagnostics: ExtractionDiagnostic[],
): DecisionStatus | null {
  const { lineStart, lineEnd } = locator
  if (!value) {
    diagnostics.push({
      code: 'AMBIGUOUS_DECISION',
      severity: 'ERROR',
      message: `Decision ${code} must explicitly state title, status and chosen decision/outcome.`,
      lineStart,
      lineEnd,
    })
    return null
  }
  if (!(value in DecisionStatus)) {
    diagnostics.push({
      code: 'INVALID_DECISION_STATUS',
      severity: 'ERROR',
      message: `Decision ${code} has an unsupported status.`,
      lineStart,
      lineEnd,
    })
    return null
  }
  return value as DecisionStatus
}

function parseDecisionDate(value: string | undefined): Date | null | undefined {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function hasMissingDecisionRequirement(title: string, chosenDecision: string): boolean {
  return [title, chosenDecision].some(value => !value)
}

interface DecisionFieldValues {
  readonly title: string
  readonly statusValue: string
  readonly chosenDecision: string
  readonly context: string | null
  readonly consequences: string | null
  readonly supersedesDecisionCode: string | null
  readonly decidedAtValue: string | undefined
}

function readDecisionFieldValues(block: DecisionBlock): DecisionFieldValues {
  const fields = labeledDecisionFields(block.body)
  return {
    title: fields.get('title') ?? block.header.title,
    statusValue: fields.get('status')?.toUpperCase() ?? '',
    chosenDecision: fields.get('chosenDecision') ?? '',
    context: fields.get('context') ?? null,
    consequences: fields.get('consequences') ?? null,
    supersedesDecisionCode: fields.get('supersedes')?.toUpperCase() ?? null,
    decidedAtValue: fields.get('decidedAt'),
  }
}

function parseDecisionValues(
  block: DecisionBlock,
  lineStart: number,
  lineEnd: number,
  diagnostics: ExtractionDiagnostic[],
): ParsedDecisionValues | null {
  const {
    title,
    statusValue,
    chosenDecision,
    context,
    consequences,
    supersedesDecisionCode,
    decidedAtValue,
  } = readDecisionFieldValues(block)
  if (hasMissingDecisionRequirement(title, chosenDecision)) {
    diagnostics.push({
      code: 'AMBIGUOUS_DECISION',
      severity: 'ERROR',
      message: `Decision ${block.header.code} must explicitly state title, status and chosen decision/outcome.`,
      lineStart,
      lineEnd,
    })
    return null
  }
  const status = parseDecisionStatus(block.header.code, statusValue, { lineStart, lineEnd }, diagnostics)
  if (!status) {
    return null
  }
  const decidedAt = parseDecisionDate(decidedAtValue)
  if (decidedAt === undefined) {
    diagnostics.push({
      code: 'AMBIGUOUS_DECISION',
      severity: 'ERROR',
      message: `Decision ${block.header.code} has an invalid decided-at value.`,
      lineStart,
      lineEnd,
    })
    return null
  }
  return {
    title,
    status,
    chosenDecision,
    context,
    consequences,
    supersedesDecisionCode,
    decidedAt,
  }
}

function parseDecisionBlock(
  lines: readonly LineRecord[],
  block: DecisionBlock,
  ordinal: number,
  diagnostics: ExtractionDiagnostic[],
): DecisionCandidate | null {
  const lineStart = lines[block.start]?.number ?? 1
  const lineEnd = lines[block.end]?.number ?? lineStart
  const values = parseDecisionValues(block, lineStart, lineEnd, diagnostics)
  if (!values) {
    return null
  }
  return {
    code: block.header.code,
    title: values.title,
    context: values.context,
    chosenDecision: values.chosenDecision,
    consequences: values.consequences,
    status: values.status,
    supersedesDecisionCode: values.supersedesDecisionCode,
    decidedAt: values.decidedAt,
    sourceLocator: {
      kind: 'DECISION',
      sectionKey: 'DECISIONS',
      lineStart,
      lineEnd,
      ordinal,
    },
  }
}

function parseDecisionCandidates(
  lines: readonly LineRecord[],
  diagnostics: ExtractionDiagnostic[],
): DecisionCandidate[] {
  const candidates: DecisionCandidate[] = []
  const seen = new Set<string>()
  for (const block of decisionBlocks(lines)) {
    const lineStart = lines[block.start]?.number ?? 1
    const lineEnd = lines[block.end]?.number ?? lineStart
    if (seen.has(block.header.code)) {
      diagnostics.push({
        code: 'DUPLICATE_DECISION_CODE',
        severity: 'ERROR',
        message: `Decision code ${block.header.code} occurs more than once in the snapshot.`,
        lineStart,
        lineEnd,
      })
      continue
    }
    seen.add(block.header.code)
    const candidate = parseDecisionBlock(lines, block, candidates.length + 1, diagnostics)
    if (candidate) {
      candidates.push(candidate)
    }
  }
  return candidates
}

function syntheticConstraintCode(documentSourceId: string, sectionKey: string, normalizedText: string): string {
  const input = `${documentSourceId}\n${sectionKey}\n${normalizedText}`
  const digest = sha256Hex(input).slice(0, 16).toUpperCase()
  return `CON-${digest}`
}

export function parseStrategicTruth(input: {
  documentSourceId: string
  sourceSnapshotId: string
  contentText: string
  extractorVersion?: string
}): StrategicTruthCandidate {
  const lines = lineRecords(input.contentText)
  const diagnostics: ExtractionDiagnostic[] = []
  const requirements = [
    ...parseRequirementCandidates(lines, diagnostics),
    ...parseConstraintCandidates(lines, input.documentSourceId, diagnostics),
  ].sort((left, right) => left.code.localeCompare(right.code))
  const decisions = parseDecisionCandidates(lines, diagnostics)
    .sort((left, right) => left.code.localeCompare(right.code))
  diagnostics.sort((left, right) => left.lineStart - right.lineStart || left.code.localeCompare(right.code))
  return {
    extractorVersion: input.extractorVersion ?? STRATEGIC_TRUTH_EXTRACTOR_VERSION,
    documentSourceId: input.documentSourceId,
    sourceSnapshotId: input.sourceSnapshotId,
    requirements,
    decisions,
    diagnostics,
    valid: diagnostics.every(diagnostic => diagnostic.severity !== 'ERROR'),
  }
}

export function hasBlockingDiagnostics(candidate: StrategicTruthCandidate): boolean {
  return !candidate.valid
}
