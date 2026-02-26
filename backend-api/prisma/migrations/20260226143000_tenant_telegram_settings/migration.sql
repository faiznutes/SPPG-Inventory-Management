CREATE TABLE "tenant_telegram_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "bot_token" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "send_on_checklist_export" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_telegram_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_telegram_settings_tenant_id_key" ON "tenant_telegram_settings"("tenant_id");

ALTER TABLE "tenant_telegram_settings"
ADD CONSTRAINT "tenant_telegram_settings_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
