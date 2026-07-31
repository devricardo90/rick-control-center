/*
  Warnings:

  - You are about to drop the `health_checks` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "autonomy_policy" AS ENUM ('SUPERVISED', 'CONTROLLED_AUTONOMOUS');

-- CreateEnum
CREATE TYPE "branch_policy" AS ENUM ('BRANCH_PER_TASK', 'DIRECT_COMMIT');

-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('GITHUB', 'JIRA', 'GOOGLE_DRIVE', 'AGENT_RUNTIME');

-- CreateEnum
CREATE TYPE "integration_connection_status" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'DISCONNECTED');

-- DropTable
DROP TABLE "health_checks";

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'ACTIVE',
    "autonomy_policy" "autonomy_policy" NOT NULL DEFAULT 'CONTROLLED_AUTONOMOUS',
    "default_branch_policy" "branch_policy" NOT NULL DEFAULT 'BRANCH_PER_TASK',
    "workspace_path" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "integration_connection_status" NOT NULL DEFAULT 'PENDING',
    "external_account_id" TEXT,
    "configuration_encrypted" TEXT,
    "last_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_key_key" ON "projects"("key");

-- CreateIndex
CREATE INDEX "integration_connections_project_id_idx" ON "integration_connections"("project_id");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
