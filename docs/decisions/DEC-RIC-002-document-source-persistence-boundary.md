# ADR: DEC-RIC-002 — DocumentSource persistence boundary

> Copied from [`docs/templates/architecture-decision-record.md`](../templates/architecture-decision-record.md).
> **This ADR records a decision. It does not itself authorize execution** —
> implementation was carried out under the approved Execution Contract
> `RIC-EC-NDERCC-S1-03-001` (NDERCC-12 / RIC-S1-03).

## 1. Identity

| Field | Value |
|---|---|
| Decision ID | `DEC-RIC-002` |
| Title | DocumentSource persistence boundary |
| Status | `APPROVED` |
| Date | 2026-08-06 |
| Owner(s) | Ricardo Souza |
| Approver(s) | Ricardo Souza |

## 2. Source requirements and Jira traceability

- Strategic source document(s): RIC-006 (Data Model — project-owned `DocumentSource`, provider provenance, revision, checksum, status, UTC timestamps, JSONB metadata), RIC-010 (Sprint 1 / P0-020 — model documents, versions and approval status), RIC-004 (Phase 1 strategic-source preparation).
- Related Jira issue(s): NDERCC-12 (RIC-S1-03); persistence prerequisite for the future NDERCC-13 (RIC-S1-04).
- Related Execution Contract(s): `RIC-EC-NDERCC-S1-03-001`.
- Originally recorded as Jira comment `11488` on NDERCC-12; this file is the canonical repository copy of that same approved decision.

## 3. Context

RIC-006 describes a broader Draft 1 architecture for tracking strategic documents (vision, PRD, architecture, roadmap, etc.), their approval state, and their synchronization with an external provider such as Google Drive. Before any Google Drive adapter, content import, or snapshot mechanism can be built, the project needs a project-owned registry of *which* documents exist, where they come from, and what their current approval/synchronization state is — without yet touching document content or any external network.

## 4. Problem

How should RICK Control Center persist a strategic document registry entry so that: (a) it is safely project-isolated like every other operational entity, (b) approval state and synchronization state are tracked independently rather than conflated, (c) no document body content, provider credential, or raw provider response can ever be stored through it, and (d) it does not require a Google Drive adapter, OAuth, or any external call to exist and be fully tested?

## 5. Decision drivers and constraints

- The source document `RIC-006 — Data Model` remains a broader Draft 1 architecture document; this decision freezes only the `DocumentSource` persistence slice needed for NDERCC-12, not the full document/version/traceability model it sketches.
- No Google Drive adapter, credential, or content-import mechanism exists yet — this task must remain fully offline and deterministic.
- Approval (editorial/governance) and synchronization (provider-freshness) are conceptually independent: a document can be `APPROVED` but `STALE`, or `DRAFT` but freshly `SYNCED`. Conflating them into one status would make that state inexpressible.
- The registry must support more than one source per document type (approval policy, not a uniqueness rule, decides which is authoritative) while still preventing the same external provider file from being registered twice in the same project.
- Metadata is the same class of risk as `IntegrationConnection.configurationJson` (DEC-RIC-001): useful non-secret provider context, but a real place a credential could accidentally end up if not actively guarded.

## 6. Considered options

### Option A — Single `DocumentSource` registry entity with separated approval/sync status (chosen)

- Description: One project-owned model with `DocumentApprovalStatus` and `DocumentSyncStatus` as two independent enums, plus provenance (`provider`, `externalFileId`), classification (`documentType`), and a nullable `revision`/`checksum`/`metadataJson`/`lastSyncedAt` synchronization snapshot.
- Trade-offs: Small, testable without any external adapter; directly matches RIC-006's provenance/status intent without committing to unbuilt content-snapshot mechanics. Con: does not yet model document versions or content — deferred by design.

### Option B — Combined single status field (e.g. `DRAFT_PENDING`, `APPROVED_SYNCED`, ...)

- Description: One enum cross-producting approval and sync state.
- Trade-offs: Fewer columns. Con: combinatorial explosion of states, ambiguous semantics (is `APPROVED_ERROR` "approved but sync failed" or "approval revoked because sync failed"?), and any later approval/sync state addition multiplies the enum. Rejected.

### Option C — Build `DocumentSource` and `DocumentVersion`/content snapshot together now

- Description: Model the registry entry and an immutable content-snapshot table in the same task.
- Trade-offs: Would fully realize RIC-006's Draft 1 sketch in one step. Con: requires deciding the Google Drive adapter, content-fetch strategy, and checksum-generation approach first — none of which are approved yet. Rejected for this task; explicitly deferred to NDERCC-13 after those decisions exist.

