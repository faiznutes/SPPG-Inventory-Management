-- Extend UserRole enum for multi-tenant governance
ALTER TYPE "public"."UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "public"."UserRole" ADD VALUE IF NOT EXISTS 'TENANT_ADMIN';
ALTER TYPE "public"."UserRole" ADD VALUE IF NOT EXISTS 'KOORD_DAPUR';
ALTER TYPE "public"."UserRole" ADD VALUE IF NOT EXISTS 'KOORD_KEBERSIHAN';
ALTER TYPE "public"."UserRole" ADD VALUE IF NOT EXISTS 'KOORD_LAPANGAN';
ALTER TYPE "public"."UserRole" ADD VALUE IF NOT EXISTS 'STAFF';

-- Create tenants table
CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_code_key" ON "public"."tenants"("code");

-- Create tenant memberships table
CREATE TABLE IF NOT EXISTS "public"."tenant_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_memberships_user_id_tenant_id_key" ON "public"."tenant_memberships"("user_id", "tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_tenant_id_idx" ON "public"."tenant_memberships"("tenant_id");

ALTER TABLE "public"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default tenant and bootstrap memberships from existing users
INSERT INTO "public"."tenants" ("id", "name", "code", "is_active", "created_at", "updated_at")
SELECT 'tenant-default', 'SPPG Pusat', 'sppg-pusat', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "public"."tenants" WHERE "code" = 'sppg-pusat');

INSERT INTO "public"."tenant_memberships" (
  "id",
  "user_id",
  "tenant_id",
  "role",
  "is_default",
  "created_at",
  "updated_at"
)
SELECT
  ('tm-' || u."id")::text,
  u."id",
  (SELECT t."id" FROM "public"."tenants" t WHERE t."code" = 'sppg-pusat' LIMIT 1),
  CASE
    WHEN u."role" = 'ADMIN'::"public"."UserRole" THEN 'SUPER_ADMIN'::"public"."UserRole"
    ELSE u."role"
  END,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "public"."users" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."tenant_memberships" tm
  WHERE tm."user_id" = u."id"
    AND tm."tenant_id" = (SELECT t."id" FROM "public"."tenants" t WHERE t."code" = 'sppg-pusat' LIMIT 1)
);

-- Promote legacy ADMIN users to SUPER_ADMIN for governance transition
UPDATE "public"."users"
SET "role" = 'SUPER_ADMIN'::"public"."UserRole"
WHERE "role" = 'ADMIN'::"public"."UserRole";
