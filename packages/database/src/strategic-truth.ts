/**
 * NDERCC-16 / P0-022 persistence and reconciliation surface.
 *
 * The parser is pure and offline (it lives in @rick/domain). This module only
 * validates the immutable project-owned source boundary and applies one
 * deterministic candidate transactionally. No provider payload or credential
 * is accepted by this surface.
 */
import {
  DecisionStatus as DbDecisionStatus,
  Prisma,
  RequirementPriority as DbRequirementPriority,
  RequirementStatus as DbRequirementStatus,
  RequirementType as DbRequirementType,
} from '@prisma/client'
import type {
  Decision as DbDecision,
  DocumentSnapshot as DbDocumentSnapshot,
  DocumentSource as DbDocumentSource,
  PrismaClient,
  Requirement as DbRequirement,
} from '@prisma/client'
import {
  parseStrategicTruth,
  RequirementPriority,
  RequirementStatus,
  RequirementType,
  STRATEGIC_TRUTH_EXTRACTOR_VERSION,
} from '@rick/domain'
import type {
  DecisionCandidate,
  ExtractionDiagnostic,
  RequirementCandidate,
  StrategicSourceLocator,
  StrategicTruthCandidate,
} from '@rick/domain'
import {
  ArchivedProjectReadOnlyError,
  DocumentSnapshotNotFoundError,
  DocumentSourceNotFoundError,
  ProjectNotFoundError,
  StrategicTruthSourceNotEligibleError,
} from './errors.js'
import {
  requireExistingProject,
  withMutableProjectTransaction,
} from './internal/mutable-project-transaction.js'

export interface RequirementRecord {
  readonly id: string
  readonly projectId: string
  readonly code: string
  readonly title: string
  readonly description: string
  readonly type: DbRequirementType
  readonly priority: DbRequirementPriority
  readonly status: DbRequirementStatus
  readonly documentSourceId: string
  readonly sourceSnapshotId: string
  readonly acceptanceCriteriaJson: unknown
  readonly extractorVersion: string
  readonly sourceLocator: unknown
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface DecisionRecord {
  readonly id: string
  readonly projectId: string
  readonly code: string
  readonly title: string
  readonly context: string | null
  readonly chosenDecision: string
  readonly consequences: string | null
  readonly status: DbDecisionStatus
  readonly supersedesDecisionId: string | null
  readonly decidedAt: Date | null
  readonly documentSourceId: string
  readonly sourceSnapshotId: string
  readonly extractorVersion: string
  readonly sourceLocator: unknown
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface StrategicTruthExtractionInput {
  readonly projectId: string
  readonly documentSourceId: string
  readonly sourceSnapshotId: string
  readonly extractorVersion?: string
}

export interface StrategicTruthCounts {
  readonly created: number
  readonly updated: number
  readonly superseded: number
  readonly reused: number
}

export interface StrategicTruthExtractionResult {
  readonly committed: boolean
  readonly projectId: string
  readonly documentSourceId: string
  readonly sourceSnapshotId: string
  readonly extractorVersion: string
  readonly counts: StrategicTruthCounts
  readonly diagnostics: readonly ExtractionDiagnostic[]
  readonly candidate: StrategicTruthCandidate
}

interface ReconciliationContext {
  readonly source: DbDocumentSource
  readonly snapshot: DbDocumentSnapshot
}

interface MutableCounts {
  created: number
  updated: number
  superseded: number
  reused: number
}

const EMPTY_COUNTS: StrategicTruthCounts = {
  created: 0,
  updated: 0,
  superseded: 0,
  reused: 0,
}

function countsSnapshot(counts: MutableCounts): StrategicTruthCounts {
  return { ...counts }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function nullableJsonValue(value: readonly string[] | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : jsonValue(value)
}

function sameJson(left: unknown, right: unknown): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(canonicalize)
    }
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
          .map(([key, item]) => [key, canonicalize(item)]),
      )
    }
    return value
  }
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

