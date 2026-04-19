-- AlterTable: add telefono column to demand_snapshots
ALTER TABLE "demand_snapshots" ADD COLUMN "telefono" TEXT NOT NULL DEFAULT '';
