# ADR: DEC-RIC-001 — GitHub credential boundary for Sprint 1

> Copied from [`docs/templates/architecture-decision-record.md`](../templates/architecture-decision-record.md).
> **This ADR records a decision. It does not itself authorize execution** —
> implementation was carried out under the approved Execution Contract
> `RIC-EC-NDERCC-S1-02-001` (NDERCC-11 / RIC-S1-02).

## 1. Identity

| Field | Value |
|---|---|
| Decision ID | `DEC-RIC-001` |
| Title | GitHub credential boundary for Sprint 1 |
| Status | `APPROVED` |
| Date | 2026-08-05 |
| Owner(s) | Ricardo Souza |
| Approver(s) | Ricardo Souza |

## 2. Source requirements and Jira traceability

- Strategic source document(s): RIC-004 (Phase 1 / Epic RIC-E04 — GitHub connection, connectivity, permissions and health), RIC-002 (REQ-002, REQ-003, REQ-039, REQ-040, NFR-003, NFR-008, NFR-009), RIC-003 (Project Registry, infrastructure adapters, external-failure recovery and secret handles), RIC-006 (project-owned `IntegrationConnection`, no plaintext secrets), RIC-009 (Slice 2 / MVP-AC-001).
- Related Jira issue(s): NDERCC-11 (RIC-S1-02)
- Related Execution Contract(s): `RIC-EC-NDERCC-S1-02-001`
- Originally recorded as Jira comment `11416` on NDERCC-11; this file is the canonical repository copy of that same approved decision.

## 3. Context

Sprint 1 needs the operator to connect a GitHub repository to a `Project` and verify its identity, default branch, and read access. `IntegrationConnection` (delivered in NDERCC-5) already models a project-owned external connection with an `configurationEncrypted` field intended for a future encrypted-credential design, but no key-management, rotation, or encryption-at-rest design exists yet for that field. A credential-handling decision is required before any GitHub network call can be made.

## 4. Problem

How should RICK Control Center obtain and use GitHub credentials for repository verification in Sprint 1, without persisting a secret before proper key management exists, and without exposing that secret to the browser or to agent context?

## 5. Decision drivers and constraints

- No key-management/rotation/encryption design exists yet for `configurationEncrypted` — using it now would mean storing a secret with no rotation story.
- Single-operator installation — no multi-tenant credential isolation problem to solve yet.
- Public repositories (including this project's own `devricardo90/rick-control-center`) must be verifiable with zero configuration.
- The credential must never reach the browser, logs, test snapshots, or an agent's context window.
- Sprint 1 scope is read-only repository verification — no mutation, no OAuth flow, no GitHub App installation.

## 6. Considered options

### Option A — Installation-level server-only environment secret (`GITHUB_TOKEN`)

- Description: The token, if present, is read once from `process.env` on the server and used only in the outbound `Authorization` header of adapter requests. Never returned, stored, or logged.
- Trade-offs: Simple, zero new infrastructure, safe by construction (no persistence, no browser path). Con: one token per installation, not per-project or per-user; no rotation UI; requires a server restart to pick up a changed value.

### Option B — Classic OAuth flow (operator authorizes RICK against their GitHub account)

- Description: Standard OAuth authorization-code flow, storing a resulting access/refresh token per operator or per project.
- Trade-offs: Scales to per-user/per-project scoping and supports private repos without a manually-provisioned server secret. Con: requires persisted credential storage — which means the encryption-at-rest and key-management design this decision explicitly says doesn't exist yet — plus a registered OAuth App, callback handling, and token refresh logic. Far beyond Sprint 1 scope.

### Option C — GitHub App installation tokens

- Description: Register a GitHub App, let the operator install it on selected repositories, and mint short-lived installation tokens server-side as needed.
- Trade-offs: Best long-term security posture (fine-grained, revocable, short-lived, no long-lived secret to store). Con: significant setup (app registration, private key management, installation flow) — a multi-sprint effort, not a Sprint 1 fit.

## 7. Decision

**Option A** — an optional, installation-level, server-only `GITHUB_TOKEN` environment variable. Public repositories work with zero configuration; private repositories and authenticated permission checks require the operator to set `GITHUB_TOKEN` on the server environment themselves, preferably scoped to a fine-grained token limited to the required repository and minimum read permissions.

## 8. Consequences

- Positive: no new credential storage, encryption, or key-rotation surface to build or audit in Sprint 1; the public-repository path (including RICK's own repository) works immediately with no setup; the token cannot leak through the browser, database, or agent context because none of those code paths ever see it.
- Negative / accepted trade-offs: one shared token per installation rather than per-operator or per-project; no in-app token management UI; changing the token requires a server restart; multiple distinct GitHub accounts cannot be represented simultaneously with different permission levels in this task.

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Token accidentally logged or echoed back to a client | Low | High | Adapter never logs request headers; API layer never serializes the token; secret scan run on every change; DTOs are hand-built allowlists, not raw model serialization. |
| Token committed to `.env` and pushed to Git | Low | High | `.env` is git-ignored (pre-existing); `.env.example` documents the variable with an empty value and explicit "never commit `.env`" guidance. |
| Server-side request forgery via a user-controlled API host | Low | High | The adapter hardcodes `https://api.github.com` as the only origin; it is never derived from request input. |
| Confusing "repository not found" with "private repository, no access" | Medium | Low | GitHub itself is deliberately ambiguous here (returns 404 for both to avoid leaking private-repo existence); the adapter mirrors that ambiguity honestly in its error message rather than guessing. |

## 10. Security, data and operational impact

- Security impact: introduces the first external network call from the server; mitigated by a read-only adapter, a fixed origin, strict input validation, and the credential-handling rules in this ADR (see §11 rationale below).
- Data impact: `IntegrationConnection` gains a nullable `configurationJson` JSONB column for normalized, **non-secret** repository metadata only (owner, name, full name, default branch, URL, visibility, archived flag, access mode, permission booleans). `configurationEncrypted` remains unused (`null`) for GitHub under this decision.
- Operational impact: operators who want private-repository verification must set `GITHUB_TOKEN` in the server environment and restart the server; no impact on operators who only use public repositories.

## 11. Migration and rollback

- Migration path: one additive Prisma migration adds `configuration_json` (nullable JSONB) and a uniqueness constraint on `(project_id, provider, external_account_id)` to `integration_connections`. No prior migration is modified.
- Rollback plan: revert the single NDERCC-11 commit. If the migration has already been applied to a persistent environment, remove the additive column/index only through a separately reviewed forward migration, after confirming no later code depends on them — never rewrite published migration history.

## 12. Validation and evidence

- Adapter unit tests exercise the public-repository (no token) and authenticated (token present) request paths using an injected/mocked `fetch`, asserting the `Authorization` header is present only when a token is supplied and is never present in any log or response.
- A dedicated scan confirms no token value or field appears in any public DTO, HTTP response, or database row.
- See the NDERCC-11 Jira evidence comment for the complete validation run against this exact decision's implementation.

## 13. Supersession

- Supersedes: none.
- Superseded by: none yet. Per this decision's own §7 (point 8) and the Jira contract, per-project OAuth, GitHub App installation tokens, and encrypted per-project credential persistence each require a **new** approved decision and Execution Contract before implementation — this ADR does not pre-authorize them.

## 14. Change history

| Date | Change | Author |
|---|---|---|
| 2026-08-05 | Approved in Jira comment `11416` on NDERCC-11 | Ricardo Souza |
| 2026-08-05 | Repository ADR copy created under `docs/decisions/` (NDERCC-11 / RIC-S1-02) | Ricardo Souza |
