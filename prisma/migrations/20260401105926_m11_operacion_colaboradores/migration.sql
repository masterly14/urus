-- CreateEnum
CREATE TYPE "OperacionEstado" AS ENUM ('EN_CURSO', 'RESERVA', 'ARRAS', 'PENDIENTE_FIRMA', 'CERRADA_VENTA', 'CERRADA_ALQUILER', 'CERRADA_TRASPASO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "AsignacionEstado" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "HitoEstado" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'BLOQUEADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "operaciones" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "propertyCode" TEXT NOT NULL,
    "demandId" TEXT,
    "buyerClientId" TEXT,
    "sellerClientId" TEXT,
    "comercialId" TEXT,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "estado" "OperacionEstado" NOT NULL DEFAULT 'EN_CURSO',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaboradores" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL DEFAULT '',
    "especialidad" TEXT NOT NULL DEFAULT '',
    "contactoNombre" TEXT NOT NULL DEFAULT '',
    "contactoEmail" TEXT NOT NULL DEFAULT '',
    "contactoTelefono" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_tipos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_tipos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hito_plantillas" (
    "id" TEXT NOT NULL,
    "colaboradorTipoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hito_plantillas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_sla_configs" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "hitoPlantillaId" TEXT,
    "slaDias" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_sla_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_asignaciones" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "operacionId" TEXT NOT NULL,
    "estado" "AsignacionEstado" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT NOT NULL DEFAULT '',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_asignaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador_hitos" (
    "id" TEXT NOT NULL,
    "asignacionId" TEXT NOT NULL,
    "hitoPlantillaId" TEXT,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" "HitoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "iniciadoAt" TIMESTAMP(3),
    "completadoAt" TIMESTAMP(3),
    "slaDias" INTEGER,
    "slaVenceAt" TIMESTAMP(3),
    "notas" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_hitos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operaciones_codigo_key" ON "operaciones"("codigo");

-- CreateIndex
CREATE INDEX "operaciones_propertyCode_estado_idx" ON "operaciones"("propertyCode", "estado");

-- CreateIndex
CREATE INDEX "operaciones_comercialId_createdAt_idx" ON "operaciones"("comercialId", "createdAt");

-- CreateIndex
CREATE INDEX "operaciones_ciudad_estado_idx" ON "operaciones"("ciudad", "estado");

-- CreateIndex
CREATE INDEX "operaciones_estado_closedAt_idx" ON "operaciones"("estado", "closedAt");

-- CreateIndex
CREATE INDEX "colaboradores_tipo_ciudad_activo_idx" ON "colaboradores"("tipo", "ciudad", "activo");

-- CreateIndex
CREATE INDEX "colaboradores_activo_idx" ON "colaboradores"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_tipos_nombre_key" ON "colaborador_tipos"("nombre");

-- CreateIndex
CREATE INDEX "hito_plantillas_colaboradorTipoId_idx" ON "hito_plantillas"("colaboradorTipoId");

-- CreateIndex
CREATE UNIQUE INDEX "hito_plantillas_colaboradorTipoId_orden_key" ON "hito_plantillas"("colaboradorTipoId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_sla_configs_colaboradorId_hitoPlantillaId_key" ON "colaborador_sla_configs"("colaboradorId", "hitoPlantillaId");

-- CreateIndex
CREATE INDEX "colaborador_asignaciones_operacionId_estado_idx" ON "colaborador_asignaciones"("operacionId", "estado");

-- CreateIndex
CREATE INDEX "colaborador_asignaciones_colaboradorId_estado_idx" ON "colaborador_asignaciones"("colaboradorId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_asignaciones_colaboradorId_operacionId_key" ON "colaborador_asignaciones"("colaboradorId", "operacionId");

-- CreateIndex
CREATE INDEX "colaborador_hitos_asignacionId_orden_idx" ON "colaborador_hitos"("asignacionId", "orden");

-- CreateIndex
CREATE INDEX "colaborador_hitos_estado_slaVenceAt_idx" ON "colaborador_hitos"("estado", "slaVenceAt");

-- AddForeignKey
ALTER TABLE "hito_plantillas" ADD CONSTRAINT "hito_plantillas_colaboradorTipoId_fkey" FOREIGN KEY ("colaboradorTipoId") REFERENCES "colaborador_tipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_sla_configs" ADD CONSTRAINT "colaborador_sla_configs_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_asignaciones" ADD CONSTRAINT "colaborador_asignaciones_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_asignaciones" ADD CONSTRAINT "colaborador_asignaciones_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "operaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador_hitos" ADD CONSTRAINT "colaborador_hitos_asignacionId_fkey" FOREIGN KEY ("asignacionId") REFERENCES "colaborador_asignaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
