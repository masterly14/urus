-- CreateTable
CREATE TABLE "dashboard_alerts" (
    "id" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "comercialNombre" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "currentValue" DOUBLE PRECISION,
    "baselineValue" DOUBLE PRECISION,
    "threshold" DOUBLE PRECISION,
    "details" JSONB NOT NULL DEFAULT '{}',
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_alerts_comercialId_createdAt_idx" ON "dashboard_alerts"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "dashboard_alerts_type_severity_idx" ON "dashboard_alerts"("type", "severity");

-- CreateIndex
CREATE INDEX "dashboard_alerts_resolvedAt_createdAt_idx" ON "dashboard_alerts"("resolvedAt", "createdAt");
