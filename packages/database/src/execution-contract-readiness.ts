/**
 * P0-042 — transactional canonical re-evaluation for Execution Contract
 * readiness (RIC-SPEC-NDERCC-39-001, AC-03, AC-06, AC-11).
 *
 * This is the trusted boundary the domain classifier
 * (`@rick/domain`'s `evaluateExecutionContractReadiness`) is deliberately
 * infrastructure-free so it can never become: every canonical fact is read
 * fresh, inside the caller's transaction, and compared against what the
 * candidate *claims* — never the other way around. A caller-supplied
 * "eligible: true" or a copied traceability set is never trusted as a gate
 * (AC-03); only what this module itself reads from the database, inside the
 * same transaction that already holds the project row lock, feeds the
 * classifier.
 *
 * The caller must already hold that lock — `withMutableProjectTransaction`
 * for a transaction that will also write, or `withConsistentProjectReadTransaction`
 * for a pure projection — exactly as `resolveImplementationSpecEligibilityInTransaction`
 * requires, because this module calls that resolver directly rather than
 * recomputing eligibility a second way.
 *
 * Freshness (AC-06): nothing here is cached or reused across calls. Every
 * invocation re-reads canonical state, so an intervening mutation is
 * observed on the very next evaluation — there is no stored verdict to grow
 * stale.
 */
import type { ImplementationSpec, Prisma, PrismaClient } from '@prisma/client'
import type { CanonicalTraceabilityLink, IdentityFactPair, ReadinessEvaluationOutcome } from '@rick/domain'
import { EligibilitySignal, evaluateExecutionContractReadiness } from '@rick/domain'
import { findGoverningSpecForTask, readImplementationSpecContent, resolveImplementationSpecEligibilityInTransaction } from './implementation-spec.js'
import { withConsistentProjectReadTransaction } from './internal/mutable-project-transaction.js'
import { TaskNotFoundError } from './errors.js'

/** The exact identity and traceability a schema 2.0.0 candidate claims, as read directly off `ExecutionContractV2` — never re-derived here. */
export interface ClaimedExecutionContractBinding {
  readonly projectId: string
  readonly taskId: string
  readonly sprintId: string
  readonly specId: string
  readonly lineageCode: string
  readonly specVersion: string
  readonly contentHash: string
  readonly rulesVersion: string
  readonly specStatus: string
}

export interface ClaimedTraceabilityLink {
  readonly linkType: string
  readonly targetId: string
  readonly status: string
  readonly freshnessToken: string
}

export interface ExecutionContractReadinessClaim {
  readonly binding: ClaimedExecutionContractBinding
  readonly requirements: readonly ClaimedTraceabilityLink[]
  readonly decisions: readonly ClaimedTraceabilityLink[]
}

/** A status this evaluator already knows to reject outright — anything else is treated as APPROVED-equivalent or unrecognized by the domain classifier's own `knownIneligibleStatuses` check. */
const KNOWN_INELIGIBLE_SPEC_STATUSES = ['DRAFT', 'REJECTED', 'SUPERSEDED']

function toCanonicalLink(linkType: string, targetId: string, status: string, updatedAt: Date): CanonicalTraceabilityLink {
  return { linkType, targetId, status, freshnessToken: updatedAt.toISOString() }
}

