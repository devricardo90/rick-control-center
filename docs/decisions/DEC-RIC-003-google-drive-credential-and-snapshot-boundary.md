# ADR: DEC-RIC-003 — Google Drive credential and snapshot boundary

> Copied from [`docs/templates/architecture-decision-record.md`](../templates/architecture-decision-record.md).
> **This ADR records a decision. It does not itself authorize execution** —
> implementation was carried out under the approved Execution Contract
> `RIC-EC-NDERCC-S1-04-001` (NDERCC-13 / RIC-S1-04), activated in Jira
> comment `11659`.

## 1. Identity

| Field | Value |
|---|---|
| Decision ID | `DEC-RIC-003` |
| Title | Google Drive credential and snapshot boundary |
| Status | `APPROVED` |
| Date | 2026-08-07 |
| Owner(s) | Ricardo Souza |
| Approver(s) | Ricardo Souza |

## 2. Source requirements and Jira traceability

- Strategic source document(s): RIC-002 (REQ-005, REQ-040 and the Google Drive/Docs portion of the golden path), RIC-003 (Strategic Documentation, Google Drive/Docs adapter, infrastructure boundary, idempotent external-failure handling), RIC-006 (external provider IDs, normalized snapshots, project isolation, UTC timestamps, non-plaintext secret handling), RIC-009 (source-of-truth resolution and provenance-backed snapshot preparation), RIC-010 (Sprint 1 / P0-021), RIC-011 (source snapshot, least-privilege tools, secrets-by-reference, immutable execution authority).
- Related Jira issue(s): NDERCC-13 (RIC-S1-04); builds directly on NDERCC-12 (RIC-S1-03) and [`DEC-RIC-002`](DEC-RIC-002-document-source-persistence-boundary.md), which explicitly deferred content snapshots to this decision.
- Related Execution Contract(s): `RIC-EC-NDERCC-S1-04-001`.
- Originally recorded as Jira comment `11559` on NDERCC-13; this file is the canonical repository copy of that same approved decision.

## 3. Context

Google Docs is the strategic source of truth for RICK Control Center. DEC-RIC-002 delivered a project-owned registry of *which* documents exist (`DocumentSource`) but deliberately stored no content, because no Google credential mechanism, adapter contract, or checksum strategy had been decided. Sprint 1 / P0-021 requires actually reading those documents and preserving what they said, so that later planning can be traced back to a specific, verifiable version of an approved document.

That requires deciding three things at once: how the application authenticates to Google, what it is allowed to ask Google for, and what it stores from the answer.

## 4. Problem

How should RICK Control Center read approved strategic Google Docs so that: (a) authentication uses the least privilege that still works from a non-Google runtime, (b) no credential can reach the browser, the database, logs, evidence, or agent context, (c) a stored snapshot is a deterministic, verifiable representation of one specific provider version, (d) a document being edited during a read cannot produce a snapshot that never existed, and (e) an external failure can never damage the last known-good snapshot?

## 5. Decision drivers and constraints

- The runtime is outside Google Cloud, so no metadata-server or attached-service-account identity is available; some explicit credential must exist.
- Google's own guidance is to prefer keyless mechanisms over service-account keys. Workload Identity Federation is the correct long-term answer but is not configured for this runtime, and configuring it is not Sprint 1 work.
- Reader-only access is a hard requirement, and it constrains the API surface: Drive's revision history requires owner/organizer/fileOrganizer/writer access, so `revisions.list` is unavailable to a reader and cannot be the canonical version identity.
- A snapshot is evidence. If it can be edited after the fact, or if its checksum can disagree with its content, it stops being evidence.
- A Google Doc can be edited at any moment, including between the metadata read and the export — the naive "read, export, store" sequence can produce a snapshot whose text and version number never coexisted.
- The ChatGPT/Google Drive connector used by the control process is not an application credential and must never be treated as one.

## 6. Considered options

### Option A — Dedicated service account, reader-only sharing, `files.version` consistency check (chosen)

- Description: One installation-level Google Cloud service account; explicit reader sharing of individual strategic files/folders; `drive.readonly` scope; credential supplied as the server-only `GOOGLE_SERVICE_ACCOUNT_JSON` handle; `files.version` (not revision history) as the provider revision identity, verified before and after each export.
- Trade-offs: Least privilege at both the identity and resource level, works from any runtime, and fully testable with an injected network boundary. Con: uses a user-managed key, which Google discourages; accepted as an explicit, time-boxed bootstrap with Workload Identity Federation named as the successor.

### Option B — Browser OAuth with the operator's own Google account

- Description: The operator signs in to Google in the browser; the application stores refresh tokens.
- Trade-offs: No pre-shared key to manage. Con: introduces per-user token storage and refresh — exactly the "credential persistence subsystem" this MVP has deliberately not built; couples document access to one human's account; and puts a live Google credential in the browser flow. Rejected.

