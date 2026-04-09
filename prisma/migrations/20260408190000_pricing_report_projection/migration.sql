CREATE TABLE "pricing_reports" (
    "propertyCode" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "sourceTrigger" TEXT NOT NULL DEFAULT 'manual',
    "semaforo" TEXT NOT NULL DEFAULT 'sin_datos',
    "gapPorcentaje" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalComparables" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "comparables" JSONB NOT NULL,
    "recommendation" JSONB,
    "recommendationError" TEXT,
    "trend" JSONB,
    "queryMeta" JSONB NOT NULL,
    "lastAnalysisEventId" TEXT,
    "lastRecommendationEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_reports_pkey" PRIMARY KEY ("propertyCode")
);

CREATE INDEX "pricing_reports_analyzedAt_idx" ON "pricing_reports"("analyzedAt");
CREATE INDEX "pricing_reports_sourceTrigger_analyzedAt_idx" ON "pricing_reports"("sourceTrigger", "analyzedAt");
CREATE INDEX "pricing_reports_semaforo_analyzedAt_idx" ON "pricing_reports"("semaforo", "analyzedAt");
