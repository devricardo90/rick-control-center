-- CreateTable
CREATE TABLE "operators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "operator_id" UUID NOT NULL,
    "token_digest" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operators_singleton_key" ON "operators"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "operators_username_key" ON "operators"("username");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_digest_key" ON "auth_sessions"("token_digest");

-- CreateIndex
CREATE INDEX "auth_sessions_operator_id_idx" ON "auth_sessions"("operator_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
