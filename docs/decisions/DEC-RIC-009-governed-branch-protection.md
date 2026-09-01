# DEC-RIC-009 — Governed branch protection for `main`

**Status:** APPROVED
**Activation state:** `APPROVED TARGET / NOT YET ACTIVATED`
**Approved SDD:** RIC-SPEC-NDERCC-QHG-02-001 v2.0.0 — Jira comment 12812, with the
rollback API-method portion superseded by v2.1.0
**Execution Contract:** RIC-EC-NDERCC-QHG-02-001 v2.0.0 — Jira comment 12813, with the
rollback API-method portion superseded by v2.1.0
**Owner decisions:** Jira comment 12235 (governed agent merge policy) and the
2026-09-01 owner decisions recorded on NDERCC-22
**Applies to:** NDERCC-22 / P1-008 / Quality Hardening Gate
**Baseline:** `c0fa03c884abbce64f66a9f2694d15e1be42c1b7`

> **This record approves a target configuration. It does not itself activate it.**
> At the time this document is written no ruleset exists — `GET /rulesets` returns
> `[]`, `GET /rules/branches/main` returns `[]`, and `main` reports
> `protected: false`. Everything below describes what **will** be true once the
> staged activation in the Execution Contract completes and is proven. Moving these
> statements to present tense requires a separate, separately-evidenced
> documentation update after activation is verified.

## Decision

`main` will be governed by exactly one **repository ruleset** named `governed-main`,
targeting `~DEFAULT_BRANCH`, with `enforcement: active` and an **empty**
`bypass_actors` list. Classic branch protection will not be used and must not be
created alongside it: two overlapping mechanisms make the effective policy
ambiguous to diagnose.

Four rules will be active:

| Rule | Effect once activated |
|---|---|
| `deletion` | `main` cannot be deleted. |
| `non_fast_forward` | `main` cannot be force-pushed. RIC-012 §7 (Branch and repository policy) states force push is prohibited by default; this makes that structural. |
| `pull_request` | Every change to `main` arrives through a pull request. |
| `required_status_checks` | The `Validate` check must conclude `success`. |

The `pull_request` rule will be parameterised exactly as:
`required_approving_review_count: 0`, `dismiss_stale_reviews_on_push: true`,
`require_code_owner_review: false`, `require_last_push_approval: false`,
`required_review_thread_resolution: true`, `allowed_merge_methods: ["squash"]`.

The required check is identified as `{ "context": "Validate",
"integration_id": 15368 }`. This identity was derived from live check runs, not
from the workflow filename: `CI` is the workflow's `name:`, while `Validate` is
the job's `name:` and therefore the actual check-run identity. Requiring `CI`
would create a check that nothing ever satisfies.

Repository merge settings will be narrowed to squash only —
`allow_merge_commit: false`, `allow_rebase_merge: false`,
`allow_squash_merge: true` — with `delete_branch_on_merge: false` retained so
merged task branches continue to be kept as history.

## Why zero required approving reviews

This is the one setting that looks like a weakening and is not, so the reasoning
is recorded rather than assumed.

The repository has exactly one human collaborator, who authors every pull
request. GitHub does not permit a pull request's author to approve their own
pull request, and there is no second human. The only other reviewer identity
that has ever appeared is a bot, which has only ever left `COMMENTED` reviews —
no `APPROVED` review exists anywhere in this repository's history.

If `required_approving_review_count` were ≥ 1, the set of eligible approvers
would be empty for every pull request. Merging would then be possible only by
bypass, which would make bypass the ordinary delivery path rather than an
exception. That outcome is strictly worse than requiring no approvals: it
breaches the owner directive prohibiting bypass on every single delivery, it
destroys the audit value of a bypass event by making bypasses routine, and it
leaves a control that appears to enforce review while guaranteeing its own
circumvention. It would also force a standing admin bypass actor, which would
simultaneously re-open direct pushes to `main`.

Zero is therefore the only value at which every *other* rule in this ruleset
stays genuinely enforced with no routine bypass. RCC does not delegate its
review gate to GitHub: independent review is enforced at the Jira/RIC layer and
has demonstrable teeth — NDERCC-21 was held at `CHANGES_REQUIRED` through two
review cycles and remediated before merge was authorised. Setting zero declines
to duplicate, at a layer that structurally cannot satisfy it, a gate that
already functions elsewhere. `required_review_thread_resolution` is retained
precisely because it is the review-adjacent control that *does* bind a solo
author.

