-- AlterTable
-- Nullable, generic JSONB field for normalized NON-SECRET provider
-- configuration (NDERCC-11 / DEC-RIC-001). GitHub's normalized shape
-- (owner, repository name, canonical full name, default branch, URL,
-- visibility, archived flag, access mode, permission booleans) is the
-- first consumer; no token or credential is ever written here.
ALTER TABLE "integration_connections" ADD COLUMN "configuration_json" JSONB;

-- CreateIndex
-- Prevents duplicate connection rows for the same project/provider/
-- external repository, while leaving multiple *distinct* repositories per
-- project fully possible: `external_account_id` differs per repository,
-- and Postgres treats multiple NULLs in a unique index as non-conflicting
-- (so providers that don't yet set an external account id are unaffected).
CREATE UNIQUE INDEX "integration_connections_project_provider_external_account_key" ON "integration_connections"("project_id", "provider", "external_account_id");
