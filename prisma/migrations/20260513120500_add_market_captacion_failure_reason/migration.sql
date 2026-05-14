-- ============================================================================
-- Kanban de captacion: razon manual cuando el comercial mueve a FAILED.
--
-- `captacionLastError` ya existe y se reserva para errores tecnicos del
-- pipeline (p. ej. "Falta key_loca para crear prospecto"). El nuevo campo
-- captura la razon que pone explicitamente el comercial al descartar una
-- oportunidad desde la vista kanban (p. ej. "publicante no responde",
-- "fuera de zona objetivo").
--
-- Mantenerlos separados permite distinguir "fallo del sistema reintentable"
-- de "decision humana definitiva" sin perder informacion.
-- ============================================================================

ALTER TABLE "market_listings"
  ADD COLUMN "captacionFailureReason" TEXT;
