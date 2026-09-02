-- NDERCC-23 / DEC-RIC-010: governed SDD specification lifecycle (P1-038).
--
-- Exactly one additive migration on top of the eight published migrations.
-- No published migration is edited, renamed, squashed or regenerated.
--
-- Three deliberate departures from a raw `prisma migrate diff` of this schema:
--
-- 1. The diff also proposed renaming five NDERCC-16 foreign keys on
--    `requirements` and `decisions` (e.g.
--    `requirements_document_source_project_fkey` ->
--    `requirements_document_source_id_project_id_fkey`). That is the same
--    pre-existing naming drift the NDERCC-17 migration already declined to
--    absorb: those constraints were named explicitly in the published
--    NDERCC-16 migration while the schema relations carry no `map:`.
--    Renaming them is unrelated to P1-038 and would mutate a previous
--    slice's database objects, so it is deliberately NOT part of this
--    migration. The drift is pre-existing and remains unchanged.
--
-- 2. `implementation_specs_task_approved_key` is a PARTIAL unique index.
--    Prisma cannot express a partial index in the schema, so it is written
--    by hand below — the same situation as `operators_singleton_check` and
--    `task_dependencies_no_self_check`. It enforces at most one APPROVED
--    specification per Task, so a later Execution Contract generator can
--    never face two competing specification authorities for one unit of
--    work. A future `prisma migrate dev` touching this table must not let
--    the schema differ drop it as unrepresented drift.
--
-- 3. `implementation_specs_supersedes_self_check` likewise has no Prisma
--    schema representation and is written by hand. A specification that
--    superseded itself would be a lineage cycle of length one and would
--    make "what replaced this?" unanswerable.
--
-- `requirements_id_project_key` below is additive only: `id` is already
-- unique on its own, so the new index changes no existing behaviour. It
-- exists so `implementation_spec_requirements` can reference a requirement
-- through a composite (id, project_id) foreign key, making a cross-project
-- traceability link impossible at the database level rather than only in
-- application code.
--
-- This migration creates no Execution Contract table, type or constraint.
-- P0-040 through P0-043 remain unimplemented.

-- CreateEnum
CREATE TYPE "implementation_spec_status" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "implementation_specs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "version_major" INTEGER NOT NULL,
    "version_minor" INTEGER NOT NULL,
    "version_patch" INTEGER NOT NULL,
    "status" "implementation_spec_status" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "behavior" TEXT NOT NULL,
    "scope_json" JSONB NOT NULL,
    "non_goals_json" JSONB NOT NULL,
    "acceptance_criteria_json" JSONB NOT NULL,
    "constraints_json" JSONB NOT NULL DEFAULT '[]',
    "dependencies_json" JSONB NOT NULL DEFAULT '[]',
    "risks_json" JSONB NOT NULL DEFAULT '[]',
    "interfaces_json" JSONB NOT NULL DEFAULT '[]',
    "validation_strategy_json" JSONB NOT NULL DEFAULT '[]',
    "content_hash" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "supersedes_spec_id" UUID,
    "approved_by_operator_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "superseded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "implementation_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_spec_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "spec_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_spec_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_spec_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "spec_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "implementation_spec_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "implementation_specs_project_status_idx" ON "implementation_specs"("project_id", "status");

-- CreateIndex
CREATE INDEX "implementation_specs_task_status_idx" ON "implementation_specs"("task_id", "status");

-- CreateIndex
CREATE INDEX "implementation_specs_lineage_order_idx" ON "implementation_specs"("project_id", "code", "version_major", "version_minor", "version_patch");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_specs_id_project_key" ON "implementation_specs"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_specs_project_code_version_key" ON "implementation_specs"("project_id", "code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_specs_supersedes_key" ON "implementation_specs"("supersedes_spec_id");

-- CreateIndex
CREATE INDEX "implementation_spec_requirements_project_idx" ON "implementation_spec_requirements"("project_id");

-- CreateIndex
CREATE INDEX "implementation_spec_requirements_requirement_idx" ON "implementation_spec_requirements"("requirement_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_spec_requirements_pair_key" ON "implementation_spec_requirements"("spec_id", "requirement_id");

-- CreateIndex
CREATE INDEX "implementation_spec_decisions_project_idx" ON "implementation_spec_decisions"("project_id");

-- CreateIndex
CREATE INDEX "implementation_spec_decisions_decision_idx" ON "implementation_spec_decisions"("decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_spec_decisions_pair_key" ON "implementation_spec_decisions"("spec_id", "decision_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_id_project_key" ON "requirements"("id", "project_id");

-- AddForeignKey
ALTER TABLE "implementation_specs" ADD CONSTRAINT "implementation_specs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_specs" ADD CONSTRAINT "implementation_specs_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_specs" ADD CONSTRAINT "implementation_specs_approved_by_operator_id_fkey" FOREIGN KEY ("approved_by_operator_id") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_specs" ADD CONSTRAINT "implementation_specs_supersedes_spec_id_project_id_fkey" FOREIGN KEY ("supersedes_spec_id", "project_id") REFERENCES "implementation_specs"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_spec_requirements" ADD CONSTRAINT "implementation_spec_requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_spec_requirements" ADD CONSTRAINT "implementation_spec_requirements_spec_id_project_id_fkey" FOREIGN KEY ("spec_id", "project_id") REFERENCES "implementation_specs"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_spec_requirements" ADD CONSTRAINT "implementation_spec_requirements_requirement_id_project_id_fkey" FOREIGN KEY ("requirement_id", "project_id") REFERENCES "requirements"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_spec_decisions" ADD CONSTRAINT "implementation_spec_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_spec_decisions" ADD CONSTRAINT "implementation_spec_decisions_spec_id_project_id_fkey" FOREIGN KEY ("spec_id", "project_id") REFERENCES "implementation_specs"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementation_spec_decisions" ADD CONSTRAINT "implementation_spec_decisions_decision_id_project_id_fkey" FOREIGN KEY ("decision_id", "project_id") REFERENCES "decisions"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateIndex (hand-written: partial unique indexes have no Prisma schema
-- representation — see note 2 in the header)
--
-- At most one APPROVED specification per Task. DRAFT, REJECTED and
-- SUPERSEDED rows are outside the predicate and stay unlimited, which is
-- what preserves the full revision history alongside the single current
-- authority. Approving a replacement therefore has to mark its predecessor
-- SUPERSEDED in the same transaction — the index makes that ordering a
-- database guarantee rather than an application convention.
CREATE UNIQUE INDEX "implementation_specs_task_approved_key"
    ON "implementation_specs" ("task_id")
    WHERE "status" = 'APPROVED';

-- AddCheck (hand-written: `@@check` is not supported in this Prisma version
-- — see note 3 in the header)
ALTER TABLE "implementation_specs"
    ADD CONSTRAINT "implementation_specs_supersedes_self_check"
    CHECK ("supersedes_spec_id" IS NULL OR "supersedes_spec_id" <> "id");
