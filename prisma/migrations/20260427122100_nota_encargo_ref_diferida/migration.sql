-- Nota de Encargo por referencia futura: permite crear sesiones antes de que
-- la propiedad exista en Inmovilla y vincularlas cuando aparezca en ingesta.

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'NOTA_ENCARGO_VINCULADA_A_PROPIEDAD';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'NOTA_ENCARGO_PROPIETARIO_REGISTRADO';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'NOTA_ENCARGO_SIN_PROPIEDAD_DEADLINE';

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'NOTA_ENCARGO_MATCHING_CHECK';

ALTER TYPE "NotaEncargoState" ADD VALUE IF NOT EXISTS 'PENDIENTE_PROPIEDAD';

ALTER TABLE "properties_current"
  ADD COLUMN IF NOT EXISTS "propietarioNombre" TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioDni" TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioDomicilioFiscal" TEXT,
  ADD COLUMN IF NOT EXISTS "propietarioRegisteredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notaEncargoSessionId" TEXT;

ALTER TABLE "nota_encargo_sessions"
  ALTER COLUMN "propertyCode" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "properties_current_notaEncargoSessionId_idx"
  ON "properties_current"("notaEncargoSessionId");

CREATE INDEX IF NOT EXISTS "nota_encargo_sessions_propertyRef_idx"
  ON "nota_encargo_sessions"("propertyRef");
