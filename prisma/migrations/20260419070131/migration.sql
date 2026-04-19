/*
  Warnings:

  - A unique constraint covering the columns `[inmovillaAgentId]` on the table `comerciales` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NUEVO', 'CONTACTADO', 'EN_SELECCION', 'VISITA_PENDIENTE', 'VISITA_CONFIRMADA', 'VISITA_REALIZADA', 'EN_NEGOCIACION', 'EN_FIRMA', 'CERRADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "NotaEncargoState" AS ENUM ('PENDING', 'RECORDATORIO_ENVIADO', 'CONFIRMADA', 'NO_CONFIRMADA', 'FORMULARIO_ENVIADO', 'FORMULARIO_COMPLETADO', 'FIRMA_ENVIADA', 'FIRMADA', 'DOCUMENTO_ENVIADO', 'PROSPECTO_CREADO', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'DEMANDA_ELIMINADA';
ALTER TYPE "EventType" ADD VALUE 'NOTA_ENCARGO_DETECTADA';
ALTER TYPE "EventType" ADD VALUE 'NOTA_ENCARGO_CONFIRMADA';
ALTER TYPE "EventType" ADD VALUE 'NOTA_ENCARGO_NO_CONFIRMADA';
ALTER TYPE "EventType" ADD VALUE 'NOTA_ENCARGO_FORMULARIO_COMPLETADO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'NOTA_ENCARGO_RECORDATORIO';
ALTER TYPE "JobType" ADD VALUE 'NOTA_ENCARGO_CHECK_CONFIRMACION';
ALTER TYPE "JobType" ADD VALUE 'NOTA_ENCARGO_ENVIAR_FORMULARIO';
ALTER TYPE "JobType" ADD VALUE 'CREAR_PROSPECTO_INMOVILLA';

-- AlterTable
ALTER TABLE "comerciales" ADD COLUMN     "inmovillaAgentId" INTEGER,
ADD COLUMN     "inmovillaRefCode" TEXT;

-- AlterTable
ALTER TABLE "demands_current" ADD COLUMN     "comercialId" TEXT,
ADD COLUMN     "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NUEVO';

-- AlterTable
ALTER TABLE "invitation" ADD COLUMN     "comercialId" TEXT,
ADD COLUMN     "refCode" TEXT;

-- AlterTable
ALTER TABLE "properties_current" ADD COLUMN     "comercialId" TEXT;

-- CreateTable
CREATE TABLE "task_snapshots" (
    "id" TEXT NOT NULL,
    "inmovillaTaskId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "asunto" TEXT NOT NULL DEFAULT '',
    "observaciones" TEXT NOT NULL DEFAULT '',
    "agenteId" TEXT NOT NULL,
    "fechaAgendar" TIMESTAMP(3) NOT NULL,
    "fechaCreacion" TIMESTAMP(3) NOT NULL,
    "etiqueta" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nota_encargo_sessions" (
    "id" TEXT NOT NULL,
    "taskSnapshotId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "propertyRef" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "propietarioPhone" TEXT NOT NULL,
    "visitDateTime" TIMESTAMP(3) NOT NULL,
    "state" "NotaEncargoState" NOT NULL DEFAULT 'PENDING',
    "direccion" TEXT NOT NULL DEFAULT '',
    "tipoOperacion" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "propietarioNombre" TEXT,
    "propietarioDni" TEXT,
    "propietarioTelefono" TEXT,
    "domicilioFiscal" TEXT,
    "duracionMeses" INTEGER,
    "tipoNotaEncargo" TEXT,
    "aceptaLopd" BOOLEAN,
    "legalDocumentId" TEXT,
    "signatureRequestId" TEXT,
    "documentUrl" TEXT,
    "signedDocumentUrl" TEXT,
    "inmovillaCodOfer" INTEGER,
    "refCatastral" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nota_encargo_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_snapshots_inmovillaTaskId_key" ON "task_snapshots"("inmovillaTaskId");

-- CreateIndex
CREATE INDEX "task_snapshots_tipo_idx" ON "task_snapshots"("tipo");

-- CreateIndex
CREATE INDEX "task_snapshots_agenteId_idx" ON "task_snapshots"("agenteId");

-- CreateIndex
CREATE UNIQUE INDEX "nota_encargo_sessions_taskSnapshotId_key" ON "nota_encargo_sessions"("taskSnapshotId");

-- CreateIndex
CREATE INDEX "nota_encargo_sessions_state_idx" ON "nota_encargo_sessions"("state");

-- CreateIndex
CREATE INDEX "nota_encargo_sessions_propertyCode_idx" ON "nota_encargo_sessions"("propertyCode");

-- CreateIndex
CREATE INDEX "nota_encargo_sessions_propietarioPhone_state_idx" ON "nota_encargo_sessions"("propietarioPhone", "state");

-- CreateIndex
CREATE UNIQUE INDEX "comerciales_inmovillaAgentId_key" ON "comerciales"("inmovillaAgentId");

-- CreateIndex
CREATE INDEX "demands_current_comercialId_idx" ON "demands_current"("comercialId");

-- CreateIndex
CREATE INDEX "demands_current_leadStatus_idx" ON "demands_current"("leadStatus");

-- CreateIndex
CREATE INDEX "events_type_aggregateType_aggregateId_idx" ON "events"("type", "aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "invitation_comercialId_idx" ON "invitation"("comercialId");

-- CreateIndex
CREATE INDEX "properties_current_comercialId_idx" ON "properties_current"("comercialId");

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_comercialId_fkey" FOREIGN KEY ("comercialId") REFERENCES "comerciales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
