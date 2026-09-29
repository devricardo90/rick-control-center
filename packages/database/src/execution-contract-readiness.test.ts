/**
 * Integration and concurrency tests for the P0-042 transactional readiness
 * resolver (AC-03 through AC-08, AC-10, AC-11).
 *
 * Per RIC-SPEC-NDERCC-39-001 §9, every P0-042 integration/concurrency test
 * must target only the explicitly provisioned isolated instance
 * (127.0.0.1:5456/rick_p042_test) — never the shared development database
 * these other test files in this package legitimately use. The whole suite
 * is therefore skipped unless the process's own `DATABASE_URL` already
 * points at that isolated target (see `test-support.ts`'s guard), which
 * `pnpm test`/`pnpm validate` do not do by default in this repository.
 *
 * Per SDD §6/§13, an approved test *specification* is a readiness condition;
 * *executed* evidence is a completion condition, and execution "remains
 * blocked until the isolated database and permitted operations are
 * explicitly provisioned and verified" — which for this suite specifically
 * means the isolated instance's schema must be migrated, a separately
 * governed step this implementation unit does not perform. This file is
 * therefore written to run for real the moment that migration is
 * separately authorized and applied, and skips cleanly until then.
 */
import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient, Project, Task } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ReadinessResult } from '@rick/domain'
import type { ImplementationSpecContentInput } from '@rick/domain'
import { recordDocumentSnapshotSync } from './document-snapshot.js'
import { createDocumentSource } from './document-source.js'
import type { ClaimedTraceabilityLink, ExecutionContractReadinessClaim } from './execution-contract-readiness.js'
import { resolveExecutionContractReadiness, resolveExecutionContractReadinessInTransaction } from './execution-contract-readiness.js'
import { approveImplementationSpec, createImplementationSpec } from './implementation-spec.js'
import { getPrimaryOperator, upsertPrimaryOperator } from './operator.js'
import { createProject } from './project.js'
import { createSprint } from './sprint.js'
import { extractStrategicTruth } from './strategic-truth.js'
import { createTask } from './task.js'
import { createP042TestClient, isIsolatedP042DatabaseUrl, uniqueSlug } from './test-support.js'

const targetsIsolatedInstance = isIsolatedP042DatabaseUrl(process.env['DATABASE_URL'] ?? '')

