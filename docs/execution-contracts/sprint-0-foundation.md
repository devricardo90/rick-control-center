# Execution Contract — Sprint 0: Foundation

**Project:** RICK Control Center  
**Contract ID:** RIC-EC-S0-001  
**Version:** 1.0.0  
**Status:** READY  
**Approved by:** Ricardo Souza  
**Approval date:** 2026-07-29  

## 1. Objective

Create the executable technical foundation of the RICK Control Center as a Nuxt 3 and TypeScript application with PostgreSQL persistence, initial project management, validated architecture boundaries, automated quality gates and CI.

## 2. Source baseline

- Approved documentation baseline: `docs/00-documentation-approval-baseline.md`
- Product Vision: `docs/01-product-vision.md`
- PRD: `docs/02-prd.md`
- Technical Architecture: `docs/03-technical-architecture.md`
- Roadmap: `docs/04-roadmap.md`
- Design System: `docs/05-design-system.md`
- Data Model: `docs/06-data-model.md`
- State Machine: `docs/07-state-machine.md`
- Risk Engine: `docs/08-risk-engine.md`
- MVP: `docs/09-mvp.md`
- Backlog: `docs/10-backlog.md`
- Execution Contract Specification: `docs/11-execution-contract-specification.md`
- Development Protocol: `docs/12-development-protocol.md`

## 3. Execution mode

- Default mode: controlled autonomous
- Branch policy: configurable per project; branch per task is the default
- Commit and push policy: configurable per project; automatic after all mandatory validations pass is the default
- Human gate: required for scope changes, destructive operations, unresolved architectural decisions, critical risk or failed mandatory validations

## 4. Scope

### Included

1. Initialize or normalize the Nuxt 3 application with strict TypeScript.
2. Establish the modular monolith folder structure.
3. Configure PostgreSQL and Prisma.
4. Add versioned database migrations.
5. Implement the initial `Project` and `IntegrationConnection` persistence models.
6. Implement a minimal project creation and listing flow.
7. Add single-user authentication with login and password.
8. Configure lint, typecheck, unit tests and production build.
9. Configure initial CI.
10. Add templates for Architecture Decisions and future Execution Contracts.
11. Provide reproducible local setup documentation.
12. Produce sprint evidence and handoff.

### Excluded

- Real agent execution through Claude Agent SDK
- Automatic Jira project and issue creation
- Automatic GitHub repository creation workflow
- Web terminal
- Full Workspace editor
- Complete Design Studio
- SSE execution event stream
- Risk Engine runtime implementation
- Automatic commit/push orchestration by the application itself

## 5. Required work items

### RIC-S0-01 — Repository and application foundation

- Establish Nuxt 3, Vue 3 and strict TypeScript baseline.
- Define application, server, domain, application and infrastructure boundaries.
- Add environment configuration validation.

### RIC-S0-02 — Quality gates and CI

- Configure lint.
- Configure typecheck.
- Configure unit test runner.
- Configure production build.
- Add CI executing all mandatory gates.

### RIC-S0-03 — PostgreSQL and Prisma foundation

- Configure PostgreSQL connection.
- Add Prisma schema and migration workflow.
- Add reproducible database startup instructions.
- Prevent credentials from appearing in logs.

### RIC-S0-04 — Initial domain and persistence model

- Implement `Project`.
- Implement `IntegrationConnection`.
- Enforce project isolation fields and constraints.
- Add repository-level tests.

### RIC-S0-05 — Single-user authentication

- Add login and password authentication for one operator per installation.
- Store password using a secure one-way hash.
- Protect operational routes and APIs.
- Do not implement multi-user roles.

### RIC-S0-06 — Minimal project interface

- Create project list.
- Create project form.
- Display project status and essential configuration.
- Apply system theme preference with light and dark support.
- Use Lucide icons.
- Use shadcn-vue/Reka UI as the component foundation.
- Use Inter for interface text and JetBrains Mono for code and technical identifiers.

### RIC-S0-07 — Governance templates and developer handoff

- Add ADR template.
- Add Execution Contract template.
- Add local development guide.
- Add Sprint 0 evidence report.

## 6. Allowed areas

The implementation may modify or create files in:

- application and server source directories
- database and migration directories
- test directories
- CI configuration
- root project configuration
- documentation related to setup, architecture decisions, execution contracts and Sprint 0 evidence

## 7. Prohibited operations

- Force push
- Rewriting published Git history
- Deleting approved strategic documents
- Adding production credentials to the repository
- Modifying unrelated repositories
- Implementing features explicitly outside Sprint 0
- Marking work complete while mandatory gates fail
- Bypassing authentication or project isolation tests

## 8. Technical decisions fixed by approval

- Authentication: one user with login and password
- Initial operators: one operator per installation
- Branch policy: configurable by project, branch per task as default
- Commit and push: configurable by project, automatic after validation as default
- Repository creation: existing repository or automatic creation supported in future
- Jira creation: RICK should create Jira project, Epics and Tasks when integration is available
- ORM: Prisma
- Large evidence storage in MVP: local disk
- Log retention: configurable by project, 90 days by default
- Secrets: external secret vault target for the MVP architecture
- ProjectSnapshot: current state persisted; history retained through events and audit records
- Theme: system preference with light and dark modes
- Brand direction: technical blue-violet
- Component foundation: shadcn-vue/Reka UI
- Icons: Lucide
- Typography: Inter and JetBrains Mono
- Design Studio target: advanced visual editor, delivered in later roadmap phases
- Default autonomy: configurable by project, controlled autonomous as default

## 9. Mandatory validation plan

The exact package-manager commands must be resolved from the repository. Equivalent gates are mandatory:

1. Dependency installation succeeds from a clean checkout.
2. Lint passes.
3. Typecheck passes.
4. Unit tests pass.
5. Production build passes.
6. Database migration applies to an empty database.
7. Project creation and listing work against the migrated database.
8. Authentication protects restricted routes and APIs.
9. No secrets are committed.
10. `git diff --check` passes.

## 10. Evidence plan

The final evidence package must include:

- final diff summary
- complete changed-file list
- commands executed
- lint result
- typecheck result
- test result and test count
- build result
- migration result
- authentication verification
- project creation/listing verification
- residual risks
- final commit SHA
- push confirmation
- Jira synchronization status or explicit connector blocker

## 11. Stop conditions

Execution must stop and return `BLOCKED` when:

- the repository state contradicts this contract
- required credentials or external permissions are unavailable
- an architectural change outside the approved baseline is required
- a destructive migration is proposed
- mandatory validation repeatedly fails beyond the configured retry limit
- changes exceed the declared scope
- project isolation cannot be guaranteed
- authentication cannot be implemented securely

## 12. Completion criteria

Sprint 0 is complete only when:

- the application starts locally from documented steps
- PostgreSQL starts and migrations apply reproducibly
- the single operator can authenticate
- a project can be created and listed
- lint, typecheck, tests and build pass
- CI is configured and valid
- no critical or high unresolved risk remains
- evidence is published
- commit and push follow the configured policy
- Jira is updated, or the exact Jira connector blocker is recorded

## 13. Jira synchronization plan

Planned hierarchy:

- Epic: `Sprint 0 — RICK Foundation`
- Tasks: `RIC-S0-01` through `RIC-S0-07`

Current connector status at contract creation: `BLOCKED — Atlassian Rovo returned HTTP 403 because the app is not installed on the Jira instance.`

This blocker does not invalidate the technical contract, but Jira creation and synchronization cannot be claimed as completed until the connector is installed and access is restored.
