-- Section addendums: bloques añadidos por el comercial dentro de secciones
-- concretas del contrato (ej. ampliar "INMUEBLE" con datos registrales extra,
-- anejos, cargas conocidas). Estructurados (array JSON con sectionId/type/
-- contentDoc). Nullable: contratos existentes no se ven afectados.
-- La edición está restringida a status = DRAFT (regla aplicada en la API).

ALTER TABLE "legal_documents"
  ADD COLUMN IF NOT EXISTS "sectionAddendums" JSONB,
  ADD COLUMN IF NOT EXISTS "sectionAddendumsUpdatedAt" TIMESTAMP(3);

-- Nuevo evento para trazar ampliaciones por sección (event sourcing).
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CONTRATO_SECCION_AMPLIADA';
