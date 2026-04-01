-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('SENT', 'OPENED', 'SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELED', 'ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'FIRMA_ENVIADA';
ALTER TYPE "EventType" ADD VALUE 'FIRMA_COMPLETADA';
ALTER TYPE "EventType" ADD VALUE 'FIRMA_RECHAZADA';
ALTER TYPE "EventType" ADD VALUE 'FIRMA_EXPIRADA';
ALTER TYPE "EventType" ADD VALUE 'FIRMA_RECORDATORIO_ENVIADO';
ALTER TYPE "EventType" ADD VALUE 'FIRMA_SLA_ESCALADO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'SEND_SIGNATURE_REQUEST';
ALTER TYPE "JobType" ADD VALUE 'PROCESS_SIGNATURE_WEBHOOK';
ALTER TYPE "JobType" ADD VALUE 'NOTIFY_SIGNATURE_REMINDER';

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "signaturitSignatureId" TEXT NOT NULL,
    "signaturitDocumentId" TEXT,
    "operationId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "templateVersion" TEXT,
    "cloudinaryUrl" TEXT NOT NULL,
    "signingUrl" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'SENT',
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signerPhone" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "slaDeadlineDays" INTEGER NOT NULL DEFAULT 5,
    "slaDeadline" TIMESTAMP(3) NOT NULL,
    "lastReminderDay" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "signedDocumentUrl" TEXT,
    "auditTrailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_signaturitSignatureId_key" ON "signature_requests"("signaturitSignatureId");

-- CreateIndex
CREATE INDEX "signature_requests_status_slaDeadline_idx" ON "signature_requests"("status", "slaDeadline");

-- CreateIndex
CREATE INDEX "signature_requests_operationId_idx" ON "signature_requests"("operationId");