/** Canonical requirement/decision links with their freshness tokens, read fresh from the same transaction — a separate projection from `resolveImplementationSpecEligibilityInTransaction`'s own link reads, since that resolver has no reason to carry `updatedAt`. */
async function readCanonicalTraceability(
  tx: Prisma.TransactionClient,
  projectId: string,
  specId: string,
): Promise<{ requirements: CanonicalTraceabilityLink[], decisions: CanonicalTraceabilityLink[] }> {
  const requirementLinks = await tx.implementationSpecRequirement.findMany({
    where: { projectId, specId },
    select: { requirement: { select: { id: true, status: true, updatedAt: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const decisionLinks = await tx.implementationSpecDecision.findMany({
    where: { projectId, specId },
    select: { decision: { select: { id: true, status: true, updatedAt: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })

  return {
    requirements: requirementLinks.map(link => toCanonicalLink('REQUIREMENT', link.requirement.id, link.requirement.status, link.requirement.updatedAt)),
    decisions: decisionLinks.map(link => toCanonicalLink('DECISION', link.decision.id, link.decision.status, link.decision.updatedAt)),
  }
}

function toClaimedCanonicalShape(link: ClaimedTraceabilityLink): CanonicalTraceabilityLink {
  return { linkType: link.linkType, targetId: link.targetId, status: link.status, freshnessToken: link.freshnessToken }
}

/**
 * Evaluates whether canonical state, read fresh right now inside the
 * caller's transaction, agrees with what a schema 2.0.0 candidate's exact
 * eligibility binding and traceability sets claim.
 *
 * This is **the** call P0-042 exposes for readiness. It never accepts a
 * caller-supplied "eligible" or "current" flag: the canonical eligibility
 * signal, the governing specification's own identity columns, and the
 * traceability links are all read directly from the database inside this
 * call, using the transaction the caller already holds the project lock in.
 */
/**
 * A candidate cannot claim a binding to a spec that was never generated
 * against one (P0-041 refuses to generate without an eligible spec), so a
 * governing spec genuinely absent here means the claim itself is
 * contradictory, not merely a transient gap — the domain classifier's
 * "unrecognized status" path (FAIL) rather than "known ineligible" (BLOCKED).
 */
function canonicalSpecStatusOf(spec: ImplementationSpec | null): string {
  if (spec === null) return 'MISSING'
  const content = readImplementationSpecContent(spec)
  return content.ok ? spec.status : 'INVALID_CONTENT'
}

function buildIdentityFacts(
  claim: ExecutionContractReadinessClaim,
  canonical: { projectId: string, taskId: string, sprintId: string, spec: ImplementationSpec | null },
): IdentityFactPair[] {
  const spec = canonical.spec
  return [
    { field: 'projectId', claimed: claim.binding.projectId, canonical: canonical.projectId },
    { field: 'taskId', claimed: claim.binding.taskId, canonical: canonical.taskId },
    { field: 'sprintId', claimed: claim.binding.sprintId, canonical: canonical.sprintId },
    { field: 'specId', claimed: claim.binding.specId, canonical: spec === null ? '' : spec.id },
    { field: 'lineageCode', claimed: claim.binding.lineageCode, canonical: spec === null ? '' : spec.code },
    { field: 'specVersion', claimed: claim.binding.specVersion, canonical: spec === null ? '' : spec.version },
    { field: 'contentHash', claimed: claim.binding.contentHash, canonical: spec === null ? '' : spec.contentHash },
    { field: 'rulesVersion', claimed: claim.binding.rulesVersion, canonical: spec === null ? '' : spec.rulesVersion },
  ]
}

export async function resolveExecutionContractReadinessInTransaction(
  tx: Prisma.TransactionClient,
  projectId: string,
  taskId: string,
  claim: ExecutionContractReadinessClaim,
): Promise<ReadinessEvaluationOutcome> {
  const task = await tx.task.findUnique({ where: { id: taskId }, select: { projectId: true, sprintId: true } })
  if (!task || task.projectId !== projectId) {
    throw new TaskNotFoundError(taskId)
  }

  const eligibility = await resolveImplementationSpecEligibilityInTransaction(tx, projectId, taskId)
  const eligibilitySignal = eligibility.eligible ? EligibilitySignal.ELIGIBLE : EligibilitySignal.INELIGIBLE

  const spec = await findGoverningSpecForTask(tx, projectId, taskId)
  const canonicalTraceability = spec === null
    ? { requirements: [], decisions: [] }
    : await readCanonicalTraceability(tx, projectId, spec.id)

  const canonicalSpecStatus = canonicalSpecStatusOf(spec)
  const identity = buildIdentityFacts(claim, { projectId, taskId, sprintId: task.sprintId, spec })

  return evaluateExecutionContractReadiness({
    eligibilitySignal,
    knownIneligibleStatuses: KNOWN_INELIGIBLE_SPEC_STATUSES,
    specStatus: canonicalSpecStatus,
    identity,
    claimedRequirements: claim.requirements.map(toClaimedCanonicalShape),
    canonicalRequirements: canonicalTraceability.requirements,
    claimedDecisions: claim.decisions.map(toClaimedCanonicalShape),
    canonicalDecisions: canonicalTraceability.decisions,
  })
}

/**
 * The read-only projection of the same question, for display and reporting
 * — exactly the same relationship `resolveImplementationSpecExecutionEligibility`
 * has to its own transaction-scoped resolver. A caller that grants any
 * authority on this answer must call the transaction-scoped function above
 * inside its own writing transaction instead, so the check and the write
 * cannot be separated.
 */
export async function resolveExecutionContractReadiness(
  client: PrismaClient,
  projectId: string,
  taskId: string,
  claim: ExecutionContractReadinessClaim,
): Promise<ReadinessEvaluationOutcome> {
  return withConsistentProjectReadTransaction(client, projectId, async tx =>
    resolveExecutionContractReadinessInTransaction(tx, projectId, taskId, claim))
}
