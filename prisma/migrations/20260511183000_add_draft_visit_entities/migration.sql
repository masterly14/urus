-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'DEMANDA_PROVISIONAL_CREADA';
ALTER TYPE "EventType" ADD VALUE 'PROPIEDAD_PROVISIONAL_CREADA';
ALTER TYPE "EventType" ADD VALUE 'DEMANDA_PROVISIONAL_PROMOVIDA';
ALTER TYPE "EventType" ADD VALUE 'PROPIEDAD_PROVISIONAL_PROMOVIDA';
ALTER TYPE "EventType" ADD VALUE 'DEMANDA_PROVISIONAL_PROMOCION_FALLIDA';
ALTER TYPE "EventType" ADD VALUE 'PROPIEDAD_PROVISIONAL_PROMOCION_FALLIDA';

-- CreateEnum
CREATE TYPE "DraftDemandStatus" AS ENUM ('OPEN', 'PROMOTING', 'PROMOTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DraftPropertyStatus" AS ENUM ('OPEN', 'PROMOTING', 'PROMOTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "draft_demands" (
    "id" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerName" TEXT,
    "comercialId" TEXT NOT NULL,
    "demandPropertyTypes" TEXT NOT NULL DEFAULT '2799',
    "budgetMax" INTEGER NOT NULL DEFAULT 9999999,
    "status" "DraftDemandStatus" NOT NULL DEFAULT 'OPEN',
    "inmovillaClientId" TEXT,
    "inmovillaDemandId" TEXT,
    "promotedAt" TIMESTAMP(3),
    "promotionAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastPromotionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "draft_demands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_properties" (
    "id" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "cadastralRef" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "keyTipo" INTEGER,
    "keyLoca" INTEGER,
    "operationType" TEXT NOT NULL DEFAULT 'VENTA',
    "status" "DraftPropertyStatus" NOT NULL DEFAULT 'OPEN',
    "inmovillaPropertyCode" TEXT,
    "propertyRef" TEXT,
    "promotedAt" TIMESTAMP(3),
    "promotionAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastPromotionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "draft_properties_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "visit_scheduling_sessions"
ADD COLUMN "draftDemandId" TEXT,
ADD COLUMN "draftPropertyId" TEXT,
ALTER COLUMN "demandId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "visit_work_items"
ADD COLUMN "draftDemandId" TEXT,
ADD COLUMN "draftPropertyId" TEXT,
ALTER COLUMN "demandId" SET DEFAULT '',
ALTER COLUMN "propertyId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "parte_visita_sessions"
ADD COLUMN "draftDemandId" TEXT;

-- AlterTable
ALTER TABLE "nota_encargo_sessions"
ADD COLUMN "draftPropertyId" TEXT;

-- DropIndex
DROP INDEX "visit_work_items_demandId_selectionId_propertyId_key";

-- CreateIndex
CREATE UNIQUE INDEX "draft_demands_inmovillaDemandId_key" ON "draft_demands"("inmovillaDemandId");

-- CreateIndex
CREATE INDEX "draft_demands_buyerPhone_idx" ON "draft_demands"("buyerPhone");

-- CreateIndex
CREATE INDEX "draft_demands_comercialId_status_idx" ON "draft_demands"("comercialId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "draft_properties_inmovillaPropertyCode_key" ON "draft_properties"("inmovillaPropertyCode");

-- CreateIndex
CREATE INDEX "draft_properties_cadastralRef_idx" ON "draft_properties"("cadastralRef");

-- CreateIndex
CREATE INDEX "draft_properties_ownerPhone_idx" ON "draft_properties"("ownerPhone");

-- CreateIndex
CREATE INDEX "draft_properties_comercialId_status_idx" ON "draft_properties"("comercialId", "status");

-- CreateIndex
CREATE INDEX "visit_scheduling_sessions_draftDemandId_idx" ON "visit_scheduling_sessions"("draftDemandId");

-- CreateIndex
CREATE INDEX "visit_scheduling_sessions_draftPropertyId_idx" ON "visit_scheduling_sessions"("draftPropertyId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_work_items_demandId_draftDemandId_selectionId_propertyId_d_key"
ON "visit_work_items"("demandId", "draftDemandId", "selectionId", "propertyId", "draftPropertyId");

-- CreateIndex
CREATE INDEX "visit_work_items_draftDemandId_idx" ON "visit_work_items"("draftDemandId");

-- CreateIndex
CREATE INDEX "visit_work_items_draftPropertyId_idx" ON "visit_work_items"("draftPropertyId");

-- CreateIndex
CREATE INDEX "parte_visita_sessions_draftDemandId_idx" ON "parte_visita_sessions"("draftDemandId");

-- CreateIndex
CREATE INDEX "nota_encargo_sessions_draftPropertyId_idx" ON "nota_encargo_sessions"("draftPropertyId");
