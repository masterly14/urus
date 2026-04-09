-- CreateTable
CREATE TABLE "observability_logs" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "requestId" TEXT,
    "correlationId" TEXT,
    "workerId" TEXT,
    "workerName" TEXT,
    "jobId" TEXT,
    "jobType" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "route" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "errorStack" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "observability_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_metrics" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "throughputCount" INTEGER NOT NULL DEFAULT 1,
    "statusCode" INTEGER,
    "requestId" TEXT,
    "correlationId" TEXT,
    "workerId" TEXT,
    "workerName" TEXT,
    "jobId" TEXT,
    "jobType" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "route" TEXT,
    "method" TEXT,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "execution_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "observability_logs_scope_createdAt_idx" ON "observability_logs"("scope", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_source_createdAt_idx" ON "observability_logs"("source", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_level_createdAt_idx" ON "observability_logs"("level", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_operation_createdAt_idx" ON "observability_logs"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_requestId_idx" ON "observability_logs"("requestId");

-- CreateIndex
CREATE INDEX "observability_logs_correlationId_idx" ON "observability_logs"("correlationId");

-- CreateIndex
CREATE INDEX "observability_logs_workerId_createdAt_idx" ON "observability_logs"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_jobId_createdAt_idx" ON "observability_logs"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "observability_logs_eventId_createdAt_idx" ON "observability_logs"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "execution_metrics_scope_startedAt_idx" ON "execution_metrics"("scope", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_source_startedAt_idx" ON "execution_metrics"("source", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_name_startedAt_idx" ON "execution_metrics"("name", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_operation_startedAt_idx" ON "execution_metrics"("operation", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_success_startedAt_idx" ON "execution_metrics"("success", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_requestId_idx" ON "execution_metrics"("requestId");

-- CreateIndex
CREATE INDEX "execution_metrics_correlationId_idx" ON "execution_metrics"("correlationId");

-- CreateIndex
CREATE INDEX "execution_metrics_workerId_startedAt_idx" ON "execution_metrics"("workerId", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_jobId_startedAt_idx" ON "execution_metrics"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "execution_metrics_eventId_startedAt_idx" ON "execution_metrics"("eventId", "startedAt");
