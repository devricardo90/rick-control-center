# DEC-RIC-008 — Pluggable Agent Harness Architecture: runtime port, presets and resumable trajectory

**Architectural state:** `APPROVED TARGET ARCHITECTURE / NOT IMPLEMENTED`
**Jira issue:** [NDERCC-33](https://ricardodesouzafrancisco.atlassian.net/browse/NDERCC-33) — *Pluggable Agent Harness Architecture — runtime port, presets and resumable trajectory*
**Jira workflow state:** `A fazer` (status category *Itens Pendentes*), type `Tarefa`, priority `Medium`
**Applies to:** NDERCC-33 / RIC-010 EPIC 6 (P0-060 – P1-066) and P1-111 / RIC-003 §Agent Runtime
**Reconciled at repository baseline:** `d91af2b` (`origin/main`)
**Date:** 2026-08-26

> **This ADR records an approved target architecture. It does not authorize
> execution.** Implementing any part of it requires a separate approved
> [Execution Contract](../templates/execution-contract.md) per
> [RIC-011](../11-execution-contract-specification.md). Registering NDERCC-33 here
> does not schedule it, does not make it the current task, and does not start
> implementation.

---

## 1. What this record is

NDERCC-33 approves a **target** architecture for how RICK executes agents. The
architecture is approved; none of it is implemented. This record exists so the
repository's documented architecture and the Jira backlog agree about that
distinction, and so no later reader mistakes an approved target for delivered
behaviour.

### 1.1 Status semantics — two independent axes

Two distinct states are recorded against NDERCC-33. They are on different axes
and must never be conflated or substituted for one another:

| Axis | Value | What it means |
|---|---|---|
| **Jira workflow state** | `A fazer` | Where the work item sits in the Jira workflow (status category *Itens Pendentes*). This is the **only** workflow state NDERCC-33 has. |
| **Architectural state** | `APPROVED TARGET ARCHITECTURE / NOT IMPLEMENTED` | Implementation maturity of the architecture described here. A property of this decision record, not of the Jira issue's workflow. |

`NOT IMPLEMENTED`, `PARTIAL IMPLEMENTATION` and `IMPLEMENTED` (§4) are
**architectural states only**. None of them is a Jira workflow state, workflow
status, status category, or transition — no such Jira state exists. In Jira,
NDERCC-33 is exactly `A fazer`.

The two axes move independently. Transitioning NDERCC-33 through the Jira
workflow does not change the architectural state, and advancing the architectural
state does not by itself transition Jira.

## 2. Decision — target architecture

The agent execution layer is built around a **port**, not around a concrete
runtime. The kernel depends only on the port; every execution engine is an
adapter behind it.

| # | Planned component | What it will own |
|---|---|---|
| 1 | `AgentRuntimePort` | The runtime abstraction the kernel depends on. The kernel never references a concrete runtime, model vendor, or SDK. |
| 2 | `ContextAssembler` | Deterministic assembly of the context handed to a runtime — instructions, state, history, artifacts — with explicit ordering and truncation rules. |
| 3 | `AgentProfile` / Preset | Declarative, reusable agent profiles: target runtime, model, limits, enabled tools, skills, policies. |
| 4 | Tools / Skills / Policies composition | Per-profile registration and resolution. Policies govern tool-call authorization, execution limits, and scope. |
| 5 | Append-only runtime events | An immutable append-only event log as the execution source of truth. No destructive mutation of history. |
| 6 | Checkpoint + resume | Checkpoints derived from the event log, allowing resumption from a consistent point. |
| 7 | Replay | Deterministic re-execution from the event log, for audit and diagnosis. |
| 8 | Trajectory | First-class persistence of the full execution trajectory — events, decisions, tool-calls, results. |
| 9 | DeepSeek Harness / Cordis adapter | An **optional, experimental** adapter implementing `AgentRuntimePort`. |
| 10 | Claude runtime | Claude preserved as an **independent** runtime behind the same port, with no coupling to the experimental adapter. |

Every row above is a **planned** component. None exists today — see §3.

### 2.1 Dependency rule — Cordis is optional, never kernel-mandatory

**The RCC kernel must have no mandatory dependency on Cordis.**

DeepSeek Harness / Cordis integration exists exclusively as an optional adapter
behind `AgentRuntimePort`. Removing or disabling that adapter must not break the
kernel and must not break the Claude runtime. Cordis types, packages, or
configuration must never appear in kernel or domain code, and no kernel code path
may require the adapter to be present in order to execute.

### 2.2 Claude remains an independent runtime

Claude is a first-class runtime behind `AgentRuntimePort` in its own right. Its
availability, behaviour, and correctness must not depend on the experimental
adapter existing, being installed, or being configured.

## 3. Verified implementation state at baseline `d91af2b`

No component of this architecture exists in the repository at this commit. The
table is recorded so that a later reader can see exactly what was true when
NDERCC-33 was registered, rather than inferring it from the architectural-state
label.

| Planned component | State in repository at `d91af2b` |
|---|---|
| `AgentRuntimePort` | Not present |
| `ContextAssembler` | Not present |
| `AgentProfile` / Preset | Not present |
| Tools / Skills / Policies composition | Not present |
| Append-only runtime events | Not present |
| Checkpoint + resume | Not present |
| Replay | Not present |
| Trajectory persistence | Not present |
| DeepSeek Harness / Cordis adapter | Not present |
| Claude runtime behind a port | Not present |

`packages/application` is an empty stub (`src/index.ts` only), and `packages/domain`
contains no agent-runtime code.

What does exist is **specification-level** only, and must not be read as
implementation: checkpoint and resume requirements in RIC-002 (REQ-027),
RIC-003, RIC-006 §7, RIC-007 §8, RIC-011 and RIC-012, and the RIC-010 backlog
items P0-060 – P1-066 and P1-111. Those are approved intentions, not delivered
behaviour.

## 4. Architectural progression

The architectural state advances in exactly this order:

```
NOT IMPLEMENTED  →  PARTIAL IMPLEMENTATION  →  IMPLEMENTED
```

**`NOT IMPLEMENTED` — current state.** The architecture is approved as a target
and no component of it exists (§3).

**`PARTIAL IMPLEMENTATION`.** Reached only when real, validated implementation of
one or more components exists in the repository. An intention, a plan, a branch,
a draft, or an unvalidated prototype does not qualify — the implementation must
be present and its validation must pass.

**`IMPLEMENTED`.** Reached only when **all four** acceptance criteria are
simultaneously proven with evidence:

1. **`AgentRuntimePort` is adopted by the kernel** — the kernel executes through
   the port, not through a concrete runtime.
2. **Trajectory persistence exists** — append-only runtime events plus
   first-class trajectory persistence.
3. **Checkpoint resume and replay work** — execution resumes from a checkpoint,
   and replay reproduces a run deterministically from the event log.
4. **Deterministic tests are green and reproducible** — covering resume and
   replay specifically, not merely the surrounding code.

While any of the four is outstanding, the state is at most
`PARTIAL IMPLEMENTATION`. No state is ever advanced by assertion: each step
requires evidence, and no document in this repository may describe the complete
architecture as implemented before all four criteria hold.

## 5. Backlog placement

NDERCC-33 is **future executable work**, already registered in Jira. It follows
the normal Jira backlog order, with no special handling:

- It is not current work and must not be promoted, hand-picked, or started ahead
  of the normal backlog order.
- Its priority, Sprint, Epic and workflow state are not changed by this record,
  and must not be changed without a specific OWNER decision.
- Registration is not scheduling. Implementation additionally requires an
  approved Execution Contract per RIC-011.

## 6. Explicitly not authorized by this record

This ADR authorizes no code. It does not authorize implementing
`AgentRuntimePort`, `ContextAssembler`, `AgentProfile`/presets, tool/skill/policy
composition, append-only runtime events, checkpoint/resume, replay, trajectory
persistence, the DeepSeek Harness / Cordis adapter, or any runtime wiring. It
authorizes no schema change, migration, dependency addition, lockfile change, CI
or Docker change, and no Jira transition or synchronization.

## 7. Consequences

**Positive.** The kernel stays vendor-neutral: a runtime can be added or removed
without kernel surgery. Execution history becomes append-only and auditable
rather than mutable state, which makes replay and resume derivable from one
source of truth instead of separately maintained. An experimental runtime can be
trialled without the kernel inheriting its risk, because removing it is a no-op
for the kernel. Recording the target now stops the gap between approved
architecture and shipped behaviour from being silently closed by optimistic
documentation.

**Accepted trade-offs.** The port indirection costs directness — a runtime
capability that does not fit the port cannot simply be reached for. Deterministic
replay constrains what runtime code may do (no unlogged non-determinism), which
is a real restriction on implementation freedom. RIC-010 EPIC 6 as written
assumes direct Claude Agent SDK integration (P0-060); this record supersedes that
assumption in favour of the port, without editing the approved RIC-010 text.
And the architecture stays visibly unimplemented in the documentation until the
§4 criteria are met — which is the intended cost of not overstating delivery.

## 8. Change history

| Date | Change | Author |
|---|---|---|
| 2026-08-26 | Initial record — source-of-truth reconciliation with Jira NDERCC-33 (documentation only) | Ricardo Souza |