## 7. Decision

**Option A.** One project-owned `DocumentSource` model, four new enums (`DocumentProvider` limited to `GOOGLE_DRIVE` for now, `DocumentType`, `DocumentApprovalStatus`, `DocumentSyncStatus`), with `approvalStatus`/`syncStatus` as independent dimensions. `metadataJson` is a `Json?` column narrowed and secret-key-scanned at the typed persistence boundary (`packages/database/src/document-source.ts`) before every write, mirroring the DEC-RIC-001 `configurationJson` boundary. No document body, content snapshot, or version history is introduced.

## 8. Consequences

- Positive: the strategic document registry can be built, queried, and fully tested with real PostgreSQL and zero external dependencies or credentials; approval and sync state can evolve independently without a combinatorial status enum; the same non-secret-metadata discipline already proven for `IntegrationConnection` (DEC-RIC-001) is reused rather than re-invented.
- Negative / accepted trade-offs: no content, version, or diff/traceability capability exists yet — a document's *registration* is tracked, not its *content*; multiple candidate sources of the same `documentType` can coexist with no built-in "authoritative" flag beyond `approvalStatus` (a future decision may need one if this proves ambiguous in practice).

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A future caller passes a raw Google Drive API response as `metadataJson`, accidentally including an access token or signed URL | Medium | High | `metadataJson` is narrowed from `unknown` and recursively scanned for credential-shaped keys (`token`, `authorization`, `cookie`, `password`, `secret`, `credential`, `apiKey` and their normalized variants) before every write; rejected with `InvalidDocumentSourceInputError`, not silently stripped. |
| Approval and sync status silently drift into meaning "the same thing" over time | Low | Medium | Kept as two separate enum columns at the schema level, not a derived/combined value; both are independently settable through distinct persistence operations. |
| `url` is used as an SSRF vector or a non-http(s) scheme is stored | Low | Medium | `url` is validated as an absolute `https:` URL with no embedded userinfo before persistence; `http:`, relative URLs, `javascript:`, and `data:` are all rejected. |
| A checksum is trusted as if it were independently verified | Low | Low | This decision explicitly validates only the *shape* (64 lowercase hex characters) of a caller-supplied checksum; it never generates one from content, and the ADR/contract record that content-based checksum generation is out of scope until NDERCC-13. |

## 10. Security, data and operational impact

- Security impact: no new network surface (no adapter exists yet); the only new risk surface is the metadata boundary, mitigated by the recursive secret-key scan described above.
- Data impact: one new table (`document_sources`) and four new enums; one new foreign key to `projects` with `ON DELETE RESTRICT` — a project with document sources cannot be deleted, matching the existing `IntegrationConnection` policy of never silently losing provenance.
- Operational impact: none — no environment variable, credential, or external service configuration is introduced by this decision.

## 11. Migration and rollback

- Migration path: one additive Prisma migration creates the four enums, the `document_sources` table, its foreign key, a unique index on `(project_id, provider, external_file_id)`, and two supporting indexes (`project_id`; `project_id, document_type`). No prior migration is modified.
- Rollback plan: revert the single NDERCC-12 commit. If the migration has already been applied to a persistent environment, remove the `document_sources` table and its enums only through a separately reviewed forward migration, after confirming no later code or data depends on them — never rewrite published migration history.

## 12. Validation and evidence

- Integration tests (`packages/database/src/document-source.test.ts`) run against real PostgreSQL and cover: defaults, every document type, ACTIVE/PAUSED creation, ARCHIVED rejection, unknown-project rejection, duplicate and cross-project uniqueness behavior, document-type multiplicity, project isolation, deterministic ordering, URL/checksum/metadata validation (including recursive credential-key rejection), registry updates that preserve provenance, atomic sync-success updates, STALE/ERROR preservation of the last valid snapshot, and typed-error message shape (no raw Prisma/SQL text).
- See the NDERCC-12 Jira evidence comment for the complete validation run against this exact decision's implementation.

## 13. Supersession

- Supersedes: none.
- Superseded by: none yet. Per this decision's §6 (Option C) and the Jira contract, `DocumentVersion`/content-snapshot tables, checksum generation from content, and any additional `DocumentProvider` value each require a **new** approved decision and Execution Contract before implementation — this ADR does not pre-authorize them.

## 14. Change history

| Date | Change | Author |
|---|---|---|
| 2026-08-06 | Approved in Jira comment `11488` on NDERCC-12 | Ricardo Souza |
| 2026-08-06 | Repository ADR copy created under `docs/decisions/` (NDERCC-12 / RIC-S1-03) | Ricardo Souza |