**Revisit condition.** The moment a second human collaborator exists, or a
GitHub App is authorised and *proven* able to submit `APPROVED` reviews, raise
`required_approving_review_count` to `1` and enable `require_last_push_approval`.
This is a standing obligation of this decision, not a suggestion.

## Why no bypass actors

`bypass_actors` governs who may bypass the *rules*. Administering the ruleset —
changing its enforcement or deleting it — is a separate repository-admin
permission that no bypass entry is needed to exercise. Recovery from a
misconfiguration is therefore always available without any standing bypass, so
an empty list costs nothing in recoverability and buys two things: direct pushes
to `main` are genuinely blocked for everyone, and there is no actor for whom the
rules are silently optional.

Break-glass is consequently an explicit, visible state change — replacing the
ruleset with an otherwise-identical payload whose `enforcement` is `disabled`,
acting, then restoring `active` — rather than a silent per-merge bypass. Every
such use must be recorded on NDERCC-22 with actor, UTC timestamp, SHA, reason and
remediation before the next unrelated merge.

## Recovery uses `PUT` with a complete payload

The repository-rulesets API exposes `GET`, `POST` on the collection and `GET`,
`PUT`, `DELETE` on an individual ruleset. **There is no `PATCH` method**, and
`PUT` has replacement semantics: a partial body would silently drop every rule,
condition and bypass setting it omits, turning an intended enforcement change
into an accidental teardown of the whole policy.

Any change to enforcement state must therefore read the current ruleset, alter
only `enforcement`, and send back the **complete** intended payload. The
operational runbook is in
[`docs/guides/branch-protection.md`](../guides/branch-protection.md).

No live rollback test is authorised. Rollback is prepared and documented, not
exercised as a validation step.

## Deliberately deferred

`require_code_owner_review` is false because no `CODEOWNERS` file exists.
`strict_required_status_checks_policy` (branches must be up to date before
merging) is false: with a single serial writer it forces a rebase-and-rerun loop
for no safety gain. `required_signatures` is not set because commit signing is
not established in this repository and enabling it would block all delivery
immediately. No non-default branch is protected. The `docs/**` gap in the CI
`push` trigger is to be tracked separately — pull requests into `main` always
produce `Validate`, so the required check is unaffected.

## Effect on the legacy direct-`main` pattern

[`docs/handoffs/sprint-0-developer-handoff.md`](../handoffs/sprint-0-developer-handoff.md)
§8 documents a conditionally-available direct-commit-to-`main` pattern, used
twice in Sprint 0 under explicit authorisation. Once this ruleset is active that
pattern becomes **structurally unavailable**: the `pull_request` rule with an
empty `bypass_actors` list admits no direct push, so a future Execution Contract
purporting to authorise it could not be satisfied without an explicit
break-glass. Branch-per-task was already the stated default, so no approved
mandate is contradicted — but §8 should be read as superseded in practice from
activation onward.

## Activation and this task's own delivery

Activation is staged — force-push and deletion first, then the pull-request
rule, then the required status check — with an API read-back after each stage so
a misconfiguration is caught at the stage that introduced it.

The NDERCC-22 documentation pull request is sequenced to merge **before** the
ruleset is created, and is therefore not subject to the rules it introduces.
This is deliberate: a task whose deliverable is the protection itself cannot be
gated on that protection without risking locking its own delivery path. It
nonetheless satisfies every rule voluntarily — pull-request based, green
`Validate`, independent review, squash merge. The first pull request genuinely
governed by this ruleset will be the next task's.

## Verification

Storing the ruleset payload is not proof. Verification requires all three of:
the configuration exists, it targets `main`, and its rules are active on `main`.
The third is established by `GET /repos/{owner}/{repo}/rules/branches/main`,
which returns the rules *effectively applied* to the branch.

No destructive probe is used. A real force-push, deletion or direct-push attempt
against `main` would cause the exact damage the control exists to prevent if the
configuration were wrong, so verification is read-only throughout.

## Consequences

Once activated, `main` can no longer be advanced by an ordinary push, a
force-push, or a merge whose `Validate` check has not passed — by anyone,
including the repository owner. The convention that Sprint 0–2 relied on becomes
structural before the Execution Contract Engine begins landing machine-generated
changes.

In exchange, a CI outage will block all merges until enforcement is explicitly
and visibly relaxed; merge-commit and rebase strategies will no longer be
available; and the review requirement is carried by the Jira/RIC layer rather
than by GitHub until a second reviewer identity exists.

## Change history

| Date | Change | Author |
|---|---|---|
| 2026-09-01 | Initial record — governed branch protection for `main` (NDERCC-22 / P1-008), approved target, not yet activated | Ricardo Souza |
