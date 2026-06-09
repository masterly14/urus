-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'NOTA_ENCARGO_REPROGRAMADA';

-- AlterTable
ALTER TABLE "nota_encargo_sessions" ADD COLUMN "scheduleGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "nota_encargo_sessions" ADD COLUMN "formularioQstashMessageId" TEXT;
ALTER TABLE "nota_encargo_sessions" ADD COLUMN "matchingCheckQstashMessageId" TEXT;
