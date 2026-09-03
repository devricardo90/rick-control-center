-- NDERCC-37 / RIC-S3-02 / P0-040: canonical Execution Contract schema.
--
-- This migration is additive. It defines the structural persistence boundary
-- only; generation (P0-041), completeness/readiness (P0-042) and hashing /
-- versioning (P0-043) remain separate tasks.
--
-- Identity and authority references are relational. RIC-011 sections whose
-- internal structures are defined here but whose queryable subfields are not
-- yet separate RCC aggregates are stored as JSONB. The approved
-- ImplementationSpec is referenced, never copied.

-- CreateEnum
CREATE TYPE "execution_contract_status" AS ENUM (
    'DRAFT',
    'READY',
    'ACTIVE',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'SUPERSEDED'
);

-- CreateEnum
CREATE TYPE "execution_mode" AS ENUM (
    'SUPERVISED',
    'CONTROLLED_AUTONOMOUS',
    'DRY_RUN',
    'RECOVERY'
);

-- CreateEnum
CREATE TYPE "execution_actor_kind" AS ENUM ('USER', 'SYSTEM', 'AGENT');

-- CreateTable
CREATE TABLE "execution_contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "sprint_id" UUID NOT NULL,
    "contract_version" TEXT NOT NULL,
    "status" "execution_contract_status" NOT NULL DEFAULT 'DRAFT',
    "execution_mode" "execution_mode" NOT NULL,
    "source_snapshot_id" TEXT NOT NULL,
    "content_hash" TEXT,
    "approved_implementation_spec_id" UUID NOT NULL,
    "created_by_kind" "execution_actor_kind" NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "source_snapshot_json" JSONB NOT NULL,
    "objectives_json" JSONB NOT NULL,
    "scope_json" JSONB NOT NULL,
    "agents_json" JSONB NOT NULL,
    "preconditions_json" JSONB NOT NULL,
    "work_units_json" JSONB NOT NULL,
    "command_policy_json" JSONB NOT NULL,
    "risk_assessment_json" JSONB NOT NULL,
    "validations_json" JSONB NOT NULL,
    "evidence_requirements_json" JSONB NOT NULL,
    "approval_gates_json" JSONB NOT NULL,
    "git_policy_json" JSONB NOT NULL,
    "jira_policy_json" JSONB NOT NULL,
    "retry_policy_json" JSONB NOT NULL,
    "recovery_policy_json" JSONB NOT NULL,
    "completion_policy_json" JSONB NOT NULL,
    "signatures_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "execution_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_contract_tasks" (
    "execution_contract_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "sprint_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "execution_contract_tasks_pkey" PRIMARY KEY ("execution_contract_id", "project_id", "task_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execution_contracts_id_project_sprint_key"
    ON "execution_contracts" ("id", "project_id", "sprint_id");

-- CreateIndex
CREATE INDEX "execution_contracts_project_status_idx"
    ON "execution_contracts" ("project_id", "status");

-- CreateIndex
CREATE INDEX "execution_contracts_sprint_idx"
    ON "execution_contracts" ("sprint_id");

-- CreateIndex
CREATE INDEX "execution_contracts_spec_idx"
    ON "execution_contracts" ("approved_implementation_spec_id");

-- CreateIndex
CREATE UNIQUE INDEX "execution_contract_tasks_contract_position_key"
    ON "execution_contract_tasks" ("execution_contract_id", "project_id", "position");

-- CreateIndex
CREATE INDEX "execution_contract_tasks_project_task_idx"
    ON "execution_contract_tasks" ("project_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_project_sprint_key"
    ON "tasks" ("id", "project_id", "sprint_id");

-- AddForeignKey
ALTER TABLE "execution_contracts"
    ADD CONSTRAINT "execution_contracts_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_contracts"
    ADD CONSTRAINT "execution_contracts_sprint_id_project_id_fkey"
    FOREIGN KEY ("sprint_id", "project_id") REFERENCES "sprints"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_contracts"
    ADD CONSTRAINT "execution_contracts_approved_implementation_spec_id_project_id_fkey"
    FOREIGN KEY ("approved_implementation_spec_id", "project_id") REFERENCES "implementation_specs"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_contract_tasks"
    ADD CONSTRAINT "execution_contract_tasks_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_contract_tasks"
    ADD CONSTRAINT "execution_contract_tasks_execution_contract_id_project_id_sprint_id_fkey"
    FOREIGN KEY ("execution_contract_id", "project_id", "sprint_id") REFERENCES "execution_contracts"("id", "project_id", "sprint_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_contract_tasks"
    ADD CONSTRAINT "execution_contract_tasks_task_id_project_id_sprint_id_fkey"
    FOREIGN KEY ("task_id", "project_id", "sprint_id") REFERENCES "tasks"("id", "project_id", "sprint_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheck
-- Prisma 7.9.1 has no schema representation for CHECK constraints, so these
-- structural guards are intentionally hand-written and must be preserved by
-- any future migration touching these tables.
ALTER TABLE "execution_contracts"
    ADD CONSTRAINT "execution_contracts_version_check"
    CHECK ("contract_version" ~ '^[0-9]+[.][0-9]+[.][0-9]+$');

ALTER TABLE "execution_contracts"
    ADD CONSTRAINT "execution_contracts_non_empty_identity_values_check"
    CHECK (
        btrim("source_snapshot_id") <> ''
        AND btrim("created_by_id") <> ''
        AND ("content_hash" IS NULL OR btrim("content_hash") <> '')
    );

ALTER TABLE "execution_contract_tasks"
    ADD CONSTRAINT "execution_contract_tasks_position_check"
    CHECK ("position" >= 0);
