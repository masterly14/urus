-- ============================================================================
-- Identity review: marca eventos MARKET_PROPERTY_REVIEW_REQUIRED como resueltos.
--
-- El handler MARKET_RESOLVE_IDENTITY emite MARKET_PROPERTY_REVIEW_REQUIRED
-- cuando el score de similitud cae en [0.70, 0.90). Hasta ahora estos eventos
-- quedaban sin estado terminal; la nueva ruta /platform/market/identity/review
-- permite a un admin marcarlos como merge / split / ignore. Persistimos quien
-- y cuando los resolvio para auditoria.
--
-- Aditivo y nullable: no rompe inserts/lecturas existentes.
-- ============================================================================

ALTER TABLE "market_events"
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolvedBy" TEXT,
  ADD COLUMN "resolutionAction" TEXT;

-- Indice para filtrar candidatos pendientes de revision sin escanear toda la
-- tabla. La cardinalidad real esperada es baja (<<1% de eventos), asi que
-- cubrimos el caso comun (status NULL) que es el que la UI consultara.
CREATE INDEX "market_events_review_pending_idx"
  ON "market_events"("type", "occurredAt")
  WHERE "resolvedAt" IS NULL;
