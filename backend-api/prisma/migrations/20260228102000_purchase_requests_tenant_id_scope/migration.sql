ALTER TABLE "purchase_requests"
ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

UPDATE "purchase_requests" pr
SET "tenant_id" = membership."tenant_id"
FROM (
  SELECT DISTINCT ON (tm."user_id") tm."user_id", tm."tenant_id"
  FROM "tenant_memberships" tm
  ORDER BY tm."user_id", tm."is_default" DESC, tm."created_at" ASC
) membership
WHERE pr."tenant_id" IS NULL
  AND pr."requested_by" = membership."user_id";

UPDATE "purchase_requests" pr
SET "tenant_id" = audit."tenant_id"
FROM (
  SELECT DISTINCT ON (al."entity_id") al."entity_id", al."tenant_id"
  FROM "audit_logs" al
  WHERE al."entity_type" = 'purchase_requests'
    AND al."tenant_id" IS NOT NULL
  ORDER BY al."entity_id", al."created_at" ASC
) audit
WHERE pr."tenant_id" IS NULL
  AND pr."id" = audit."entity_id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "purchase_requests" WHERE "tenant_id" IS NULL) THEN
    RAISE EXCEPTION 'purchase_requests.tenant_id backfill failed: found NULL values';
  END IF;
END $$;

ALTER TABLE "purchase_requests"
ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "purchase_requests_tenant_id_created_at_idx"
ON "purchase_requests"("tenant_id", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_requests_tenant_id_fkey'
  ) THEN
    ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
