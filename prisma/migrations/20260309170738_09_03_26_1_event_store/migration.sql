-- CreateEnum
CREATE TYPE "AggregateType" AS ENUM ('PROPERTY', 'LEAD', 'DEMAND', 'MATCH', 'SLA', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PROPIEDAD_CREADA', 'PROPIEDAD_MODIFICADA', 'ESTADO_CAMBIADO', 'LEAD_INGESTADO', 'SLA_INICIADO', 'DEMANDA_ACTUALIZADA', 'MATCH_GENERADO');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('PROCESS_EVENT', 'UPDATE_PROPERTY_PROJECTION', 'UPDATE_DEMAND_PROJECTION', 'WRITE_TO_INMOVILLA');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "ProjectionName" AS ENUM ('PROPERTIES_CURRENT', 'DEMANDS_CURRENT');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "position" BIGSERIAL NOT NULL,
    "type" "EventType" NOT NULL,
    "aggregateType" "AggregateType" NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "correlationId" TEXT,
    "causationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projections_checkpoint" (
    "projectionName" "ProjectionName" NOT NULL,
    "lastEventId" TEXT,
    "lastEventPosition" BIGINT,
    "lastProcessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projections_checkpoint_pkey" PRIMARY KEY ("projectionName")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_position_key" ON "events"("position");

-- CreateIndex
CREATE INDEX "events_aggregateType_aggregateId_position_idx" ON "events"("aggregateType", "aggregateId", "position");

-- CreateIndex
CREATE INDEX "events_type_position_idx" ON "events"("type", "position");

-- CreateIndex
CREATE INDEX "events_occurredAt_idx" ON "events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_queue_idempotencyKey_key" ON "job_queue"("idempotencyKey");

-- CreateIndex
CREATE INDEX "job_queue_status_availableAt_priority_idx" ON "job_queue"("status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "job_queue_type_status_idx" ON "job_queue"("type", "status");

-- CreateIndex
CREATE INDEX "job_queue_sourceEventId_idx" ON "job_queue"("sourceEventId");

-- AddForeignKey
ALTER TABLE "job_queue" ADD CONSTRAINT "job_queue_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
