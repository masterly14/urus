-- Flujo de sincronización manual asistida tras eliminación/transferencia de comercial.
-- Crea tipos y tabla para tareas obligatorias de sync en Inmovilla.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManualSyncTaskType') THEN
    CREATE TYPE "ManualSyncTaskType" AS ENUM ('PROPERTY', 'DEMAND');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManualSyncTaskStatus') THEN
    CREATE TYPE "ManualSyncTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManualSyncTaskSource') THEN
    CREATE TYPE "ManualSyncTaskSource" AS ENUM ('COMERCIAL_DELETE_TRANSFER');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "manual_sync_tasks" (
  "id"                     TEXT                  NOT NULL,
  "type"                   "ManualSyncTaskType"  NOT NULL,
  "recordCode"             TEXT                  NOT NULL,
  "recordRef"              TEXT,
  "targetComercialId"      TEXT                  NOT NULL,
  "targetComercialName"    TEXT                  NOT NULL,
  "targetInmovillaAgentId" INTEGER,
  "status"                 "ManualSyncTaskStatus" NOT NULL DEFAULT 'PENDING',
  "createdByUserId"        TEXT                  NOT NULL,
  "doneByUserId"           TEXT,
  "doneAt"                 TIMESTAMP(3),
  "note"                   TEXT                  NOT NULL DEFAULT '',
  "source"                 "ManualSyncTaskSource" NOT NULL,
  "sourceUserId"           TEXT                  NOT NULL,
  "createdAt"              TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)          NOT NULL,

  CONSTRAINT "manual_sync_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "manual_sync_tasks_type_recordCode_targetComercialId_sourceUserI_key"
  ON "manual_sync_tasks"("type", "recordCode", "targetComercialId", "sourceUserId", "source");

CREATE INDEX IF NOT EXISTS "manual_sync_tasks_status_idx"
  ON "manual_sync_tasks"("status");

CREATE INDEX IF NOT EXISTS "manual_sync_tasks_targetComercialId_idx"
  ON "manual_sync_tasks"("targetComercialId");

CREATE INDEX IF NOT EXISTS "manual_sync_tasks_createdAt_idx"
  ON "manual_sync_tasks"("createdAt");

CREATE INDEX IF NOT EXISTS "manual_sync_tasks_sourceUserId_idx"
  ON "manual_sync_tasks"("sourceUserId");
