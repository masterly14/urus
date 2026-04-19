-- Añadir campo autoValidateMicrosite al comercial
ALTER TABLE "comerciales" ADD COLUMN "autoValidateMicrosite" BOOLEAN NOT NULL DEFAULT false;

-- Nuevo tipo de job para auto-validación con IA
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'AUTO_VALIDATE_MICROSITE';
