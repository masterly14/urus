-- AlterTable: materializar campos de matching en demands_current
-- Estos campos se alimentan desde DEMANDA_ACTUALIZADA (variables extraídas por NLU
-- del WhatsApp del comprador). La API de Inmovilla no los devuelve en el snapshot
-- de demandas, por eso son nullable y solo se pueblan vía evento.
ALTER TABLE "demands_current" ADD COLUMN IF NOT EXISTS "metrosMin" INTEGER;
ALTER TABLE "demands_current" ADD COLUMN IF NOT EXISTS "metrosMax" INTEGER;
ALTER TABLE "demands_current" ADD COLUMN IF NOT EXISTS "tipoOperacion" TEXT;
