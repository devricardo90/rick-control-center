-- CreateEnum
CREATE TYPE "document_provider" AS ENUM ('GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('VISION', 'PRD', 'ARCHITECTURE', 'ROADMAP', 'DESIGN_SYSTEM', 'DATA_MODEL', 'STATE_MACHINE', 'RISK_ENGINE', 'MVP', 'BACKLOG', 'EXECUTION_CONTRACT_SPEC', 'DEVELOPMENT_PROTOCOL');

-- CreateEnum
CREATE TYPE "document_approval_status" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "document_sync_status" AS ENUM ('PENDING', 'SYNCED', 'STALE', 'ERROR');

-- CreateTable
CREATE TABLE "document_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "provider" "document_provider" NOT NULL,
    "external_file_id" TEXT NOT NULL,
    "document_type" "document_type" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "revision" TEXT,
    "approval_status" "document_approval_status" NOT NULL DEFAULT 'DRAFT',
    "sync_status" "document_sync_status" NOT NULL DEFAULT 'PENDING',
    "checksum" TEXT,
    "last_synced_at" TIMESTAMPTZ(3),
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_sources_project_id_idx" ON "document_sources"("project_id");

-- CreateIndex
CREATE INDEX "document_sources_project_id_document_type_idx" ON "document_sources"("project_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_sources_project_provider_external_file_key" ON "document_sources"("project_id", "provider", "external_file_id");

-- AddForeignKey
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
