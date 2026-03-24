-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'LEAD_SCORED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'LEAD_CONTACTADO';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'VISITA_EVALUADA';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'VISITA_AGENDADA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'NOTIFY_LEAD_WHATSAPP';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'FOLLOW_UP_LEAD';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'GENERATE_MICROSITE';

-- CreateTable
CREATE TABLE "property_snapshots" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT '',
    "tipoOfer" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metrosConstruidos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitaciones" INTEGER NOT NULL DEFAULT 0,
    "banyos" INTEGER NOT NULL DEFAULT 0,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "zona" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT '',
    "fechaAlta" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "numFotos" INTEGER NOT NULL DEFAULT 0,
    "agente" TEXT NOT NULL DEFAULT '',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_snapshots_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "properties_current" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "titulo" TEXT NOT NULL DEFAULT '',
    "tipoOfer" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metrosConstruidos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitaciones" INTEGER NOT NULL DEFAULT 0,
    "banyos" INTEGER NOT NULL DEFAULT 0,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "zona" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT '',
    "fechaAlta" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "numFotos" INTEGER NOT NULL DEFAULT 0,
    "agente" TEXT NOT NULL DEFAULT '',
    "lastEventId" TEXT NOT NULL,
    "lastEventPosition" BIGINT NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_current_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "demands_current" (
    "codigo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "nombre" TEXT NOT NULL DEFAULT '',
    "estadoId" TEXT NOT NULL DEFAULT '',
    "estadoNombre" TEXT NOT NULL DEFAULT '',
    "presupuestoMin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presupuestoMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "habitacionesMin" INTEGER NOT NULL DEFAULT 0,
    "tipos" TEXT NOT NULL DEFAULT '',
    "zonas" TEXT NOT NULL DEFAULT '',
    "fechaActualizacion" TEXT NOT NULL DEFAULT '',
    "agente" TEXT NOT NULL DEFAULT '',
    "lastEventId" TEXT NOT NULL,
    "lastEventPosition" BIGINT NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demands_current_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "ingestion_cycle_metrics" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "worker" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "itemsRead" INTEGER NOT NULL DEFAULT 0,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "snapshotSize" INTEGER NOT NULL DEFAULT 0,
    "eventsEmitted" INTEGER NOT NULL DEFAULT 0,
    "diffCreated" INTEGER NOT NULL DEFAULT 0,
    "diffModified" INTEGER NOT NULL DEFAULT 0,
    "diffStatusChanged" INTEGER NOT NULL DEFAULT 0,
    "diffUnchanged" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "phases" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_cycle_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comerciales" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "ciudad" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL DEFAULT 'general',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "cargaActual" INTEGER NOT NULL DEFAULT 0,
    "cargaMaxima" INTEGER NOT NULL DEFAULT 20,
    "leadsAsignados" INTEGER NOT NULL DEFAULT 0,
    "leadsCerrados" INTEGER NOT NULL DEFAULT 0,
    "tasaConversion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comerciales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_calidad" (
    "id" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valores" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_calidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_tipo" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_tipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_pais" (
    "id" TEXT NOT NULL,
    "pais" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "iso2" TEXT NOT NULL,
    "iso3" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_pais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_ciudad" (
    "id" TEXT NOT NULL,
    "key_loca" INTEGER NOT NULL,
    "ciudad" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "cod_prov" INTEGER NOT NULL,
    "pais_valor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_ciudad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inmovilla_enum_zona" (
    "id" TEXT NOT NULL,
    "key_zona" INTEGER NOT NULL,
    "key_loca" INTEGER NOT NULL,
    "zona" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inmovilla_enum_zona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_current_estado_idx" ON "properties_current"("estado");

-- CreateIndex
CREATE INDEX "properties_current_ciudad_zona_idx" ON "properties_current"("ciudad", "zona");

-- CreateIndex
CREATE INDEX "properties_current_lastEventPosition_idx" ON "properties_current"("lastEventPosition");

-- CreateIndex
CREATE INDEX "demands_current_estadoId_idx" ON "demands_current"("estadoId");

-- CreateIndex
CREATE INDEX "demands_current_zonas_idx" ON "demands_current"("zonas");

-- CreateIndex
CREATE INDEX "demands_current_lastEventPosition_idx" ON "demands_current"("lastEventPosition");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_cycle_metrics_cycleId_key" ON "ingestion_cycle_metrics"("cycleId");

-- CreateIndex
CREATE INDEX "ingestion_cycle_metrics_worker_startedAt_idx" ON "ingestion_cycle_metrics"("worker", "startedAt");

-- CreateIndex
CREATE INDEX "ingestion_cycle_metrics_success_startedAt_idx" ON "ingestion_cycle_metrics"("success", "startedAt");

-- CreateIndex
CREATE INDEX "comerciales_ciudad_activo_idx" ON "comerciales"("ciudad", "activo");

-- CreateIndex
CREATE INDEX "comerciales_activo_cargaActual_idx" ON "comerciales"("activo", "cargaActual");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_calidad_campo_key" ON "inmovilla_enum_calidad"("campo");

-- CreateIndex
CREATE INDEX "inmovilla_enum_tipo_tipo_valor_idx" ON "inmovilla_enum_tipo"("tipo", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_pais_valor_key" ON "inmovilla_enum_pais"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_ciudad_key_loca_key" ON "inmovilla_enum_ciudad"("key_loca");

-- CreateIndex
CREATE INDEX "inmovilla_enum_ciudad_key_loca_idx" ON "inmovilla_enum_ciudad"("key_loca");

-- CreateIndex
CREATE INDEX "inmovilla_enum_ciudad_ciudad_provincia_idx" ON "inmovilla_enum_ciudad"("ciudad", "provincia");

-- CreateIndex
CREATE INDEX "inmovilla_enum_zona_key_loca_key_zona_idx" ON "inmovilla_enum_zona"("key_loca", "key_zona");

-- CreateIndex
CREATE UNIQUE INDEX "inmovilla_enum_zona_key_loca_key_zona_key" ON "inmovilla_enum_zona"("key_loca", "key_zona");
