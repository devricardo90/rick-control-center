# DEC-RIC-004 — Deterministic strategic-truth extraction boundary

**Status:** APPROVED
**Proposal:** Jira comment 11800
**Product Owner approval:** Jira comment 11801
**Applies to:** NDERCC-16 / RIC-S2-01 / RIC-010 P0-022

## Decision

P0-022 extracts only explicit, deterministically parseable strategic truth from
an immutable `DocumentSnapshot` that belongs to the target project and its
approved, current `DocumentSource`. Extraction is offline and has no Google,
GitHub, Jira, LLM, embedding, similarity, fuzzy or other external-provider
call. Missing or ambiguous truth remains unresolved rather than being guessed.

Requirements use the frozen `FUNCTIONAL`, `NON_FUNCTIONAL`, and `CONSTRAINT`
types; `REQ-<number>` and `NFR-<number>` are explicit identities, while
constraints are allowed only as bullet/numbered statements under the fixed
section aliases for constraints, invariants, rules, explicit exclusions,
security requirements, and explicitly prohibitive non-goals. Uncoded
constraints use `CON-` plus the first 16 uppercase hex characters of the
SHA-256 digest of:

```text
documentSourceId + "\n" + canonicalSectionKey + "\n" + normalizedConstraintText
```

Normalization is Unicode NFC, newline normalization, outer trimming, one-line
bullet unfolding, and collapse of internal spaces/tabs. Requirement priority
is copied only from explicit `P0`–`P3` labels; otherwise it is `UNSPECIFIED`.

Decisions use the RIC-006 statuses `PROPOSED`, `APPROVED`, `REJECTED`, and
`SUPERSEDED` and are created only from canonical `DEC-...` blocks containing
an explicit code, title/subject, status, and chosen outcome. Ordinary DEC
references and ordinary prose never become decisions.

Every current fact retains project, source, immutable snapshot, code,
extractor-version, and a safe deterministic source locator. Same-snapshot
processing is deterministic and idempotent. Newer same-source reconciliation
is transactional: explicit requirements update/create/supersede only after a
fully valid candidate; synthetic constraint identity changes supersede the old
same-source fact only after success; cross-source duplicate codes return a
typed conflict without overwriting truth; disappeared decisions return a
typed ambiguity and preserve the last valid decision.

## Explicitly deferred

This decision does not authorize P0-030/P0-031/P0-032, ProjectSnapshot,
full traceability, Jira synchronization, execution contracts, risk or agent
runtime, SSE, Git automation, Google/GitHub integration changes, UI redesign,
or semantic/LLM extraction. Any future semantic improvement requires a new or
superseding approved decision and execution contract.

## Consequences

The projection is reproducible, project-isolated, provenance-backed, and safe
for later resolver work. Some useful prose remains unextracted, cross-source
duplicates block instead of being merged, and missing historical decisions
remain an explicit diagnostic. These trade-offs are intentional: false truth
is more dangerous than missing truth.
