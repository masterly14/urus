-- Editor de cláusulas adicionales por contrato (TipTap JSON subset controlado).
-- Nullable: documentos existentes no tienen cláusulas y no se ven afectados.
-- La edición está restringida a status = DRAFT (regla aplicada en la API).

ALTER TABLE "legal_documents"
  ADD COLUMN IF NOT EXISTS "additionalClausesDoc" JSONB,
  ADD COLUMN IF NOT EXISTS "additionalClausesUpdatedAt" TIMESTAMP(3);

-- Nuevo evento para trazar cambios del editor de cláusulas (event sourcing).
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'CONTRATO_CLAUSULAS_ADICIONALES_EDITADAS';