function mapRequirementType(value: RequirementCandidate['type']): DbRequirementType {
  return value === RequirementType.FUNCTIONAL
    ? DbRequirementType.FUNCTIONAL
    : value === RequirementType.NON_FUNCTIONAL
      ? DbRequirementType.NON_FUNCTIONAL
      : DbRequirementType.CONSTRAINT
}

function mapRequirementPriority(value: RequirementCandidate['priority']): DbRequirementPriority {
  return value === RequirementPriority.P0
    ? DbRequirementPriority.P0
    : value === RequirementPriority.P1
      ? DbRequirementPriority.P1
      : value === RequirementPriority.P2
        ? DbRequirementPriority.P2
        : value === RequirementPriority.P3
          ? DbRequirementPriority.P3
          : DbRequirementPriority.UNSPECIFIED
}

function mapRequirementStatus(value: RequirementCandidate['status']): DbRequirementStatus {
  return value === RequirementStatus.ACTIVE ? DbRequirementStatus.ACTIVE : DbRequirementStatus.SUPERSEDED
}

function mapDecisionStatus(value: DecisionCandidate['status']): DbDecisionStatus {
  return value === 'PROPOSED'
    ? DbDecisionStatus.PROPOSED
    : value === 'APPROVED'
      ? DbDecisionStatus.APPROVED
      : value === 'REJECTED'
        ? DbDecisionStatus.REJECTED
        : DbDecisionStatus.SUPERSEDED
}

