-- NDERCC-16 / DEC-RIC-004: deterministic strategic-truth projection.
--
-- Exactly one additive migration. Published Sprint 0/Sprint 1 migrations are
-- intentionally left untouched. Composite provenance keys make a fact's
-- project, source and immutable snapshot agree at the database boundary.

-- CreateEnum
CREATE TYPE "requirement_type" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL', 'CONSTRAINT');

-- CreateEnum
CREATE TYPE "requirement_priority" AS ENUM ('P0', 'P1', 'P2', 'P3', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "requirement_status" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "decision_status" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- Give provenance relations a project-aware target without changing the
-- existing immutable snapshot rows.
CREATE UNIQUE INDEX "document_snapshots_id_project_key" ON "document_snapshots"("id", "project_id");

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "requirement_type" NOT NULL,
    "priority" "requirement_priority" NOT NULL DEFAULT 'UNSPECIFIED',
    "status" "requirement_status" NOT NULL DEFAULT 'ACTIVE',
    "document_source_id" UUID NOT NULL,
    "source_snapshot_id" UUID NOT NULL,
    "acceptance_criteria_json" JSONB,
    "extractor_version" TEXT NOT NULL,
    "source_locator_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "chosen_decision" TEXT NOT NULL,
    "consequences" TEXT,
    "status" "decision_status" NOT NULL DEFAULT 'PROPOSED',
    "supersedes_decision_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "document_source_id" UUID NOT NULL,
    "source_snapshot_id" UUID NOT NULL,
    "extractor_version" TEXT NOT NULL,
    "source_locator_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirements_project_code_key" ON "requirements"("project_id", "code");
CREATE INDEX "requirements_project_status_idx" ON "requirements"("project_id", "status");
CREATE INDEX "requirements_document_source_idx" ON "requirements"("document_source_id");
CREATE INDEX "requirements_source_snapshot_idx" ON "requirements"("source_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "decisions_id_project_key" ON "decisions"("id", "project_id");
CREATE UNIQUE INDEX "decisions_project_code_key" ON "decisions"("project_id", "code");
CREATE INDEX "decisions_project_status_idx" ON "decisions"("project_id", "status");
CREATE INDEX "decisions_document_source_idx" ON "decisions"("document_source_id");
CREATE INDEX "decisions_source_snapshot_idx" ON "decisions"("source_snapshot_id");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_document_source_project_fkey" FOREIGN KEY ("document_source_id", "project_id") REFERENCES "document_sources"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_source_snapshot_project_fkey" FOREIGN KEY ("source_snapshot_id", "project_id") REFERENCES "document_snapshots"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_document_source_project_fkey" FOREIGN KEY ("document_source_id", "project_id") REFERENCES "document_sources"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_source_snapshot_project_fkey" FOREIGN KEY ("source_snapshot_id", "project_id") REFERENCES "document_snapshots"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_supersedes_project_fkey" FOREIGN KEY ("supersedes_decision_id", "project_id") REFERENCES "decisions"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
