# RIC-008 — Risk Engine

Status: Draft 1  
Project: RICK Control Center  
Date: 2026-07-29

## 1. Objective

Define the deterministic mechanism that evaluates execution risk before and during autonomous software-development operations. The engine converts observable signals into a risk score, autonomy level, mandatory controls, approval requirements and stop conditions.

## 2. Principles

- Risk decisions must be explainable and reproducible.
- The same inputs and policy version must produce the same result.
- High-impact actions require stronger evidence and narrower permissions.
- Unknown or missing evidence increases risk.
- Safety rules override agent confidence.
- Risk evaluation is continuous, not limited to execution start.

## 3. Risk dimensions

The engine evaluates eight dimensions:

1. Scope risk.
2. Code risk.
3. Data risk.
4. Security risk.
5. Delivery risk.
6. Environment risk.
7. Evidence risk.
8. Governance risk.

## 4. Scoring model

Each dimension receives a score from 0 to 5. The default weights are:

- Scope: 15%
- Code: 15%
- Data: 15%
- Security: 20%
- Delivery: 15%
- Environment: 5%
- Evidence: 10%
- Governance: 5%

Final score = weighted sum × 20, producing a value from 0 to 100.

## 5. Risk classes

- R0 — Informational: 0–14
- R1 — Low: 15–29
- R2 — Moderate: 30–49
- R3 — High: 50–69
- R4 — Critical: 70–100

Critical rules may raise the class regardless of the numerical score.

## 6. Hard-stop rules

Execution stops for destructive unapproved operations, exposed production credentials, force push to protected branches, out-of-scope modification, unresolved merge conflicts, missing required validation, ambiguous repository targets, contradictory evidence or blocking source-of-truth divergence.

## 7. Autonomy mapping

- R0: autonomous execution, validation, commit and push permitted.
- R1: autonomous execution with standard validation.
- R2: checkpoints and approval before sensitive delivery actions.
- R3: supervised execution and approval before high-impact operations.
- R4: blocked until explicit human decision and mitigation.

## 8. Dynamic reevaluation

Risk is recalculated during contract generation, before execution, after material diffs, before database or infrastructure actions, after failures, before commit and before push, merge or deployment.

## 9. Mitigations

Mitigations include isolated branches or worktrees, read-only mode, narrower file allowlists, dry runs, backups, rollback plans, additional tests, second-agent review, human approval and task decomposition.

## 10. Decision output

Every evaluation records policy version, input snapshot hash, dimension scores, total, effective class, triggered rules, mitigations, allowed and prohibited actions, approval gates, explanation, timestamp and evaluator identity.

## 11. Persistence and explainability

Risk evaluations are immutable and associated with the Execution Contract and run. The interface must show why the class was assigned, which actions are blocked and which mitigation is required.

## 12. MVP scope

The MVP includes rule-based evaluation, weighted scoring, hard stops, autonomy mapping, policy versioning, persisted decisions and UI explanations. Machine-learned risk prediction is outside the MVP.

## 13. Acceptance criteria

The Risk Engine is ready when it produces deterministic and explainable decisions, enforces the permitted action set, reevaluates after material changes and preserves the complete audit trail.
