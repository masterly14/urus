-- Refactor Nota de Encargo: remove Inmovilla task ingestion trigger and prospecto creation.
-- The flow is now triggered from the platform UI, not from Inmovilla task polling.

-- AlterEnum: remove CREAR_PROSPECTO_INMOVILLA from JobType
BEGIN;
-- Remap legacy jobs so enum cast does not fail.
UPDATE "job_queue"
SET "type" = 'NOTA_ENCARGO_ENVIAR_FORMULARIO'
WHERE "type" = 'CREAR_PROSPECTO_INMOVILLA';
CREATE TYPE "JobType_new" AS ENUM ('PROCESS_EVENT', 'UPDATE_PROPERTY_PROJECTION', 'UPDATE_DEMAND_PROJECTION', 'WRITE_TO_INMOVILLA', 'NOTIFY_LEAD_WHATSAPP', 'FOLLOW_UP_LEAD', 'GENERATE_MICROSITE', 'NOTIFY_MICROSITE_PENDING_VALIDATION', 'SEND_MICROSITE_TO_BUYER', 'NOTIFY_CONTRACT_DATA_INCOMPLETE', 'GENERATE_CONTRACT_DRAFT', 'SEND_SIGNATURE_REQUEST', 'PROCESS_SIGNATURE_WEBHOOK', 'NOTIFY_SIGNATURE_REMINDER', 'RUN_PRICING_ANALYSIS', 'NOTIFY_PRICING_WHATSAPP', 'START_POSTVENTA_CADENCE', 'SEND_POSTVENTA_MESSAGE', 'SEND_POSTVENTA_FORM', 'SCHEDULE_POSTVENTA_BIRTHDAY', 'SCHEDULE_POSTVENTA_NAVIDAD', 'SEND_POST_SALE_MESSAGE', 'SEND_REVIEW_REQUEST', 'SEND_REFERRAL_REQUEST', 'SEND_REVIEW_REMINDER', 'SEND_DEV_EXERCISE_NUDGE', 'VISIT_FETCH_SLOTS', 'VISIT_PROPOSE_TO_COMMERCIAL', 'VISIT_PROPOSE_TO_BUYER', 'VISIT_CHECK_COMMERCIAL_TIMEOUT', 'VISIT_CHECK_BUYER_TIMEOUT', 'VISIT_CREATE_CALENDAR_EVENT', 'VISIT_CANCEL_CALENDAR_EVENT', 'VISIT_CLEANUP_EXPIRED_LOCKS', 'VISIT_CHECK_COMPOSIO_HEALTH', 'NOTA_ENCARGO_RECORDATORIO', 'NOTA_ENCARGO_CHECK_CONFIRMACION', 'NOTA_ENCARGO_ENVIAR_FORMULARIO', 'PARTE_VISITA_ENVIAR_FORMULARIO', 'AUTO_VALIDATE_MICROSITE', 'SEND_WHATSAPP_MATCH', 'EVALUATE_DEMAND_COVERAGE', 'REBUILD_MATCHES_FOR_DEMAND');
ALTER TABLE "job_queue" ALTER COLUMN "type" TYPE "JobType_new" USING ("type"::text::"JobType_new");
ALTER TYPE "JobType" RENAME TO "JobType_old";
ALTER TYPE "JobType_new" RENAME TO "JobType";
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT
            quote_ident(n.nspname) AS schema_name,
            quote_ident(c.relname) AS table_name,
            quote_ident(a.attname) AS column_name
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE t.typname = 'JobType_old'
          AND a.attnum > 0
          AND NOT a.attisdropped
    LOOP
        EXECUTE format(
            'ALTER TABLE %s.%s ALTER COLUMN %s TYPE "JobType" USING (%s::text::"JobType")',
            rec.schema_name,
            rec.table_name,
            rec.column_name,
            rec.column_name
        );
    END LOOP;
END $$;
DROP TYPE "public"."JobType_old";
COMMIT;

-- AlterEnum: remove PROSPECTO_CREADO from NotaEncargoState
BEGIN;
-- Remap legacy sessions so enum cast does not fail.
UPDATE "nota_encargo_sessions"
SET "state" = 'CONFIRMADA'
WHERE "state" = 'PROSPECTO_CREADO';
CREATE TYPE "NotaEncargoState_new" AS ENUM ('PENDING', 'RECORDATORIO_ENVIADO', 'CONFIRMADA', 'NO_CONFIRMADA', 'FORMULARIO_ENVIADO', 'FORMULARIO_COMPLETADO', 'FIRMA_ENVIADA', 'FIRMADA', 'DOCUMENTO_ENVIADO', 'CANCELADA');
ALTER TABLE "public"."nota_encargo_sessions" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "nota_encargo_sessions" ALTER COLUMN "state" TYPE "NotaEncargoState_new" USING ("state"::text::"NotaEncargoState_new");
ALTER TYPE "NotaEncargoState" RENAME TO "NotaEncargoState_old";
ALTER TYPE "NotaEncargoState_new" RENAME TO "NotaEncargoState";
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT
            quote_ident(n.nspname) AS schema_name,
            quote_ident(c.relname) AS table_name,
            quote_ident(a.attname) AS column_name
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        WHERE t.typname = 'NotaEncargoState_old'
          AND a.attnum > 0
          AND NOT a.attisdropped
    LOOP
        EXECUTE format(
            'ALTER TABLE %s.%s ALTER COLUMN %s TYPE "NotaEncargoState" USING (%s::text::"NotaEncargoState")',
            rec.schema_name,
            rec.table_name,
            rec.column_name,
            rec.column_name
        );
    END LOOP;
END $$;
DROP TYPE "public"."NotaEncargoState_old";
ALTER TABLE "nota_encargo_sessions" ALTER COLUMN "state" SET DEFAULT 'PENDING';
COMMIT;

-- DropIndex
DROP INDEX IF EXISTS "nota_encargo_sessions_taskSnapshotId_key";

-- AlterTable: remove obsolete columns from nota_encargo_sessions
ALTER TABLE "nota_encargo_sessions" DROP COLUMN IF EXISTS "inmovillaCodOfer",
DROP COLUMN IF EXISTS "taskSnapshotId";

-- DropTable
DROP TABLE IF EXISTS "task_snapshots";
