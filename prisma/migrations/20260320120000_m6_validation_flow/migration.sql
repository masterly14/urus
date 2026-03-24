-- M6 Item 3: validación microsite, SLA, jobs, teléfono demanda

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SELECCION_VALIDADA';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SELECCION_RECHAZADA';

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'NOTIFY_MICROSITE_PENDING_VALIDATION';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'SEND_MICROSITE_TO_BUYER';

-- demands_current.telefono
ALTER TABLE "demands_current" ADD COLUMN IF NOT EXISTS "telefono" TEXT NOT NULL DEFAULT '';

-- microsite_selections: validación + SLA
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "validationToken" TEXT;
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "buyerPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "validationDueAt" TIMESTAMP(3);
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "validatedByComercialId" TEXT;
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);

-- Backfill validationToken (único por fila)
UPDATE "microsite_selections"
SET "validationToken" = md5(random()::text || id::text || clock_timestamp()::text)
WHERE "validationToken" IS NULL OR "validationToken" = '';

UPDATE "microsite_selections"
SET "validationDueAt" = "createdAt" + interval '2 hours'
WHERE "validationDueAt" IS NULL;

ALTER TABLE "microsite_selections" ALTER COLUMN "validationToken" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "microsite_selections_validationToken_key"
  ON "microsite_selections"("validationToken");

CREATE INDEX IF NOT EXISTS "microsite_selections_status_validationDueAt_idx"
  ON "microsite_selections"("status", "validationDueAt");
