-- Nuevo JobType para el cruce automatico de una demanda contra la cartera
-- interna al entrar DEMANDA_CREADA o DEMANDA_MODIFICADA con criterios duros.
-- Espeja la idempotencia del rebuild manual (|Δscore|<5) pero se dispara
-- desde el lado-demanda en lugar de requerir intervencion del CEO/Admin.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'MATCH_DEMAND_AGAINST_INTERNAL'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'MATCH_DEMAND_AGAINST_INTERNAL';
    END IF;
END
$$;
