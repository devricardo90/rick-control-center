-- NDERCC-17 / DEC-RIC-005: operational backlog model (P0-030).
--
-- Exactly one additive migration on top of the seven published migrations.
-- No published migration is edited, renamed, squashed or regenerated.
--
-- Two deliberate departures from a raw `prisma migrate diff` of this schema:
--
-- 1. The diff also proposed renaming five NDERCC-16 foreign keys on
--    `requirements` and `decisions` (e.g.
--    `requirements_document_source_project_fkey` ->
--    `requirements_document_source_id_project_id_fkey`). Those constraints
--    were named explicitly in the published NDERCC-16 migration while the
--    schema relations carry no `map:`, so Prisma's differ reports a naming
--    drift that predates this task. Renaming them is unrelated to P0-030 and
--    would mutate a previous slice's database objects, so it is deliberately
--    NOT part of this migration. The drift is pre-existing and unchanged.
-- 2. `task_dependencies_no_self_check` below has no Prisma schema
--    representation (`@@check` is not supported in this Prisma version), so
--    it is written by hand — the same situation as
--    `operators_singleton_check` in the single-user authentication
--    migration. A future `prisma migrate dev` touching this table must not
--    let the schema differ drop it as unrepresented drift.

-- CreateEnum
CREATE TYPE "sprint_status" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "epic_status" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_type" AS ENUM ('STORY', 'TASK', 'BUG', 'SPIKE', 'CHORE');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "backlog_external_provider" AS ENUM ('JIRA');

-- CreateTable
CREATE TABLE "sprints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "status" "sprint_status" NOT NULL DEFAULT 'PLANNED',
    "sequence" INTEGER NOT NULL,
    "planned_start_at" TIMESTAMPTZ(3),
    "planned_end_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "sprint_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "epic_status" NOT NULL DEFAULT 'PLANNED',
    "sequence" INTEGER NOT NULL,
    "external_provider" "backlog_external_provider",
    "external_id" TEXT,
    "external_key" TEXT,
    "external_url" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "epics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "sprint_id" UUID NOT NULL,
    "epic_id" UUID,
    "code" TEXT NOT NULL,
    "type" "task_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "priority" "task_priority" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "acceptance_criteria_json" JSONB NOT NULL DEFAULT '[]',
    "external_provider" "backlog_external_provider",
    "external_id" TEXT,
    "external_key" TEXT,
    "external_url" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "depends_on_task_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- A task can never be its own prerequisite. Enforced by the database, not
-- only by the persistence layer, so no code path can insert a self-edge.
ALTER TABLE "task_dependencies"
    ADD CONSTRAINT "task_dependencies_no_self_check" CHECK ("task_id" <> "depends_on_task_id");

-- CreateIndex
CREATE INDEX "sprints_project_status_idx" ON "sprints"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_project_code_key" ON "sprints"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_project_sequence_key" ON "sprints"("project_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_id_project_key" ON "sprints"("id", "project_id");

-- CreateIndex
CREATE INDEX "epics_project_status_idx" ON "epics"("project_id", "status");

-- CreateIndex
CREATE INDEX "epics_sprint_idx" ON "epics"("sprint_id");

-- CreateIndex
CREATE UNIQUE INDEX "epics_project_code_key" ON "epics"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "epics_sprint_sequence_key" ON "epics"("sprint_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "epics_project_external_key" ON "epics"("project_id", "external_provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "epics_id_project_sprint_key" ON "epics"("id", "project_id", "sprint_id");

-- CreateIndex
CREATE INDEX "tasks_project_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_sprint_status_priority_sequence_idx" ON "tasks"("sprint_id", "status", "priority", "sequence");

-- CreateIndex
CREATE INDEX "tasks_epic_idx" ON "tasks"("epic_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_code_key" ON "tasks"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_sprint_sequence_key" ON "tasks"("sprint_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_external_key" ON "tasks"("project_id", "external_provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_project_key" ON "tasks"("id", "project_id");

-- CreateIndex
CREATE INDEX "task_dependencies_project_idx" ON "task_dependencies"("project_id");

-- CreateIndex
CREATE INDEX "task_dependencies_task_idx" ON "task_dependencies"("task_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_idx" ON "task_dependencies"("depends_on_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_pair_key" ON "task_dependencies"("task_id", "depends_on_task_id");

-- AddForeignKey
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_sprint_id_project_id_fkey" FOREIGN KEY ("sprint_id", "project_id") REFERENCES "sprints"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sprint_id_project_id_fkey" FOREIGN KEY ("sprint_id", "project_id") REFERENCES "sprints"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- MATCH SIMPLE (the PostgreSQL default): not checked while "epic_id" is
-- NULL, which is exactly the wanted behaviour for an optional Epic. A Task
-- that does name an Epic must agree with it on both project and sprint.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_epic_id_project_id_sprint_id_fkey" FOREIGN KEY ("epic_id", "project_id", "sprint_id") REFERENCES "epics"("id", "project_id", "sprint_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Both edges resolve through (task id, project id), so a dependency that
-- spans two projects cannot be inserted at all.
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_project_id_fkey" FOREIGN KEY ("task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_project_id_fkey" FOREIGN KEY ("depends_on_task_id", "project_id") REFERENCES "tasks"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
