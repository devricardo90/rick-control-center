# Branch protection on `main`

Operational reference for the governed-branch policy. The decision and its
reasoning live in
[`DEC-RIC-009`](../decisions/DEC-RIC-009-governed-branch-protection.md); this
guide is the practical "what does this mean when I work" companion.

## What is enforced

`main` is governed by a single repository ruleset named `governed-main`,
targeting the default branch, with `enforcement: active` and **no bypass
actors** — the rules apply to everyone, including the repository owner.

| Rule | What it means day to day |
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

Repository merge settings: squash only. Merge commits and rebase merges are
disabled. Merged branches are **not** auto-deleted — task branches are retained.

## Working under it

Nothing changes about the normal flow, because the flow was already this:

1. Branch from `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. Commit, push the branch, open a PR into `main`.
3. Wait for `Validate` to conclude `success`.
4. Resolve every review thread — including bot review threads. An unresolved
   thread blocks the merge even though no approval is required.
5. Squash-merge.

What will now fail that previously succeeded: `git push origin main`,
`git push --force origin main`, deleting `main`, and merging a PR whose
`Validate` has not passed or that has an unresolved review thread.

## Zero required approvals is not "no review"

The ruleset requires no approving review, because this repository has one human
collaborator and GitHub does not let a PR author approve their own PR — any
non-zero value would make bypass the only way to merge anything, which is worse
than requiring none. Review is not skipped; it is enforced at the Jira/RIC
layer, where independent review must return `CLEAN` before merge is authorised.

`required_review_thread_resolution` is the part of the review gate that GitHub
*can* enforce for a solo author, so it is on.

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
check is always produced. Closing that trigger gap is tracked separately.

## Verifying the live policy

All read-only:

```bash
# The ruleset as stored
gh api repos/devricardo90/rick-control-center/rulesets
gh api repos/devricardo90/rick-control-center/rulesets/{id}

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

## Break-glass

There is no standing bypass. If protection must be relaxed — a ruleset
misconfiguration blocking all delivery, or a security fix while CI is down:

```bash
gh api -X PATCH repos/devricardo90/rick-control-center/rulesets/{id} \
  -f enforcement=disabled
# ... perform the minimum necessary action ...
gh api -X PATCH repos/devricardo90/rick-control-center/rulesets/{id} \
  -f enforcement=active
```

This is deliberately a visible state change rather than a silent per-merge
bypass. Record every use on NDERCC-22 with actor, UTC timestamp, SHA, reason and
remediation, **before** the next unrelated merge.

## Rollback

Recovery never depends on a bypass actor: repository admins retain ruleset
administration regardless of `bypass_actors`.

```bash
# Instant, non-destructive
gh api -X PATCH repos/devricardo90/rick-control-center/rulesets/{id} -f enforcement=disabled

# Full removal, restoring the pre-NDERCC-22 policy
gh api -X DELETE repos/devricardo90/rick-control-center/rulesets/{id}
gh api -X PATCH repos/devricardo90/rick-control-center \
  -F allow_merge_commit=true -F allow_rebase_merge=true
```

No branch, commit, or history is touched by this policy, so rollback cannot lose
work.