async function loadEligibleContext(
  tx: Prisma.TransactionClient,
  input: StrategicTruthExtractionInput,
): Promise<ReconciliationContext> {
  const project = await tx.project.findUnique({ where: { id: input.projectId } })
  if (!project) {
    throw new ProjectNotFoundError(input.projectId)
  }
  if (project.status === 'ARCHIVED') {
    throw new ArchivedProjectReadOnlyError(input.projectId)
  }

  const source = await tx.documentSource.findUnique({ where: { id: input.documentSourceId } })
  if (!source || source.projectId !== input.projectId) {
    throw new DocumentSourceNotFoundError(input.documentSourceId)
  }

  const snapshot = await tx.documentSnapshot.findUnique({ where: { id: input.sourceSnapshotId } })
  if (!snapshot || snapshot.projectId !== input.projectId || snapshot.documentSourceId !== source.id) {
    throw new DocumentSnapshotNotFoundError(input.sourceSnapshotId)
  }

  const latest = await tx.documentSnapshot.findFirst({
    where: { projectId: input.projectId, documentSourceId: source.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  const reason = sourceEligibilityReason(source, snapshot, latest?.id === snapshot.id)
  if (reason) {
    throw new StrategicTruthSourceNotEligibleError(
      input.projectId,
      source.id,
      snapshot.id,
      reason,
    )
  }
  return { source, snapshot }
}

function sourceEligibilityReason(
  source: DbDocumentSource,
  snapshot: DbDocumentSnapshot,
  isLatest: boolean,
): string | null {
  if (source.approvalStatus !== 'APPROVED') {
    return `approval status is ${source.approvalStatus}`
  }
  if (source.syncStatus !== 'SYNCED') {
    return `sync status is ${source.syncStatus}`
  }
  if (source.revision !== snapshot.providerVersion || source.checksum !== snapshot.checksum) {
    return 'source synchronization pointer does not match the snapshot'
  }
  if (!isLatest) {
    return 'a newer immutable snapshot is current for the source'
  }
  return null
}

function parseCandidate(
  context: ReconciliationContext,
  extractorVersion: string,
): StrategicTruthCandidate {
  return parseStrategicTruth({
    documentSourceId: context.source.id,
    sourceSnapshotId: context.snapshot.id,
    contentText: context.snapshot.contentText,
    extractorVersion,
  })
}

function diagnostic(
  code: ExtractionDiagnostic['code'],
  message: string,
  locator: StrategicSourceLocator,
): ExtractionDiagnostic {
  return {
    code,
    severity: 'ERROR',
    message,
    lineStart: locator.lineStart,
    lineEnd: locator.lineEnd,
  }
}

async function sourceConflictDiagnostics(
  tx: Prisma.TransactionClient,
  projectId: string,
  sourceId: string,
  candidate: StrategicTruthCandidate,
): Promise<ExtractionDiagnostic[]> {
  const requirementCodes = candidate.requirements.map(item => item.code)
  const decisionCodes = candidate.decisions.map(item => item.code)
  const [requirements, decisions] = await Promise.all([
    tx.requirement.findMany({ where: { projectId, code: { in: requirementCodes } } }),
    tx.decision.findMany({ where: { projectId, code: { in: decisionCodes } } }),
  ])
  const conflicts: ExtractionDiagnostic[] = []
  for (const item of requirements) {
    if (item.documentSourceId !== sourceId) {
      const candidateItem = candidate.requirements.find(value => value.code === item.code)
      if (candidateItem) {
        conflicts.push(diagnostic(
          'SOURCE_CONFLICT',
          `Requirement ${item.code} already belongs to another document source.`,
          candidateItem.sourceLocator,
        ))
      }
    }
  }
  for (const item of decisions) {
    if (item.documentSourceId !== sourceId) {
      const candidateItem = candidate.decisions.find(value => value.code === item.code)
      if (candidateItem) {
        conflicts.push(diagnostic(
          'SOURCE_CONFLICT',
          `Decision ${item.code} already belongs to another document source.`,
          candidateItem.sourceLocator,
        ))
      }
    }
  }
  return conflicts
}

function candidateRequirementData(
  candidate: RequirementCandidate,
  input: StrategicTruthExtractionInput,
  extractorVersion: string,
): Prisma.RequirementUncheckedCreateInput {
  return {
    projectId: input.projectId,
    code: candidate.code,
    title: candidate.title,
    description: candidate.description,
    type: mapRequirementType(candidate.type),
    priority: mapRequirementPriority(candidate.priority),
    status: mapRequirementStatus(candidate.status),
    documentSourceId: input.documentSourceId,
    sourceSnapshotId: input.sourceSnapshotId,
    acceptanceCriteriaJson: nullableJsonValue(candidate.acceptanceCriteria),
    extractorVersion,
    sourceLocatorJson: jsonValue(candidate.sourceLocator),
  }
}

function sameRequirement(
  row: DbRequirement,
  candidate: RequirementCandidate,
  input: StrategicTruthExtractionInput,
  extractorVersion: string,
): boolean {
  return row.title === candidate.title
    && row.description === candidate.description
    && row.type === mapRequirementType(candidate.type)
    && row.priority === mapRequirementPriority(candidate.priority)
    && row.status === DbRequirementStatus.ACTIVE
    && row.documentSourceId === input.documentSourceId
    && row.sourceSnapshotId === input.sourceSnapshotId
    && row.extractorVersion === extractorVersion
    && sameJson(row.acceptanceCriteriaJson, candidate.acceptanceCriteria)
    && sameJson(row.sourceLocatorJson, candidate.sourceLocator)
}

async function reconcileRequirements(
  tx: Prisma.TransactionClient,
  input: StrategicTruthExtractionInput,
  candidate: StrategicTruthCandidate,
  counts: MutableCounts,
): Promise<void> {
  const currentRows = await tx.requirement.findMany({ where: { projectId: input.projectId } })
  const byCode = new Map(currentRows.map(row => [row.code, row]))
  for (const item of candidate.requirements) {
    const existing = byCode.get(item.code)
    if (!existing) {
      await tx.requirement.create({ data: candidateRequirementData(item, input, candidate.extractorVersion) })
      counts.created += 1
      continue
    }
    if (sameRequirement(existing, item, input, candidate.extractorVersion)) {
      counts.reused += 1
      continue
    }
    await tx.requirement.update({
      where: { id: existing.id },
      data: candidateRequirementData(item, input, candidate.extractorVersion),
    })
    counts.updated += 1
  }

  const candidateCodes = new Set(candidate.requirements.map(item => item.code))
  for (const existing of currentRows) {
    if (existing.documentSourceId === input.documentSourceId
      && existing.status === DbRequirementStatus.ACTIVE
      && !candidateCodes.has(existing.code)) {
      await tx.requirement.update({
        where: { id: existing.id },
        data: { status: DbRequirementStatus.SUPERSEDED },
      })
      counts.superseded += 1
    }
  }
}

function candidateDecisionData(
  candidate: DecisionCandidate,
  input: StrategicTruthExtractionInput,
  extractorVersion: string,
  supersedesDecisionId: string | null,
): Prisma.DecisionUncheckedCreateInput {
  return {
    projectId: input.projectId,
    code: candidate.code,
    title: candidate.title,
    context: candidate.context,
    chosenDecision: candidate.chosenDecision,
    consequences: candidate.consequences,
    status: mapDecisionStatus(candidate.status),
    supersedesDecisionId,
    decidedAt: candidate.decidedAt,
    documentSourceId: input.documentSourceId,
    sourceSnapshotId: input.sourceSnapshotId,
    extractorVersion,
    sourceLocatorJson: jsonValue(candidate.sourceLocator),
  }
}

function sameDecision(
  row: DbDecision,
  candidate: DecisionCandidate,
  context: {
    input: StrategicTruthExtractionInput
    extractorVersion: string
    supersedesDecisionId: string | null
  },
): boolean {
  const { input, extractorVersion, supersedesDecisionId } = context
  return [
    row.title === candidate.title,
    row.context === candidate.context,
    row.chosenDecision === candidate.chosenDecision,
    row.consequences === candidate.consequences,
    row.status === mapDecisionStatus(candidate.status),
    row.supersedesDecisionId === supersedesDecisionId,
    row.decidedAt?.getTime() === candidate.decidedAt?.getTime(),
    row.documentSourceId === input.documentSourceId,
    row.sourceSnapshotId === input.sourceSnapshotId,
    row.extractorVersion === extractorVersion,
    sameJson(row.sourceLocatorJson, candidate.sourceLocator),
  ].every(Boolean)
}

async function decisionSupersessionIds(
  tx: Prisma.TransactionClient,
  projectId: string,
  sourceId: string,
  candidate: StrategicTruthCandidate,
): Promise<{ ids: Map<string, string>, diagnostics: ExtractionDiagnostic[] }> {
  const rows = await tx.decision.findMany({ where: { projectId } })
  const ids = new Map(rows.map(row => [row.code, row.id]))
  const diagnostics: ExtractionDiagnostic[] = []
  for (const item of candidate.decisions) {
    const supersedesCode = item.supersedesDecisionCode
    if (!supersedesCode) {
      continue
    }
    const target = rows.find(row => row.code === supersedesCode)
    if (!target) {
      diagnostics.push(diagnostic(
        'AMBIGUOUS_DECISION',
        `Decision ${item.code} supersedes an unknown decision ${supersedesCode}.`,
        item.sourceLocator,
      ))
      continue
    }
    if (target.documentSourceId !== sourceId) {
      diagnostics.push(diagnostic(
        'SOURCE_CONFLICT',
        `Decision ${item.code} supersedes a decision from another document source.`,
        item.sourceLocator,
      ))
    }
  }
  return { ids, diagnostics }
}

interface DecisionReconciliationContext {
  readonly tx: Prisma.TransactionClient
  readonly input: StrategicTruthExtractionInput
  readonly candidate: StrategicTruthCandidate
  readonly counts: MutableCounts
  readonly supersessionIds: Map<string, string>
}

async function reconcileDecisionItem(
  context: DecisionReconciliationContext,
  item: DecisionCandidate,
  byCode: Map<string, DbDecision>,
): Promise<void> {
  const { tx, input, candidate, counts, supersessionIds } = context
  const targetId = item.supersedesDecisionCode ? supersessionIds.get(item.supersedesDecisionCode) ?? null : null
  const existing = byCode.get(item.code)
  if (!existing) {
    await tx.decision.create({ data: candidateDecisionData(item, input, candidate.extractorVersion, targetId) })
    counts.created += 1
    return
  }
  const comparison = { input, extractorVersion: candidate.extractorVersion, supersedesDecisionId: targetId }
  if (sameDecision(existing, item, comparison)) {
    counts.reused += 1
  }
  else {
    await tx.decision.update({
      where: { id: existing.id },
      data: candidateDecisionData(item, input, candidate.extractorVersion, targetId),
    })
    counts.updated += 1
  }
  if (!targetId) {
    return
  }
  const target = byCode.get(item.supersedesDecisionCode ?? '')
  if (!target || target.status === DbDecisionStatus.SUPERSEDED) {
    return
  }
  await tx.decision.update({ where: { id: target.id }, data: { status: DbDecisionStatus.SUPERSEDED } })
  counts.superseded += 1
}

function disappearedDecisionDiagnostics(
  currentRows: readonly DbDecision[],
  context: DecisionReconciliationContext,
): ExtractionDiagnostic[] {
  const candidateCodes = new Set(context.candidate.decisions.map(item => item.code))
  const supersededCodes = new Set(
    context.candidate.decisions
      .map(item => item.supersedesDecisionCode)
      .filter((code): code is string => code !== null),
  )
  return currentRows
    .filter(row => row.documentSourceId === context.input.documentSourceId)
    .filter(row => row.status !== DbDecisionStatus.SUPERSEDED)
    .filter(row => !candidateCodes.has(row.code))
    .filter(row => !supersededCodes.has(row.code))
    .map(row => ({
      code: 'DECISION_DISAPPEARED_AMBIGUITY' as const,
      severity: 'WARNING' as const,
      message: `Decision ${row.code} disappeared without explicit replacement or supersession; prior truth was preserved.`,
      lineStart: 0,
      lineEnd: 0,
    }))
}

async function reconcileDecisions(context: DecisionReconciliationContext): Promise<ExtractionDiagnostic[]> {
  const currentRows = await context.tx.decision.findMany({ where: { projectId: context.input.projectId } })
  const byCode = new Map(currentRows.map(row => [row.code, row]))
  for (const item of context.candidate.decisions) {
    await reconcileDecisionItem(context, item, byCode)
  }
  return disappearedDecisionDiagnostics(currentRows, context)
}

function resultFromCandidate(
  input: StrategicTruthExtractionInput,
  candidate: StrategicTruthCandidate,
  options: {
    committed: boolean
    counts?: StrategicTruthCounts
    diagnostics?: readonly ExtractionDiagnostic[]
  },
): StrategicTruthExtractionResult {
  return {
    committed: options.committed,
    projectId: input.projectId,
    documentSourceId: input.documentSourceId,
    sourceSnapshotId: input.sourceSnapshotId,
    extractorVersion: candidate.extractorVersion,
    counts: options.counts ?? EMPTY_COUNTS,
    diagnostics: options.diagnostics ?? candidate.diagnostics,
    candidate,
  }
}

async function reconcileTransaction(
  tx: Prisma.TransactionClient,
  input: StrategicTruthExtractionInput,
): Promise<StrategicTruthExtractionResult> {
  const context = await loadEligibleContext(tx, input)
  const candidate = parseCandidate(context, input.extractorVersion ?? STRATEGIC_TRUTH_EXTRACTOR_VERSION)
  if (!candidate.valid) {
    return resultFromCandidate(input, candidate, { committed: false })
  }
  const conflicts = await sourceConflictDiagnostics(tx, input.projectId, input.documentSourceId, candidate)
  if (conflicts.length > 0) {
    return resultFromCandidate(input, candidate, { committed: false, diagnostics: conflicts })
  }

  const decisionPreflight = await decisionSupersessionIds(
    tx,
    input.projectId,
    input.documentSourceId,
    candidate,
  )
  if (decisionPreflight.diagnostics.some(item => item.severity === 'ERROR')) {
    return resultFromCandidate(input, candidate, { committed: false, diagnostics: decisionPreflight.diagnostics })
  }

  const counts: MutableCounts = { created: 0, updated: 0, superseded: 0, reused: 0 }
  await reconcileRequirements(tx, input, candidate, counts)
  const decisionDiagnostics = await reconcileDecisions({
    tx,
    input,
    candidate,
    counts,
    supersessionIds: decisionPreflight.ids,
  })
  const diagnostics = [...candidate.diagnostics, ...decisionDiagnostics]
    .sort((left, right) => left.lineStart - right.lineStart || left.code.localeCompare(right.code))
  return resultFromCandidate(input, candidate, {
    committed: true,
    counts: countsSnapshot(counts),
    diagnostics,
  })
}

export async function extractStrategicTruth(
  client: PrismaClient,
  input: StrategicTruthExtractionInput,
): Promise<StrategicTruthExtractionResult> {
  return withMutableProjectTransaction(client, input.projectId, tx => reconcileTransaction(tx, input))
}

export const extractAndReconcileStrategicTruth = extractStrategicTruth

function mapRequirement(row: DbRequirement): RequirementRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    description: row.description,
    type: row.type,
    priority: row.priority,
    status: row.status,
    documentSourceId: row.documentSourceId,
    sourceSnapshotId: row.sourceSnapshotId,
    acceptanceCriteriaJson: row.acceptanceCriteriaJson,
    extractorVersion: row.extractorVersion,
    sourceLocator: row.sourceLocatorJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function mapDecision(row: DbDecision): DecisionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    context: row.context,
    chosenDecision: row.chosenDecision,
    consequences: row.consequences,
    status: row.status,
    supersedesDecisionId: row.supersedesDecisionId,
    decidedAt: row.decidedAt,
    documentSourceId: row.documentSourceId,
    sourceSnapshotId: row.sourceSnapshotId,
    extractorVersion: row.extractorVersion,
    sourceLocator: row.sourceLocatorJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listCurrentRequirementsByProject(
  client: PrismaClient,
  projectId: string,
): Promise<RequirementRecord[]> {
  await requireExistingProject(client, projectId)
  const rows = await client.requirement.findMany({
    where: { projectId, status: DbRequirementStatus.ACTIVE },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
  })
  return rows.map(mapRequirement)
}

export async function findCurrentRequirementByCode(
  client: PrismaClient,
  projectId: string,
  code: string,
): Promise<RequirementRecord | null> {
  await requireExistingProject(client, projectId)
  const row = await client.requirement.findUnique({
    where: { projectId_code: { projectId, code: code.trim().toUpperCase() } },
  })
  return row?.status === DbRequirementStatus.ACTIVE ? mapRequirement(row) : null
}

export async function listCurrentDecisionsByProject(
  client: PrismaClient,
  projectId: string,
): Promise<DecisionRecord[]> {
  await requireExistingProject(client, projectId)
  const rows = await client.decision.findMany({
    where: { projectId, status: { not: DbDecisionStatus.SUPERSEDED } },
    orderBy: [{ code: 'asc' }, { id: 'asc' }],
  })
  return rows.map(mapDecision)
}

export async function findCurrentDecisionByCode(
  client: PrismaClient,
  projectId: string,
  code: string,
): Promise<DecisionRecord | null> {
  await requireExistingProject(client, projectId)
  const row = await client.decision.findUnique({
    where: { projectId_code: { projectId, code: code.trim().toUpperCase() } },
  })
  return row && row.status !== DbDecisionStatus.SUPERSEDED ? mapDecision(row) : null
}

export const listRequirementsByProject = listCurrentRequirementsByProject
export const listDecisionsByProject = listCurrentDecisionsByProject