### Option C — Domain-wide delegation

- Description: The service account impersonates workspace users.
- Trade-offs: Would remove the need to share files explicitly. Con: grants the application the ability to read *any* user's Drive, which is the opposite of least privilege for a system whose only need is a handful of approved documents. Rejected.

### Option D — Drive revision history as the canonical version identity

- Description: Use `revisions.list`/`revisions.get` to pin snapshots to a real Drive revision.
- Trade-offs: Semantically the most precise provider identity. Con: Google requires writer-or-above access to read revision history, which directly contradicts the reader-only boundary chosen above. Rejected as incompatible, not merely inconvenient.

## 7. Decision

**Option A.**

**Authentication.** One dedicated Google Cloud service account per installation. No browser OAuth, no domain-wide delegation, no user impersonation. Strategic files or folders are shared explicitly with the service-account email as **reader**. The only OAuth scope requested is `https://www.googleapis.com/auth/drive.readonly`; the broad scope is constrained operationally by the principal, which can only see what was explicitly shared with it.

**Credential handling.** The complete credential JSON is supplied through the server-only handle `GOOGLE_SERVICE_ACCOUNT_JSON`. Before use it is narrowed: `type` must equal `service_account`, and `client_email` and `private_key` must both be present. The value is never persisted in PostgreSQL, never written into `DocumentSource.metadataJson` or a snapshot row, and never appears in browser code, request bodies, API responses, logs, errors, test fixtures, Jira evidence, or agent context. `.env.example` carries an empty documented placeholder only.

**Library and network boundary.** Exactly one authentication dependency is authorized: `google-auth-library@10.9.1`, used only to mint short-lived access tokens against Google's official OAuth token endpoint. Drive REST calls use native Node `fetch` against the fixed origin `https://www.googleapis.com`. No caller-supplied host or base URL exists on any code path, and no Drive/Docs write method is implemented.

**Read contract.** Only two Drive operations are authorized: `files.get` for one explicit `fileId` with the strict field allowlist `id,name,mimeType,version,modifiedTime,webViewLink`, and `files.export` as `text/plain`. Every response is treated as `unknown` and narrowed before use.

**Consistency.** `files.version` is the provider revision identifier, stored as a string. A snapshot is taken as: read metadata A → export → read metadata B, requiring A and B to agree on both file ID and version. A mismatch discards the candidate and retries the whole sequence, to a maximum of three total attempts, after which a deterministic transient error is returned and the previous valid state is preserved.

**Normalization and checksum.** Exported bytes are decoded as UTF-8, stripped of an optional BOM, normalized to NFC, and given LF line endings. Spaces, blank lines and wording are preserved exactly — no trimming or collapsing. The checksum is a lowercase SHA-256 hex digest over the normalized UTF-8 bytes, and the persistence layer recomputes it rather than trusting the caller.

**Persistence.** One new immutable, project-owned aggregate, `DocumentSnapshot`, append-only by API and by schema. On a successful sync the snapshot is created (or reused idempotently) and the owning `DocumentSource`'s current pointer — revision, checksum, safe metadata, `syncStatus = SYNCED`, `lastSyncedAt` — advances in the *same* database transaction.

## 8. Consequences

- Positive: strategic document content becomes verifiable evidence — a checksum change means the document changed, and every historical version stays readable; the credential surface is a single environment handle with no persistence, no browser exposure, and no impersonation; the adapter is fully testable offline because both `fetch` and the token provider are injected; and replacing the key with Workload Identity Federation later changes only how a token is minted, not the adapter or domain contract.
- Negative / accepted trade-offs: a user-managed service-account key exists and must be rotated and protected operationally; `files.version` is a coarser identity than a true Drive revision, so two edits that produce the same version number are indistinguishable at the provider level (mitigated by including the checksum in snapshot identity); snapshots store full document text, so the database grows with every distinct version and there is no pruning policy yet; and a document under active editing can legitimately fail to snapshot three times in a row, which is reported as a transient conflict rather than an error.

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The service-account private key leaks through a log line, an error message, or an accidental serialization | Low | Critical | The handle is read in exactly one server-only module; the parsed credential is frozen with redacting `toString`/`toJSON`; every credential error reports the failing *structural rule* only; the underlying `google-auth-library` error (which can embed the OAuth response) is discarded rather than wrapped; tests assert that no thrown error or serialization contains key material. |
| A raw Google response, header, or token is persisted as "metadata" | Medium | High | The DEC-RIC-002 recursive metadata scanner is reused unchanged and rejects credential-, secret- and content-shaped keys at every depth; the sync path passes a hand-built allowlist of non-secret fields; snapshot rows have no column capable of holding a header or response. |
| A document edited mid-export produces a snapshot whose text and version never coexisted | Medium | High | Version is read before and after every export and must match; a mismatch discards the candidate and retries, bounded at three attempts, then fails safely. |
| An external failure destroys the last valid snapshot or falsely advances `lastSyncedAt` | Medium | High | Snapshot insert and source-pointer update share one transaction; a failure rolls both back; the failure path uses the NDERCC-12 `markDocumentSourceSyncError`, which changes `syncStatus` and nothing else. |
| A stored checksum silently disagrees with its stored content | Low | High | The persistence layer recomputes the SHA-256 from the content being written and rejects a mismatch, so a caller bug cannot produce a lying row. |
| A snapshot is attributed to the wrong project | Low | High | `DocumentSnapshot` references `DocumentSource` through a composite `(documentSourceId, projectId)` foreign key, so PostgreSQL — not only application code — rejects a snapshot whose project disagrees with its source's project. |
| A client supplies a Google API host, a token, or a forged checksum in a request body | Low | High | The registration parser hard-rejects credential-, host- and evidence-shaped keys rather than stripping them; the adapter has no code path accepting a host. |
| The `google-auth-library` dependency introduces supply-chain risk | Low | Medium | Exactly one dependency is authorized, pinned to `10.9.1` (not a range), used solely for token minting, and confined to a single module. |