describe('P0-042 execution contract readiness (isolated instance only)', () => {
  // `describe.skipIf` only skips the contained `it` blocks — it still runs
  // this factory during collection, so a client construction that throws
  // (as `createP042TestClient` does for any non-isolated target) would fail
  // the whole file rather than skip cleanly. Guarding here, before any
  // client is constructed, is what actually makes a plain `pnpm test`
  // against the shared development database skip this suite instead of
  // failing it.
  if (!targetsIsolatedInstance) {
    it.skip('requires DATABASE_URL to target the isolated P0-042 instance (127.0.0.1:5456/rick_p042_test?schema=public)', () => {})
    return
  }

  // This environment's Docker-on-Windows round-trip latency is variable and
  // materially higher than vitest's plain 5000ms default under the load of
  // 12+ sequential multi-round-trip tests against one small container —
  // observed directly (a non-concurrency test timed out at exactly 5000ms
  // with no other change). Every test in this file gets the same generous
  // budget the pre-existing eligibility-concurrency suite already uses.
  vi.setConfig({ testTimeout: 30_000 })

  const client: PrismaClient = createP042TestClient()
  const concurrentClient: PrismaClient = createP042TestClient()

  // Without this, the AC-11 tests' first-ever use of `concurrentClient` pays
  // full connection-establishment latency *during* the blocking-detection
  // poll below, racing it against the poll's own fixed iteration budget —
  // a test-harness timing artifact, not a property of the resolver under
  // test. Same fix as implementation-spec.test.ts's own concurrency suite.
  beforeAll(async () => {
    await concurrentClient.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    await Promise.all([client.$disconnect(), concurrentClient.$disconnect()])
  })

  function content(): ImplementationSpecContentInput {
    return {
      title: 'P0-042 readiness fixture',
      behavior: 'A specification whose readiness is evaluated against canonical state.',
      scope: ['prove readiness re-reads canonical state'],
      nonGoals: ['no contract persistence or hashing'],
      acceptanceCriteria: ['readiness matches canonical state exactly'],
      constraints: [],
      dependencies: [],
      risks: [],
      interfaces: [],
      validationStrategy: [],
    }
  }

  async function approverId(): Promise<string> {
    const existing = await getPrimaryOperator(client)
    if (existing) return existing.id
    const created = await upsertPrimaryOperator(client, {
      username: uniqueSlug('p042-approver'),
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder',
    })
    return created.id
  }

  async function seedTask(prefix: string): Promise<{ project: Project, task: Task }> {
    const project = await createProject(client, { key: uniqueSlug(prefix), name: `${prefix} project` })
    const sprint = await createSprint(client, { projectId: project.id, code: uniqueSlug('spr'), title: 'Sprint', sequence: 0 })
    const task = await createTask(client, {
      projectId: project.id,
      sprintId: sprint.id,
      code: uniqueSlug('tsk'),
      type: 'TASK',
      title: 'Governed unit of work',
      priority: 'P0',
      sequence: 0,
    })
    return { project, task }
  }

  /** `suffix` distinguishes the requirement/decision codes so a second, genuinely different traceability set can be seeded in the same project (AC-11(B) needs a successor spec traced to a different set than the original). */
  function truthSource(suffix: string): string {
    return [
      '# Strategic source',
      `REQ-042-${suffix}: [P0] Readiness is re-evaluated from canonical state.`,
      '',
      `## DEC-RIC-042-${suffix} — Readiness authority`,
      '- Status: APPROVED',
      '- Decision: Canonical state, not the candidate, is authoritative.',
    ].join('\n')
  }

  async function seedStrategicTruth(projectId: string, suffix = 'A'): Promise<{ requirementId: string, decisionId: string, documentSourceId: string }> {
    const source = await createDocumentSource(client, {
      projectId,
      provider: 'GOOGLE_DRIVE',
      externalFileId: uniqueSlug('p042-truth-file'),
      documentType: 'PRD',
      title: 'Readiness truth source',
      url: 'https://docs.google.com/document/d/p042/edit',
      approvalStatus: 'APPROVED',
    })
    const text = truthSource(suffix)
    const synced = await recordDocumentSnapshotSync(client, {
      projectId,
      documentSourceId: source.id,
      providerVersion: '1',
      contentText: text,
      checksum: createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'),
      providerModifiedAt: new Date('2026-09-28T00:00:00.000Z'),
      syncedAt: new Date(),
    })
    await extractStrategicTruth(client, { projectId, documentSourceId: source.id, sourceSnapshotId: synced.snapshot.id })
    const requirement = await client.requirement.findFirstOrThrow({ where: { projectId, code: `REQ-042-${suffix}` } })
    const decision = await client.decision.findFirstOrThrow({ where: { projectId, code: `DEC-RIC-042-${suffix}` } })
    return { requirementId: requirement.id, decisionId: decision.id, documentSourceId: source.id }
  }

  async function seedReadyTask(prefix: string) {
    const { project, task } = await seedTask(prefix)
    const truth = await seedStrategicTruth(project.id)
    const spec = await createImplementationSpec(client, {
      projectId: project.id,
      taskId: task.id,
      code: uniqueSlug(`ric-spec-${prefix}`),
      version: '1.0.0',
      content: content(),
      requirementIds: [truth.requirementId],
      decisionIds: [truth.decisionId],
    })
    const approved = await approveImplementationSpec(client, {
      projectId: project.id,
      specId: spec.id,
      approvedByOperatorId: await approverId(),
    })
    return { project, task, spec: approved, requirementId: truth.requirementId, decisionId: truth.decisionId, documentSourceId: truth.documentSourceId }
  }

  function linkFor(targetId: string, linkType: string, status: string, freshnessToken: string): ClaimedTraceabilityLink {
    return { linkType, targetId, status, freshnessToken }
  }

  /** A claim that agrees exactly with what `seedReadyTask` just wrote — the only claim this suite treats as the "true" one. */
  async function claimFor(seed: Awaited<ReturnType<typeof seedReadyTask>>): Promise<ExecutionContractReadinessClaim> {
    const requirement = await client.requirement.findUniqueOrThrow({ where: { id: seed.requirementId } })
    const decision = await client.decision.findUniqueOrThrow({ where: { id: seed.decisionId } })
    return {
      binding: {
        projectId: seed.project.id,
        taskId: seed.task.id,
        sprintId: seed.task.sprintId,
        specId: seed.spec.id,
        lineageCode: seed.spec.code,
        specVersion: seed.spec.version,
        contentHash: seed.spec.contentHash,
        rulesVersion: seed.spec.rulesVersion,
        specStatus: seed.spec.status,
      },
      requirements: [linkFor(requirement.id, 'REQUIREMENT', requirement.status, requirement.updatedAt.toISOString())],
      decisions: [linkFor(decision.id, 'DECISION', decision.status, decision.updatedAt.toISOString())],
    }
  }

  it('AC-01 / AC-03: PASSes for a claim that agrees exactly with fresh canonical state, deterministically', async () => {
    const seed = await seedReadyTask('ready')
    const claim = await claimFor(seed)

    const first = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    const second = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)

    expect(first).toEqual(second)
    expect(first.result).toBe(ReadinessResult.PASS)
    expect(first.findings).toEqual([])
  })

  it('AC-03: a forged claim (agreeing with nothing real) is never trusted as a gate', async () => {
    const seed = await seedReadyTask('forged')
    const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
      binding: {
        projectId: seed.project.id,
        taskId: seed.task.id,
        sprintId: seed.task.sprintId,
        specId: 'forged-spec-id',
        lineageCode: 'FORGED',
        specVersion: '9.9.9',
        contentHash: 'forged-hash',
        rulesVersion: 'forged-rules',
        specStatus: 'APPROVED',
      },
      requirements: [linkFor('forged-req', 'REQUIREMENT', 'ACTIVE', 'forged')],
      decisions: [],
    })

    expect(outcome.result).toBe(ReadinessResult.FAIL)
  })

  it('AC-04 / AC-07: FAILs on a substituted contentHash, specId, or projectId', async () => {
    const seed = await seedReadyTask('substituted')
    const claim = await claimFor(seed)

    for (const override of [
      { contentHash: 'substituted-hash' },
      { specId: 'substituted-spec-id' },
      { projectId: 'substituted-project-id' },
    ] as const) {
      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, ...override },
      })
      expect(outcome.result).toBe(ReadinessResult.FAIL)
    }
  })

  it('AC-05: FAILs on a missing, additional, or substituted traceability link', async () => {
    const seed = await seedReadyTask('links')
    const claim = await claimFor(seed)

    const missing = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, { ...claim, requirements: [] })
    expect(missing.result).toBe(ReadinessResult.FAIL)

    const additional = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
      ...claim,
      requirements: [...claim.requirements, linkFor('extra-req', 'REQUIREMENT', 'ACTIVE', 'x')],
    })
    expect(additional.result).toBe(ReadinessResult.FAIL)

    const substituted = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
      ...claim,
      requirements: [linkFor('substituted-req', 'REQUIREMENT', 'ACTIVE', 'x')],
    })
    expect(substituted.result).toBe(ReadinessResult.FAIL)
  })

  it('AC-06: a claim that agreed at seed time no longer PASSes after canonical state moves on', async () => {
    const seed = await seedReadyTask('stale')
    const claim = await claimFor(seed)

    expect((await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)).result).toBe(ReadinessResult.PASS)

    await client.requirement.update({ where: { id: seed.requirementId }, data: { status: 'SUPERSEDED' } })

    const after = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    expect(after.result).not.toBe(ReadinessResult.PASS)
  })

  it('AC-07: FAILs for a task/project pairing that does not match', async () => {
    const seedA = await seedReadyTask('cross-a')
    const seedB = await seedReadyTask('cross-b')
    const claimFromB = await claimFor(seedB)

    await expect(
      resolveExecutionContractReadiness(client, seedA.project.id, seedB.task.id, claimFromB),
    ).rejects.toThrow()
  })

  it('AC-08: BLOCKs a specification that is currently DRAFT/REJECTED/SUPERSEDED, never PASSes', async () => {
    const seed = await seedReadyTask('lifecycle')
    const claim = await claimFor(seed)
    await client.implementationSpec.update({ where: { id: seed.spec.id }, data: { status: 'SUPERSEDED', supersededAt: new Date() } })

    const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    expect(outcome.result).toBe(ReadinessResult.BLOCKED)
  })

  it('AC-08/AC-09: FAILs for a task that has never had any governing specification at all', async () => {
    // A P0-041-generated claim can never name a spec this way (generation
    // requires an eligible spec to exist), but readiness itself accepts any
    // claim for any task, so this path must still fail closed rather than
    // silently treating "no spec found" as any known-ineligible category.
    const { project, task } = await seedTask('no-spec-ever')
    const claim: ExecutionContractReadinessClaim = {
      binding: {
        projectId: project.id,
        taskId: task.id,
        sprintId: task.sprintId,
        specId: 'claimed-spec-id',
        lineageCode: 'RIC-SPEC-CLAIMED-001',
        specVersion: '1.0.0',
        contentHash: 'claimed-hash',
        rulesVersion: 'claimed-rules',
        specStatus: 'APPROVED',
      },
      requirements: [{ linkType: 'REQUIREMENT', targetId: 'claimed-req', status: 'ACTIVE', freshnessToken: 't1' }],
      decisions: [],
    }

    const outcome = await resolveExecutionContractReadiness(client, project.id, task.id, claim)
    expect(outcome.result).toBe(ReadinessResult.FAIL)
  })

  it('AC-10: each negative vector reports independently attributable evidence', async () => {
    const seed = await seedReadyTask('vectors')
    const claim = await claimFor(seed)

    const forgedIdentity = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, { ...claim, binding: { ...claim.binding, contentHash: 'x' } })
    const missingLink = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, { ...claim, requirements: [] })

    expect(forgedIdentity.findings[0]?.field).toBe('contentHash')
    expect(missingLink.findings[0]?.field).toBe('traceability.requirements')
    expect(forgedIdentity.findings).not.toEqual(missingLink.findings)
  })

  // ── AC-11: transaction-scoped readiness under canonical writers ────────────
  //
  // Per SDD §6/AC-11, the readiness evaluation transaction is opened FIRST
  // and holds the shared project lock; the canonical writer is then invoked
  // through the second client via its real, unmodified API
  // (`extractStrategicTruth`, `approveImplementationSpec` — never a raw SQL
  // substitute) and must queue behind it. `pg_blocking_pids` proves the
  // queuing is real rather than inferred from promise-settlement order.

  // extractStrategicTruth/approveImplementationSpec each run inside their own
  // ~5s-budgeted Prisma interactive transaction, and the suite-wide 30s
  // testTimeout above already gives the surrounding vitest tests room for
  // seeding plus that.

  // Wall-clock-bounded, not iteration-count-bounded: this environment's
  // per-round-trip latency varies enough (observed directly while
  // diagnosing this suite) that a fixed iteration count is not a reliable
  // proxy for a fixed real-time budget. A time deadline keeps the reader's
  // total lock-hold time predictable regardless of per-query latency, which
  // matters because the writer's own Prisma interactive transaction has an
  // internal ~5s budget it cannot be blocked past without erroring.
  const BLOCKING_POLL_BUDGET_MS = 3_000

  async function waitUntilBlocked(tx: Prisma.TransactionClient): Promise<boolean> {
    const pidRows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
    const holderPid = pidRows[0]?.pid
    expect(holderPid).toBeDefined()

    const deadline = Date.now() + BLOCKING_POLL_BUDGET_MS
    while (Date.now() < deadline) {
      const blockedRows = await tx.$queryRaw<{ blocked: number }[]>`
        SELECT count(*)::int AS blocked
          FROM pg_stat_activity activity
         WHERE activity.pid <> ${holderPid}
           AND ${holderPid} = ANY(pg_blocking_pids(activity.pid))
      `
      if ((blockedRows[0]?.blocked ?? 0) > 0) return true
    }
    return false
  }

  it('AC-11(A): a genuine concurrent extractStrategicTruth writer queues behind an open readiness-evaluation transaction', async () => {
    const seed = await seedReadyTask('barrier-a')
    const claim = await claimFor(seed)

    // Supersession is scoped to `existing.documentSourceId === input.documentSourceId`
    // (strategic-truth.ts), so the second snapshot must land on the SAME
    // source seedReadyTask already used, and must simply omit REQ-042-A —
    // a requirement is superseded by disappearing from its own source's
    // latest candidate set, not by any inline status annotation.
    const supersedingText = '# Strategic source, revision 2 (REQ-042-A no longer present)'
    const secondSnapshot = await recordDocumentSnapshotSync(client, {
      projectId: seed.project.id,
      documentSourceId: seed.documentSourceId,
      providerVersion: '2',
      contentText: supersedingText,
      checksum: createHash('sha256').update(Buffer.from(supersedingText, 'utf8')).digest('hex'),
      providerModifiedAt: new Date('2026-09-28T01:00:00.000Z'),
      syncedAt: new Date(),
    })

    const order: string[] = []
    let writerPromise: Promise<void> | undefined
    let writerBlocked = false
    let readerOutcome: Awaited<ReturnType<typeof resolveExecutionContractReadinessInTransaction>> | undefined

    await client.$transaction(async (tx) => {
      // Take exactly the lock `withConsistentProjectReadTransaction` would take, then evaluate.
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${seed.project.id}::uuid FOR UPDATE`
      readerOutcome = await resolveExecutionContractReadinessInTransaction(tx, seed.project.id, seed.task.id, claim)

      writerPromise = extractStrategicTruth(concurrentClient, {
        projectId: seed.project.id,
        documentSourceId: seed.documentSourceId,
        sourceSnapshotId: secondSnapshot.snapshot.id,
      }).then(() => {
        order.push('writer')
      })

      writerBlocked = await waitUntilBlocked(tx)
    })
    order.push('commit')

    await (writerPromise ?? Promise.reject(new Error('writer was never started')))

    expect(writerBlocked).toBe(true)
    expect(order).toEqual(['commit', 'writer'])
    // The reader evaluated entirely before the writer's change committed, so
    // it observed the fully-pre-write state.
    expect(readerOutcome?.result).toBe(ReadinessResult.PASS)

    // And a fresh evaluation now observes the fully-post-write state — the
    // requirement the writer superseded is no longer ACTIVE, so the old
    // claim (still asserting ACTIVE) no longer matches.
    const after = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    expect(after.result).not.toBe(ReadinessResult.PASS)
  })

  it('AC-11(B): a genuine concurrent approveImplementationSpec writer (superseding to a different traceability set) queues behind an open readiness-evaluation transaction', async () => {
    const seed = await seedReadyTask('barrier-b')
    const claim = await claimFor(seed)

    // A different exact traceability set: its own requirement/decision, not seed's.
    const successorTruth = await seedStrategicTruth(seed.project.id, 'SUCCESSOR')
    const successor = await createImplementationSpec(client, {
      projectId: seed.project.id,
      taskId: seed.task.id,
      code: uniqueSlug('ric-spec-barrier-b-successor'),
      version: '2.0.0',
      content: content(),
      requirementIds: [successorTruth.requirementId],
      decisionIds: [successorTruth.decisionId],
    })

    const order: string[] = []
    let writerPromise: Promise<void> | undefined
    let writerBlocked = false
    let readerOutcome: Awaited<ReturnType<typeof resolveExecutionContractReadinessInTransaction>> | undefined

    await client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${seed.project.id}::uuid FOR UPDATE`
      readerOutcome = await resolveExecutionContractReadinessInTransaction(tx, seed.project.id, seed.task.id, claim)

      writerPromise = approveImplementationSpec(concurrentClient, {
        projectId: seed.project.id,
        specId: successor.id,
        approvedByOperatorId: await approverId(),
        supersedesSpecId: seed.spec.id,
      }).then(() => {
        order.push('writer')
      })

      writerBlocked = await waitUntilBlocked(tx)
    })
    order.push('commit')

    await (writerPromise ?? Promise.reject(new Error('writer was never started')))

    expect(writerBlocked).toBe(true)
    expect(order).toEqual(['commit', 'writer'])
    // The reader saw the original spec still APPROVED and governing — never
    // a state that mixes the original identity with the successor's.
    expect(readerOutcome?.result).toBe(ReadinessResult.PASS)

    // Post-commit, the original spec is SUPERSEDED and the successor (with
    // its own, different traceability set) governs instead — the old claim
    // no longer matches canonical state at all.
    const after = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    expect(after.result).not.toBe(ReadinessResult.PASS)
  })

  it('AC-11(D): does not claim protection from a direct, out-of-band SQL writer bypassing the shared lock', async () => {
    // Documented, not asserted as prevented — SDD §6.D/E: this evaluator
    // proves consistency with the canonical *application* writer APIs only.
    const seed = await seedReadyTask('out-of-band')
    const claim = await claimFor(seed)

    // A write that does NOT go through the shared project-lock discipline.
    await client.$executeRaw`UPDATE requirements SET status = 'SUPERSEDED' WHERE id = ${seed.requirementId}::uuid`

    const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    // The out-of-band write is still visible once committed — readiness
    // still re-reads canonical state fresh — but no lock-contention evidence
    // is claimed or required for this case.
    expect(outcome.result).not.toBe(ReadinessResult.PASS)
  })

  it('AC-14: a PASS result carries no execution/side-effect capability of its own', async () => {
    const seed = await seedReadyTask('authority-boundary')
    const claim = await claimFor(seed)
    const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)

    expect(outcome.result).toBe(ReadinessResult.PASS)
    expect(Object.keys(outcome)).toEqual(['result', 'rulesVersion', 'findings'])
  })
})
