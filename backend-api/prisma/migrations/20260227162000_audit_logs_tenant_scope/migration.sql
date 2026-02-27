ALTER TABLE "audit_logs"
ADD COLUMN "tenant_id" TEXT;

CREATE INDEX "audit_logs_tenant_id_created_at_idx"
ON "audit_logs"("tenant_id", "created_at" DESC);

CREATE INDEX "audit_logs_tenant_id_entity_type_created_at_idx"
ON "audit_logs"("tenant_id", "entity_type", "created_at" DESC);

CREATE INDEX "audit_logs_tenant_id_actor_user_id_created_at_idx"
ON "audit_logs"("tenant_id", "actor_user_id", "created_at" DESC);

CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx"
ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);
