# Architecture Decision Record Template

**Use this file by copying it**, not by editing it in place. Save the copy as
`docs/decisions/ADR-<NNNN>-<slug>.md` (create `docs/decisions/` if it does
not yet exist) and fill in every section below. Do not delete a section —
write `N/A` with a one-line reason if it genuinely does not apply.

> **An ADR records a decision. It does not authorize execution.**
> Implementing an ADR's decision requires a separate, approved
> [Execution Contract](execution-contract.md) (per
> [RIC-011 — Execution Contract Specification](../11-execution-contract-specification.md)).
> An `APPROVED` ADR is an input to a contract, never a substitute for one.

---

## 1. Identity

| Field | Value |
|---|---|
| Decision ID | `ADR-<NNNN>` |
| Title | `<short, specific decision title>` |
| Status | `PROPOSED` \| `APPROVED` \| `REJECTED` \| `SUPERSEDED` |
| Date | `<YYYY-MM-DD>` |
| Owner(s) | `<person or role who authored this ADR>` |
| Approver(s) | `<person or role with authority to approve>` |

## 2. Source requirements and Jira traceability

- Strategic source document(s): `<e.g. RIC-003 — Technical Architecture, section X>`
- Related Jira issue(s): `<e.g. NDERCC-NN>`
- Related Execution Contract(s), if any already exist: `<contract ID(s)>`

## 3. Context

`<What situation makes a decision necessary? What is already true about the
system, the team, or the constraints that the reader needs to know before
the problem makes sense?>`

## 4. Problem

`<The specific question this ADR answers, stated as a question or a clear
problem statement. One decision per ADR — split unrelated problems into
separate records.>`

## 5. Decision drivers and constraints

- `<driver 1 — e.g. a non-negotiable security requirement>`
- `<driver 2 — e.g. an existing dependency or runtime constraint>`
- `<constraint — e.g. must not require a new migration>`

## 6. Considered options

For each option, capture enough for a future reader to understand why it
was or wasn't chosen without re-deriving the analysis.

### Option A — `<name>`

- Description:
- Trade-offs (pros / cons):

### Option B — `<name>`

- Description:
- Trade-offs (pros / cons):

`<add more options as needed>`

## 7. Decision

`<The option chosen, stated plainly, and the primary reason it was chosen
over the alternatives in section 6.>`

## 8. Consequences

- Positive: `<what gets easier or safer as a result>`
- Negative / accepted trade-offs: `<what gets harder, or what is knowingly deferred>`

## 9. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `<risk>` | `<low/medium/high>` | `<low/medium/high>` | `<mitigation>` |

## 10. Security, data, and operational impact

- Security impact: `<new attack surface, secrets, auth/authz implications, or "none">`
- Data impact: `<schema, retention, PII, or "none">`
- Operational impact: `<deployment, monitoring, on-call, runtime behavior, or "none">`

## 11. Migration and rollback

- Migration path: `<how existing state/data/callers move to the new decision, or "not applicable">`
- Rollback plan: `<how to safely reverse this decision if it proves wrong, or "not reversible — reason">`

## 12. Validation and evidence

`<What proves the decision works as intended? e.g. specific tests, a spike,
a benchmark, a security review. Link to evidence once it exists — this
section may start empty in a PROPOSED ADR and be filled in before
APPROVED.>`

## 13. Supersession

- Supersedes: `<ADR-NNNN, or "none">`
- Superseded by: `<ADR-NNNN, or "none — still active">`

## 14. Change history

| Date | Change | Author |
|---|---|---|
| `<YYYY-MM-DD>` | Initial draft | `<name>` |