## 10. Security, data and operational impact

- Security impact: one new outbound network surface, fixed to `https://www.googleapis.com` and Google's official OAuth token endpoint, read-only in both scope and implemented methods. One new server-only secret handle, never persisted and never returned. No new inbound surface beyond four authenticated, project-scoped endpoints.
- Data impact: one new table (`document_snapshots`) holding normalized document text; one additive unique index on `document_sources(id, project_id)` supporting the composite ownership key; two new `ON DELETE RESTRICT` foreign keys, so neither a project nor a source with snapshots can be deleted without an explicit, reviewed decision.
- Operational impact: the installation must create a service account, enable the Drive API, share each approved document with the service-account email as reader, and supply `GOOGLE_SERVICE_ACCOUNT_JSON` to the server process. Rotation and revocation are manual. See [`docs/guides/local-development.md`](../guides/local-development.md) §10.

## 11. Migration and rollback

- Migration path: one additive Prisma migration (`20260809140518_document_snapshot_immutable_history`) creates the `document_snapshots` table, its indexes, its two foreign keys, and the supporting unique index on `document_sources(id, project_id)`. No prior migration is modified and no existing table, column, or enum is altered or dropped.
- Rollback plan: revert the single NDERCC-13 commit and remove `GOOGLE_SERVICE_ACCOUNT_JSON` from the runtime environment. If the migration has already been applied to a persistent environment, drop `document_snapshots` only through a separately reviewed forward migration, after confirming no later code or data depends on it — never rewrite published migration history. Revoking the service-account key at the Google end is an independent, immediate control that disables all Drive access without any code change.

## 12. Validation and evidence

- Adapter unit tests (`packages/integrations/src/google/*.test.ts`) inject both `fetch` and the token provider, so no automated test uses a live credential or reaches Google. They cover credential narrowing and non-leakage, file-ID/URL resolution, fixed-host and GET-only enforcement, metadata narrowing, non-Docs MIME rejection, 401/403/404/429/5xx/timeout/network/malformed mapping, response size limits, normalization and checksum determinism, version-before/export/version-after consistency, retry on drift, and bounded failure after three attempts.
- Persistence integration tests (`packages/database/src/document-snapshot.test.ts`) run against real PostgreSQL and cover append-only behavior, duplicate-safe re-sync, new-version append, checksum/content mismatch rejection, database-enforced cross-project rejection, archived/unknown-project and unknown-source rejection, atomic advancement of the source pointer, `ON DELETE RESTRICT`, and content-free summary reads.
- Boundary and UI tests (`apps/web/tests/**`) cover request narrowing (including hard rejection of credential-, host- and evidence-shaped keys), DTO redaction, and every document sync view state.
- See the NDERCC-13 Jira evidence comment for the complete validation run against this exact decision's implementation.

## 13. Supersession

- Supersedes: none. Extends [`DEC-RIC-002`](DEC-RIC-002-document-source-persistence-boundary.md) §6 Option C, which deferred content snapshots to this decision.
- Superseded by: none yet. Replacing the user-managed key with Workload Identity Federation, adding any Drive/Docs write, adding a second `DocumentProvider`, or changing the normalization algorithm each require a **new** approved decision — this ADR does not pre-authorize them. Note in particular that changing normalization would make every previously stored checksum unreproducible.

## 14. Change history

| Date | Change | Author |
|---|---|---|
| 2026-08-07 | Approved in Jira comment `11559` on NDERCC-13 | Ricardo Souza |
| 2026-08-09 | Contract `RIC-EC-NDERCC-S1-04-001` activated in Jira comment `11659` after a passing read-only preflight | Ricardo Souza |
| 2026-08-09 | Repository ADR copy created under `docs/decisions/` (NDERCC-13 / RIC-S1-04) | Ricardo Souza |
