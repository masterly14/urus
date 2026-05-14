-- ============================================================================
-- Alertas guardadas del Core de Mercado.
--
-- Reemplaza el cron `run-rules` no-op por un evaluador real:
--   - market_saved_alerts:    una "busqueda persistente" por usuario.
--   - market_alert_deliveries: registro idempotente de cada match entregado
--                              para no reenviar el mismo listing dos veces.
--
-- El cron de evaluacion lee alertas activas, ejecuta el filtro contra
-- MarketEvent + MarketListing desde lastEvaluatedAt y entrega los matches
-- por canales configurados (in_app via Notification + Pusher; whatsapp via
-- plantilla Meta agregada `market_alert_match`).
-- ============================================================================

CREATE TABLE "market_saved_alerts" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "filters"         JSONB NOT NULL,
  "channels"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "frequency"       TEXT NOT NULL DEFAULT 'hourly',
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "lastEvaluatedAt" TIMESTAMP(3),
  "lastDeliveredAt" TIMESTAMP(3),
  "deliveryCount"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "market_saved_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_saved_alerts_userId_active_idx"
  ON "market_saved_alerts"("userId", "active");

CREATE INDEX "market_saved_alerts_active_lastEvaluatedAt_idx"
  ON "market_saved_alerts"("active", "lastEvaluatedAt");

CREATE TABLE "market_alert_deliveries" (
  "id"           TEXT NOT NULL,
  "alertId"      TEXT NOT NULL,
  "listingId"    TEXT NOT NULL,
  "channel"      TEXT NOT NULL,
  "deliveredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dedupeKey"    TEXT NOT NULL,
  "payload"      JSONB,

  CONSTRAINT "market_alert_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_alert_deliveries_dedupeKey_key"
  ON "market_alert_deliveries"("dedupeKey");

CREATE INDEX "market_alert_deliveries_alertId_deliveredAt_idx"
  ON "market_alert_deliveries"("alertId", "deliveredAt");

CREATE INDEX "market_alert_deliveries_listingId_deliveredAt_idx"
  ON "market_alert_deliveries"("listingId", "deliveredAt");

ALTER TABLE "market_alert_deliveries"
  ADD CONSTRAINT "market_alert_deliveries_alertId_fkey"
  FOREIGN KEY ("alertId") REFERENCES "market_saved_alerts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
