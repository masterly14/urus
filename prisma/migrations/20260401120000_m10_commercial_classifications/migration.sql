-- CreateTable
CREATE TABLE "commercial_classifications" (
    "id" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "rangeFrom" TIMESTAMP(3) NOT NULL,
    "rangeTo" TIMESTAMP(3) NOT NULL,
    "profile" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profileScores" JSONB NOT NULL,
    "metricsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_classifications_comercialId_createdAt_idx" ON "commercial_classifications"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "commercial_classifications_rangeFrom_rangeTo_idx" ON "commercial_classifications"("rangeFrom", "rangeTo");
