ALTER TABLE "public"."tenant_memberships"
  ADD COLUMN IF NOT EXISTS "jabatan" TEXT,
  ADD COLUMN IF NOT EXISTS "can_view" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "can_edit" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."tenant_memberships"
SET
  "can_view" = true,
  "can_edit" = CASE
    WHEN "role" IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'ADMIN') THEN true
    ELSE false
  END
WHERE "can_view" IS DISTINCT FROM true
   OR "can_edit" IS NULL;
