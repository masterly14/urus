-- CreateEnum
CREATE TYPE "ParteVisitaState" AS ENUM ('PENDING', 'FORMULARIO_ENVIADO', 'FORMULARIO_COMPLETADO', 'FIRMA_ENVIADA', 'FIRMADA', 'DOCUMENTO_ENVIADO', 'CANCELADA');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'PARTE_VISITA_FORMULARIO_COMPLETADO';

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'PARTE_VISITA_ENVIAR_FORMULARIO';

-- CreateTable
CREATE TABLE "parte_visita_sessions" (
    "id" TEXT NOT NULL,
    "visitSessionId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "propertyRef" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "visitDateTime" TIMESTAMP(3) NOT NULL,
    "state" "ParteVisitaState" NOT NULL DEFAULT 'PENDING',
    "direccion" TEXT NOT NULL DEFAULT '',
    "tipoOperacion" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buyerNombre" TEXT,
    "buyerDni" TEXT,
    "buyerTelefono" TEXT,
    "aceptaLopd" BOOLEAN,
    "legalDocumentId" TEXT,
    "signatureRequestId" TEXT,
    "documentUrl" TEXT,
    "signedDocumentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parte_visita_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parte_visita_sessions_visitSessionId_key" ON "parte_visita_sessions"("visitSessionId");

-- CreateIndex
CREATE INDEX "parte_visita_sessions_state_idx" ON "parte_visita_sessions"("state");

-- CreateIndex
CREATE INDEX "parte_visita_sessions_propertyCode_idx" ON "parte_visita_sessions"("propertyCode");

-- CreateIndex
CREATE INDEX "parte_visita_sessions_buyerPhone_state_idx" ON "parte_visita_sessions"("buyerPhone", "state");
