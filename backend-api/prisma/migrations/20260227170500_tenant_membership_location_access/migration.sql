CREATE TABLE IF NOT EXISTS "tenant_membership_locations" (
  "id" TEXT NOT NULL,
  "tenant_membership_id" TEXT NOT NULL,
  "location_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_membership_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_membership_locations_tenant_membership_id_location_id_key"
ON "tenant_membership_locations"("tenant_membership_id", "location_id");

CREATE INDEX IF NOT EXISTS "tenant_membership_locations_location_id_idx"
ON "tenant_membership_locations"("location_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_membership_locations_tenant_membership_id_fkey'
  ) THEN
    ALTER TABLE "tenant_membership_locations"
    ADD CONSTRAINT "tenant_membership_locations_tenant_membership_id_fkey"
    FOREIGN KEY ("tenant_membership_id") REFERENCES "tenant_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_membership_locations_location_id_fkey'
  ) THEN
    ALTER TABLE "tenant_membership_locations"
    ADD CONSTRAINT "tenant_membership_locations_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
