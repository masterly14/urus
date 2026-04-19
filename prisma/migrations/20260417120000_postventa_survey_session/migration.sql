-- Idempotente para entornos donde parte del cambio ya fue aplicado.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        WHERE t.typname = 'PostventaSurveyStatus'
    ) THEN
        CREATE TYPE "PostventaSurveyStatus" AS ENUM ('PENDING', 'SENT', 'COMPLETED', 'EXPIRED');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'EventType'
          AND e.enumlabel = 'POSTVENTA_FORMULARIO_ENVIADO'
    ) THEN
        ALTER TYPE "EventType" ADD VALUE 'POSTVENTA_FORMULARIO_ENVIADO';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'EventType'
          AND e.enumlabel = 'POSTVENTA_FORMULARIO_COMPLETADO'
    ) THEN
        ALTER TYPE "EventType" ADD VALUE 'POSTVENTA_FORMULARIO_COMPLETADO';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'SEND_POSTVENTA_FORM'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'SEND_POSTVENTA_FORM';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'SCHEDULE_POSTVENTA_BIRTHDAY'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'SCHEDULE_POSTVENTA_BIRTHDAY';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = 'SCHEDULE_POSTVENTA_NAVIDAD'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'SCHEDULE_POSTVENTA_NAVIDAD';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "postventa_survey_sessions" (
    "id" TEXT NOT NULL,
    "operacionId" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "status" "PostventaSurveyStatus" NOT NULL DEFAULT 'PENDING',
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "birthDate" TIMESTAMP(3),
    "birthDateRaw" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postventa_survey_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "postventa_survey_sessions_operacionId_key" ON "postventa_survey_sessions"("operacionId");

CREATE INDEX IF NOT EXISTS "postventa_survey_sessions_buyerPhone_status_idx" ON "postventa_survey_sessions"("buyerPhone", "status");

CREATE INDEX IF NOT EXISTS "postventa_survey_sessions_propertyCode_idx" ON "postventa_survey_sessions"("propertyCode");

CREATE INDEX IF NOT EXISTS "postventa_survey_sessions_status_idx" ON "postventa_survey_sessions"("status");
