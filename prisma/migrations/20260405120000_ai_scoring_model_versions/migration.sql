-- CreateTable
CREATE TABLE "scoring_model_versions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weightPclose" DOUBLE PRECISION NOT NULL,
    "weightValue" DOUBLE PRECISION NOT NULL,
    "weightUrgency" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "backtestScore" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scoring_model_versions_version_key" ON "scoring_model_versions"("version");

-- CreateIndex
CREATE INDEX "scoring_model_versions_activatedAt_idx" ON "scoring_model_versions"("activatedAt");

-- AlterTable: add AI scoring traceability fields to CommercialLeadFact
ALTER TABLE "commercial_lead_facts" ADD COLUMN "scoringModelVersion" INTEGER;
ALTER TABLE "commercial_lead_facts" ADD COLUMN "aiScoringUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "commercial_lead_facts" ADD COLUMN "aiConfidence" DOUBLE PRECISION;
