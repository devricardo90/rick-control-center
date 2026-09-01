# Branch protection on `main`

Operational reference for the governed-branch policy. The decision and its
reasoning live in
[`DEC-RIC-009`](../decisions/DEC-RIC-009-governed-branch-protection.md); this
guide is the practical "what does this mean when I work" companion.

> **Activation state: `APPROVED TARGET / NOT YET ACTIVATED`.**
> At the time this guide is written no ruleset exists — `GET /rulesets` returns
> `[]`, `GET /rules/branches/main` returns `[]`, and `main` reports
> `protected: false`. Everything below describes what **will** be true once the
> staged activation completes and is proven by read-back. Verify the live state
> with the read-only commands under [Verifying the live policy](#verifying-the-live-policy)
> before relying on any statement here.

## What will be enforced

`main` will be governed by a single repository ruleset named `governed-main`,
targeting the default branch, with `enforcement: active` and **no bypass
actors** — the rules will apply to everyone, including the repository owner.

| Rule | What it will mean day to day |
|---|---|
| `deletion` | `main` cannot be deleted. |
| `non_fast_forward` | `main` cannot be force-pushed. |
| `pull_request` | You cannot push to `main`. Every change goes through a PR. |
| `required_status_checks` | The `Validate` check must be green before merge. |

Pull-request parameters:

| Parameter | Value |
|---|---|
| `required_approving_review_count` | `0` |
| `required_review_thread_resolution` | `true` |
| `dismiss_stale_reviews_on_push` | `true` |
| `require_code_owner_review` | `false` |
| `require_last_push_approval` | `false` |
| `allowed_merge_methods` | `["squash"]` |

Required-status-check parameters:

| Parameter | Value | Meaning |
|---|---|---|
| `strict_required_status_checks_policy` | `false` | Your branch does **not** have to be up to date with `main` before merging. With a single serial writer, requiring it would force a rebase-and-rerun loop for no safety gain. |
| `do_not_enforce_on_create` | `false` | The check is enforced on branch creation too. |

Repository merge settings will be narrowed to squash only. Merge commits and
rebase merges will be disabled. Merged branches are **not** auto-deleted — task
branches are retained.

## Working under it

Nothing changes about the normal flow, because the flow was already this:

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. Commit, push the branch, open a PR into `main`.
3. Wait for `Validate` to conclude `success`.
4. Resolve every review thread — including bot review threads. An unresolved
   thread blocks the merge even though no approval is required.
5. Squash-merge.

What will fail once activated, that previously succeeded: `git push origin main`,
`git push --force origin main`, deleting `main`, and merging a PR whose
`Validate` has not passed or that has an unresolved review thread.

This also makes the conditional direct-commit-to-`main` pattern described in
[`sprint-0-developer-handoff.md`](../handoffs/sprint-0-developer-handoff.md) §8
structurally unavailable. Branch-per-task was already the default, so no
approved mandate is contradicted, but a future contract purporting to authorise
a direct `main` commit could not be satisfied without an explicit break-glass.

## Zero required approvals is not "no review"

The ruleset will require no approving review, because this repository has one human
collaborator and GitHub does not let a PR author approve their own PR — any
non-zero value would make bypass the only way to merge anything, which is worse
than requiring none. Review is not skipped; it is enforced at the Jira/RIC
layer, where independent review must return `CLEAN` before merge is authorised.

`required_review_thread_resolution` is the part of the review gate that GitHub
*can* enforce for a solo author, so it will be on.

When a second human collaborator or an approval-capable App exists, raise
`required_approving_review_count` to `1` and enable `require_last_push_approval`
— this is a standing obligation recorded in DEC-RIC-009, not an optional
improvement.

## The required check is `Validate`, not `CI`

`.github/workflows/ci.yml` has `name: CI` at the workflow level and
`name: Validate` on its single job. The check-run identity GitHub matches
against — and therefore the ruleset context — is the **job** name, `Validate`,
with `integration_id: 15368` (GitHub Actions).

If the job's `name:` is ever changed, the required status check breaks and no PR
will be mergeable until the ruleset is updated to match. Treat that job name as
part of the governance contract, not a cosmetic label.

Note that `ci.yml` runs on `push` only for `[main, feat/**, fix/**, chore/**]`.
A branch outside those globs (for example `docs/**`) gets no pre-PR push run,
but a PR into `main` always triggers the `pull_request` run, so the required
check is always produced. Closing that trigger gap is to be tracked separately.

## Resolving the ruleset id

Every command below needs the ruleset id. Resolve it deterministically by name
rather than hardcoding it — read-only:

```bash
RULESET_ID=$(gh api repos/devricardo90/rick-control-center/rulesets \
  --jq '.[] | select(.name=="governed-main") | .id')
echo "$RULESET_ID"
```

If that prints nothing, the ruleset does not exist and nothing below applies.

## Verifying the live policy

All read-only:

```bash
# The ruleset as stored
gh api repos/devricardo90/rick-control-center/rulesets
gh api repos/devricardo90/rick-control-center/rulesets/"$RULESET_ID"

# The rules EFFECTIVELY applied to main — this is the one that proves enforcement
gh api repos/devricardo90/rick-control-center/rules/branches/main

# Branch reports itself protected
gh api repos/devricardo90/rick-control-center/branches/main --jq '.protected'

# Merge methods
gh api repos/devricardo90/rick-control-center \
  --jq '{allow_squash_merge,allow_merge_commit,allow_rebase_merge,delete_branch_on_merge}'
```

A stored ruleset is not proof of enforcement. Verification needs all three of:
the configuration exists, it targets `main`, and its rules are active on `main`.
`rules/branches/main` is what establishes the third.

**Do not verify by attempting a force-push, a deletion, or a direct push.** If
the configuration were wrong, the probe would cause exactly the damage the
control exists to prevent. Verification is read-only.

## Changing enforcement state — `PUT`, never `PATCH`

The repository-rulesets API exposes `GET`, `POST` on the collection and `GET`,
**`PUT`**, `DELETE` on an individual ruleset. **There is no `PATCH` method.**

`PUT` has **replacement** semantics. A partial body such as
`-f enforcement=disabled` would silently drop every rule, condition and bypass
setting it omits — turning an intended enforcement change into an accidental
teardown of the entire policy. Always send the **complete** intended payload.

The safe procedure is read the current ruleset, change only `enforcement`, send
it back whole:

```bash
RULESET_ID=$(gh api repos/devricardo90/rick-control-center/rulesets \
  --jq '.[] | select(.name=="governed-main") | .id')

# 1. Capture the complete current ruleset (keep this file — it is the restore point)
gh api repos/devricardo90/rick-control-center/rulesets/"$RULESET_ID" \
  > governed-main.backup.json

# 2. Build a full payload that differs only in enforcement.
#    Only the writable fields are sent; server-managed fields such as id,
#    source, created_at and _links must not be echoed back.
jq '{name, target, enforcement: "disabled", bypass_actors, conditions, rules}' \
  governed-main.backup.json > governed-main.disabled.json

# 3. Replace the ruleset with that complete payload
gh api -X PUT repos/devricardo90/rick-control-center/rulesets/"$RULESET_ID" \
  --input governed-main.disabled.json

# 4. Restore by sending the captured payload back with enforcement active
jq '{name, target, enforcement: "active", bypass_actors, conditions, rules}' \
  governed-main.backup.json > governed-main.active.json
gh api -X PUT repos/devricardo90/rick-control-center/rulesets/"$RULESET_ID" \
  --input governed-main.active.json
```

After any such change, re-verify with `rules/branches/main` — confirm the rules
are active on `main` again, not merely that the payload was accepted.

## Break-glass

There is no standing bypass. Relaxing protection is a deliberate, visible state
change rather than a silent per-merge bypass, and is justified only by:

- a ruleset misconfiguration blocking all delivery; or
- a security fix that must land while CI is unavailable.

Use the `PUT`-with-complete-payload procedure above to set `enforcement` to
`disabled`, perform the minimum necessary action, then restore `active`
immediately.

Record every use on NDERCC-22 with actor, UTC timestamp, SHA, reason and
remediation, **before** the next unrelated merge.

## Rollback — prepared, not exercised

Rollback is documented so it is ready if it is ever genuinely needed. It is
**not** a validation step:

- rollback is **prepared, not exercised**;
- the ruleset must **never** be intentionally disabled merely to demonstrate
  that rollback works;
- rollback is executed **only** if genuinely required during failure recovery;
- normal validation after activation is **read-only** — the commands under
  [Verifying the live policy](#verifying-the-live-policy), nothing more.

Deliberately disabling protection to prove a procedure would create an
artificial unprotected window on `main` — the exact exposure the policy exists
to remove.

Recovery never depends on a bypass actor: repository admins retain ruleset
administration regardless of `bypass_actors`.

```bash
RULESET_ID=$(gh api repos/devricardo90/rick-control-center/rulesets \
  --jq '.[] | select(.name=="governed-main") | .id')

# Full removal, restoring the pre-NDERCC-22 policy
gh api -X DELETE repos/devricardo90/rick-control-center/rulesets/"$RULESET_ID"
gh api -X PATCH repos/devricardo90/rick-control-center \
  -F allow_merge_commit=true -F allow_rebase_merge=true
```

Note that the repository-settings endpoint genuinely is `PATCH` — only the
rulesets endpoints are `PUT`-only.

No branch, commit, or history is touched by this policy, so rollback cannot lose
work.
