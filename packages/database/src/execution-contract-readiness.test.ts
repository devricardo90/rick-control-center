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
import type { PrismaClient, Project, Task } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EXECUTION_CONTRACT_EVALUATOR_NAME, EXECUTION_CONTRACT_GENERATOR_VERSION, ReadinessResult, SPEC_LIFECYCLE_VERSION } from '@rick/domain'
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
import { createP042SingleConnectionTestClient, createP042TestClient, isIsolatedP042DatabaseUrl, uniqueSlug } from './test-support.js'

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
  // AC-11's three distinct database participants (RIC-SPEC-NDERCC-39-001 §6):
  // `client` above is the READER (holds the project lock and evaluates
  // readiness). `writerClient` is the WRITER — pinned to a single physical
  // connection so its backend pid is stable and known before any lock
  // attempt, letting the OBSERVER identify contention attributable to this
  // exact backend rather than "some backend is blocked by the reader".
  // `observerClient` is the OBSERVER — a fully independent connection that
  // polls `pg_blocking_pids`/`pg_stat_activity`, so its polling never shares
  // connection/transaction-time budget with the reader's own transaction.
  const writerClient: PrismaClient = createP042SingleConnectionTestClient()
  const observerClient: PrismaClient = createP042TestClient()

  // All three participants must be connection-ready before any AC-11 test
  // begins acquiring its lock (T1). Without this, a participant's
  // first-ever query pays full connection-establishment latency *during*
  // the test's critical timing window, racing a harness artifact against
  // the lock invariant under test. Same root fix as
  // implementation-spec.test.ts's own concurrency suite.
  //
  // Deliberately NOT captured here: the writer's backend pid. A pid
  // captured once at file-start and reused for the rest of the file's
  // tests is not authoritative — `pg.Pool`'s default `idleTimeoutMillis`
  // (10s) can and does recycle an idle pooled connection, silently handing
  // the next query a different backend. Proven directly (RIC-SPEC-NDERCC-39-001
  // §6 AC-11 diagnostic audit): under full-suite load, more than 10s
  // elapsed between this prewarm and AC-11(A)'s first real use of
  // `writerClient`, and the pid captured here was confirmed completely
  // absent from `pg_stat_activity` by the time the test ran — while the
  // *actual* (recycled) backend was genuinely, continuously blocked by the
  // reader the whole time. The fix is to never trust a pid older than the
  // immediately-preceding query: each AC-11 test re-reads
  // `writerClient`'s current backend pid itself, immediately before
  // invoking that test's canonical writer call, with no unrelated
  // asynchronous work in between — see each test body below.
  beforeAll(async () => {
    await observerClient.$queryRaw`SELECT 1`
    await writerClient.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    await Promise.all([client.$disconnect(), writerClient.$disconnect(), observerClient.$disconnect()])
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
    if (seed.spec.approvedByOperatorId === null || seed.spec.approvedAt === null) {
      throw new Error('seedReadyTask always approves the spec it creates; approval columns must be set')
    }
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
        approvedByOperatorId: seed.spec.approvedByOperatorId,
        approvedAt: seed.spec.approvedAt.toISOString(),
        evaluator: {
          evaluatorName: EXECUTION_CONTRACT_EVALUATOR_NAME,
          evaluatorVersion: EXECUTION_CONTRACT_GENERATOR_VERSION,
          rulesVersion: SPEC_LIFECYCLE_VERSION,
          evaluatedAt: '2026-09-28T10:00:00.000Z',
        },
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
        approvedByOperatorId: 'forged-operator-id',
        approvedAt: '2026-09-28T09:00:00.000Z',
        evaluator: {
          evaluatorName: 'forged-evaluator',
          evaluatorVersion: 'forged-version',
          rulesVersion: 'forged-rules-version',
          evaluatedAt: '2026-09-28T10:00:00.000Z',
        },
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

  describe('AC-04: every exact-bound approval and evaluator-provenance fact is independently re-checked against canonical state, not merely transported (finding 3)', () => {
    it('FAILs on a substituted specStatus, even though the top-level eligibility check reads the same canonical status', async () => {
      const seed = await seedReadyTask('specstatus')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, specStatus: 'DRAFT' },
      })

      expect(outcome.result).toBe(ReadinessResult.FAIL)
      expect(outcome.findings.some(finding => finding.field === 'specStatus')).toBe(true)
    })

    it('FAILs on a substituted approvedByOperatorId', async () => {
      const seed = await seedReadyTask('approver')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, approvedByOperatorId: 'substituted-operator-id' },
      })

      expect(outcome.result).toBe(ReadinessResult.FAIL)
      expect(outcome.findings.some(finding => finding.field === 'approvedByOperatorId')).toBe(true)
    })

    it('FAILs on a substituted approvedAt', async () => {
      const seed = await seedReadyTask('approvedat')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, approvedAt: '2099-01-01T00:00:00.000Z' },
      })

      expect(outcome.result).toBe(ReadinessResult.FAIL)
      expect(outcome.findings.some(finding => finding.field === 'approvedAt')).toBe(true)
    })

    it('FAILs on a claimed evaluator.evaluatorName that disagrees with the trusted code constant, even when every other fact is genuine', async () => {
      const seed = await seedReadyTask('evalname')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, evaluator: { ...claim.binding.evaluator, evaluatorName: 'a-different-evaluator' } },
      })

      expect(outcome.result).toBe(ReadinessResult.FAIL)
      expect(outcome.findings.some(finding => finding.field === 'evaluator.evaluatorName')).toBe(true)
    })

    it('FAILs on a claimed evaluator.evaluatorVersion that disagrees with the trusted code constant', async () => {
      const seed = await seedReadyTask('evalversion')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, evaluator: { ...claim.binding.evaluator, evaluatorVersion: 'P9_999_V9' } },
      })

      expect(outcome.result).toBe(ReadinessResult.FAIL)
      expect(outcome.findings.some(finding => finding.field === 'evaluator.evaluatorVersion')).toBe(true)
    })

    it('FAILs on a claimed evaluator.rulesVersion that disagrees with the freshly resolved eligibility rules version', async () => {
      const seed = await seedReadyTask('evalrules')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, {
        ...claim,
        binding: { ...claim.binding, evaluator: { ...claim.binding.evaluator, rulesVersion: 'STALE_RULES_V0' } },
      })

      expect(outcome.result).toBe(ReadinessResult.FAIL)
      expect(outcome.findings.some(finding => finding.field === 'evaluator.rulesVersion')).toBe(true)
    })

    it('a claim with every approval/evaluator fact genuine still PASSes — the new checks do not reject real claims', async () => {
      const seed = await seedReadyTask('genuine-approval')
      const claim = await claimFor(seed)

      const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)

      expect(outcome.result).toBe(ReadinessResult.PASS)
    })
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

  it('AC-08: BLOCKs a specification that is currently DRAFT/REJECTED/SUPERSEDED, never PASSes, when the claim honestly reports that status', async () => {
    const seed = await seedReadyTask('lifecycle')
    const claim = await claimFor(seed)
    await client.implementationSpec.update({ where: { id: seed.spec.id }, data: { status: 'SUPERSEDED', supersededAt: new Date() } })

    // An honest claim — one whose specStatus is refreshed to match the now-SUPERSEDED
    // canonical state — reaches the known-ineligible BLOCKED path, not a mismatch.
    const honestClaim = { ...claim, binding: { ...claim.binding, specStatus: 'SUPERSEDED' } }
    const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, honestClaim)
    expect(outcome.result).toBe(ReadinessResult.BLOCKED)
  })

  it('AC-04 / AC-08: a claim that still asserts the pre-supersession specStatus FAILs as a stale identity mismatch, never merely BLOCKED', async () => {
    // The companion case to the test above: this is exactly the Finding-3 gap
    // — before specStatus was bound as an exact identity fact, a claim that
    // never updated its specStatus after canonical state moved on was
    // invisible to this check and fell through to BLOCKED on the canonical
    // status alone. It must now FAIL as a substituted/stale fact instead.
    const seed = await seedReadyTask('lifecycle-stale-claim')
    const claim = await claimFor(seed)
    await client.implementationSpec.update({ where: { id: seed.spec.id }, data: { status: 'SUPERSEDED', supersededAt: new Date() } })

    const outcome = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    expect(outcome.result).toBe(ReadinessResult.FAIL)
    expect(outcome.findings.some(finding => finding.field === 'specStatus')).toBe(true)
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
        approvedByOperatorId: 'claimed-operator-id',
        approvedAt: '2026-09-28T09:00:00.000Z',
        evaluator: {
          evaluatorName: EXECUTION_CONTRACT_EVALUATOR_NAME,
          evaluatorVersion: EXECUTION_CONTRACT_GENERATOR_VERSION,
          rulesVersion: SPEC_LIFECYCLE_VERSION,
          evaluatedAt: '2026-09-28T10:00:00.000Z',
        },
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

  // The reader's own `client.$transaction(...)` call in AC-11(A)/(B) also
  // needs an explicit bound: Prisma's library default for an interactive
  // transaction is 5000ms, and `observeLockContention` below can
  // legitimately need longer than that to collect its evidence under
  // contention — it has no budget of its own by design (see its own doc
  // comment). Left at the default, the reader's transaction can expire
  // before the loop ever produces a verdict, which is a test-harness bound
  // problem, not evidence of a locking defect (passing runs show the real
  // mechanism resolves in under a second). `timeout` is raised to 25_000ms
  // (replacing the 5000ms default; an earlier 20_000ms value was observed to
  // fail under genuine full-repository-suite contention, with the reader's
  // callback completing at ~20.02-20.06s real evidence-gathering work, not a
  // hang — 25_000ms gives roughly 25% headroom over that high-water mark
  // while staying under the 30_000ms testTimeout below) and `maxWait` to
  // 5_000ms (covering
  // connection-pool acquisition under contention) — both explicit, both
  // test-only options passed to this one call site, both staying safely
  // under this file's own 30_000ms `testTimeout` so that remains the single
  // outer, authoritative bound. Production code
  // (`withMutableProjectTransaction`/`withConsistentProjectReadTransaction`/
  // `lockProject`) is untouched and keeps Prisma's default.
  const READER_TRANSACTION_BOUND = { maxWait: 5_000, timeout: 25_000 }

  // Evidence-bounded, not a fixed short sub-budget: Postgres's row-level
  // `SELECT ... FOR UPDATE` lock is a deterministic guarantee, not
  // best-effort, so a genuine concurrent attempt against the row this
  // reader holds will eventually show up in `pg_blocking_pids` — there is
  // no scenario where it is correctly blocked but never observable. A
  // fixed, load-independent deadline (the prior design) therefore measured
  // "did we poll often enough in N ms," not "is this actually blocked,"
  // and gave up before ever checking the one signal (`writerPromise`
  // settling) that would prove a real miss. This polls until one of two
  // mutually exclusive, meaningful outcomes is reached — blocked evidence
  // found, or the writer settled first — and is bounded only by whichever
  // happens first, or by this file's own `testTimeout` (30s) if neither
  // ever does. `20`ms between attempts is pacing to avoid flooding
  // `pg_stat_activity`, not a deadline — it does not bound correctness.
  /**
   * Polls on the OBSERVER's own, independent connection — never through the
   * reader's held transaction — for proof that the exact WRITER backend
   * (`expectedWriterPid` — the caller's fresh, immediately-pre-invocation
   * capture; never a pid cached from an earlier point in the file's
   * lifetime, since `pg.Pool` can silently recycle an idle connection) is
   * blocked specifically by the exact READER backend (`readerPid`), racing
   * that evidence against the writer's own promise settling. Bounded only
   * by whichever happens first, or by this file's own `testTimeout` (30s)
   * if neither ever does — Postgres's row-level `SELECT ... FOR UPDATE`
   * lock is a deterministic guarantee, not best-effort, so a genuine
   * attempt against the row the reader holds will eventually show up in
   * `pg_blocking_pids`; there is no scenario where it is correctly blocked
   * but never observable. `20`ms between attempts is pacing to avoid
   * flooding `pg_stat_activity`, not a deadline — it does not bound
   * correctness. Moving polling off the reader's connection means it no
   * longer competes with the reader's own queries for the same
   * connection/transaction-time budget.
   */
  async function observeLockContention(
    readerPid: number,
    expectedWriterPid: number,
    writerPromise: Promise<void>,
  ): Promise<{ blocked: boolean, writerSettledFirst: boolean }> {
    let writerSettled = false
    writerPromise.then(
      () => { writerSettled = true },
      () => { writerSettled = true },
    )

    while (true) {
      const blockedRows = await observerClient.$queryRaw<{ blocked: number }[]>`
        SELECT count(*)::int AS blocked
          FROM pg_stat_activity activity
         WHERE activity.pid = ${expectedWriterPid}
           AND ${readerPid} = ANY(pg_blocking_pids(activity.pid))
      `
      if ((blockedRows[0]?.blocked ?? 0) > 0) {
        return { blocked: true, writerSettledFirst: false }
      }
      // Under Postgres's row-level locking guarantee, the writer's own
      // blocking statement cannot have returned successfully while this
      // reader's transaction still holds the row lock (it has not
      // committed yet — we are still inside the `$transaction` callback).
      // A settled writer observed here is therefore real evidence that it
      // was never actually excluded, not merely evidence we polled too
      // slowly to catch it.
      if (writerSettled) {
        return { blocked: false, writerSettledFirst: true }
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
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
    let contention: { blocked: boolean, writerSettledFirst: boolean } | undefined
    let readerOutcome: Awaited<ReturnType<typeof resolveExecutionContractReadinessInTransaction>> | undefined

    await client.$transaction(async (tx) => {
      // Take exactly the lock `withConsistentProjectReadTransaction` would take, then evaluate.
      const readerPidRows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
      const readerPid = readerPidRows[0]?.pid
      if (readerPid === undefined) throw new Error('reader participant did not report a backend pid')
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${seed.project.id}::uuid FOR UPDATE`
      readerOutcome = await resolveExecutionContractReadinessInTransaction(tx, seed.project.id, seed.task.id, claim)

      // Fresh capture, immediately before invocation, with no unrelated
      // asynchronous work in between: a pid captured any earlier in this
      // file's lifetime is not trustworthy evidence (`pg.Pool` can recycle
      // an idle connection) — see the doc comment above `observeLockContention`.
      const freshWriterPidRows = await writerClient.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
      const freshWriterPid = freshWriterPidRows[0]?.pid
      if (freshWriterPid === undefined) throw new Error('writer participant did not report a fresh backend pid immediately before invocation')
      writerPromise = extractStrategicTruth(writerClient, {
        projectId: seed.project.id,
        documentSourceId: seed.documentSourceId,
        sourceSnapshotId: secondSnapshot.snapshot.id,
      }).then(() => {
        order.push('writer')
      })

      contention = await observeLockContention(readerPid, freshWriterPid, writerPromise)
    }, READER_TRANSACTION_BOUND)
    order.push('commit')

    await (writerPromise ?? Promise.reject(new Error('writer was never started')))

    // All evidence is captured before any assertion runs, so a failure on
    // one fact never suppresses collection of the others.
    const after = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    if (!contention) throw new Error('lock-contention evidence was never collected')

    // A writer that settled before this reader released the project lock is
    // real negative evidence under Postgres's locking guarantee — asserted
    // first and distinctly from "blocked was never observed," so the two
    // failure modes are never conflated.
    expect(contention.writerSettledFirst).toBe(false)
    expect(contention.blocked).toBe(true)
    expect(order).toEqual(['commit', 'writer'])
    // The reader evaluated entirely before the writer's change committed, so
    // it observed the fully-pre-write state.
    expect(readerOutcome?.result).toBe(ReadinessResult.PASS)
    // And a fresh evaluation now observes the fully-post-write state — the
    // requirement the writer superseded is no longer ACTIVE, so the old
    // claim (still asserting ACTIVE) no longer matches.
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
    let contention: { blocked: boolean, writerSettledFirst: boolean } | undefined
    let readerOutcome: Awaited<ReturnType<typeof resolveExecutionContractReadinessInTransaction>> | undefined

    await client.$transaction(async (tx) => {
      const readerPidRows = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
      const readerPid = readerPidRows[0]?.pid
      if (readerPid === undefined) throw new Error('reader participant did not report a backend pid')
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${seed.project.id}::uuid FOR UPDATE`
      readerOutcome = await resolveExecutionContractReadinessInTransaction(tx, seed.project.id, seed.task.id, claim)

      // Resolved before the fresh pid capture below, so the only thing
      // between that capture and the writer invocation is synchronous
      // object construction — no unrelated asynchronous work in the gap.
      const operatorId = await approverId()

      // Fresh capture, immediately before invocation — see the doc comment
      // above `observeLockContention` and AC-11(A)'s identical pattern.
      const freshWriterPidRows = await writerClient.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid()::int AS pid`
      const freshWriterPid = freshWriterPidRows[0]?.pid
      if (freshWriterPid === undefined) throw new Error('writer participant did not report a fresh backend pid immediately before invocation')
      writerPromise = approveImplementationSpec(writerClient, {
        projectId: seed.project.id,
        specId: successor.id,
        approvedByOperatorId: operatorId,
        supersedesSpecId: seed.spec.id,
      }).then(() => {
        order.push('writer')
      })

      contention = await observeLockContention(readerPid, freshWriterPid, writerPromise)
    }, READER_TRANSACTION_BOUND)
    order.push('commit')

    await (writerPromise ?? Promise.reject(new Error('writer was never started')))

    // All evidence is captured before any assertion runs.
    const after = await resolveExecutionContractReadiness(client, seed.project.id, seed.task.id, claim)
    if (!contention) throw new Error('lock-contention evidence was never collected')

    expect(contention.writerSettledFirst).toBe(false)
    expect(contention.blocked).toBe(true)
    expect(order).toEqual(['commit', 'writer'])
    // The reader saw the original spec still APPROVED and governing — never
    // a state that mixes the original identity with the successor's.
    expect(readerOutcome?.result).toBe(ReadinessResult.PASS)
    // Post-commit, the original spec is SUPERSEDED and the successor (with
    // its own, different traceability set) governs instead — the old claim
    // no longer matches canonical state at all.
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
