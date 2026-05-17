-- Nuevo JobType para el primer contacto NLU disparado tras DEMANDA_CREADA o
-- tras DEMANDA_MODIFICADA cuando aparece un telefono. Mueve el envio del NLU
-- inicial del handler in-line a un job dedicado con idempotencia por demanda.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'START_NLU_INITIAL_CONTACT'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'START_NLU_INITIAL_CONTACT';
    END IF;
END
$$;
