-- M7 · Informe IA de Mercado
--
-- Añade AggregateType.MARKET y EventType.MARKET_INFORME_GENERADO al Event
-- Store y crea la tabla market_reports para persistir el output estructurado
-- del grafo LangGraph que genera el informe estratégico sobre el mercado.

ALTER TYPE "AggregateType" ADD VALUE IF NOT EXISTS 'MARKET';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'MARKET_INFORME_GENERADO';

CREATE TABLE IF NOT EXISTS "market_reports" (
    "id" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "tokensUsed" INTEGER,
    "lastEventId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "market_reports_ciudad_generatedAt_idx"
    ON "market_reports"("ciudad", "generatedAt");
CREATE INDEX IF NOT EXISTS "market_reports_generatedBy_generatedAt_idx"
    ON "market_reports"("generatedBy", "generatedAt");
