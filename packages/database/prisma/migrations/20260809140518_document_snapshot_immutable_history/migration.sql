-- NDERCC-13 / DEC-RIC-003: immutable Google Docs content snapshots.
--
-- Purely additive. No existing table, column, index, constraint or enum is
-- altered or dropped, and no published migration is edited.
--
-- `document_sources_id_project_key` adds no new restriction on
-- document_sources: `id` is already its primary key, so (id, project_id)
-- can never collide. It exists only so document_snapshots can point at a
-- (source, project) PAIR, which makes "a snapshot's project always equals
-- its source's project" an invariant PostgreSQL enforces rather than one
-- the application merely promises.

-- CreateTable
CREATE TABLE "document_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "document_source_id" UUID NOT NULL,
    "provider_version" TEXT NOT NULL,
    "content_text" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "provider_modified_at" TIMESTAMPTZ(3),
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_snapshots_project_id_idx" ON "document_snapshots"("project_id");

-- CreateIndex
CREATE INDEX "document_snapshots_document_source_id_idx" ON "document_snapshots"("document_source_id");

-- CreateIndex
CREATE INDEX "document_snapshots_source_newest_idx" ON "document_snapshots"("document_source_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_snapshots_source_version_checksum_key" ON "document_snapshots"("document_source_id", "provider_version", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "document_sources_id_project_key" ON "document_sources"("id", "project_id");

-- AddForeignKey
ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_document_source_id_project_id_fkey" FOREIGN KEY ("document_source_id", "project_id") REFERENCES "document_sources"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
