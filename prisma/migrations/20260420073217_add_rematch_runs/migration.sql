-- CreateEnum
CREATE TYPE "RematchRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'REBUILD_MATCHES_FOR_DEMAND';

-- CreateTable
CREATE TABLE "rematch_runs" (
    "id" TEXT NOT NULL,
    "status" "RematchRunStatus" NOT NULL DEFAULT 'RUNNING',
    "demandIdsList" JSONB NOT NULL DEFAULT '[]',
    "totalDemands" INTEGER NOT NULL,
    "totalBatches" INTEGER NOT NULL,
    "currentBatch" INTEGER NOT NULL DEFAULT 0,
    "demandsProcessed" INTEGER NOT NULL DEFAULT 0,
    "matchesEmitted" INTEGER NOT NULL DEFAULT 0,
    "matchesSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "triggeredByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rematch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rematch_runs_status_startedAt_idx" ON "rematch_runs"("status", "startedAt");
