-- CreateEnum
CREATE TYPE "ExpenseBucket" AS ENUM ('FACTURA', 'SUSCRIPCION', 'GASTO_VARIABLE', 'AHORRO', 'DEUDA');

-- CreateTable
CREATE TABLE "bank_accounts" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bankName" TEXT,
  "ownerScope" TEXT NOT NULL DEFAULT 'EMPRESA',
  "accountType" TEXT NOT NULL DEFAULT 'CORRIENTE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "expenses"
ADD COLUMN "bucket" "ExpenseBucket" NOT NULL DEFAULT 'GASTO_VARIABLE',
ADD COLUMN "accountId" TEXT;

-- AlterTable
ALTER TABLE "income_entries"
ADD COLUMN "accountId" TEXT;

-- Backfill bucket using existing categories
UPDATE "expenses"
SET "bucket" = CASE
  WHEN "category" IN ('alquiler', 'suministros', 'servicios_profesionales') THEN 'FACTURA'::"ExpenseBucket"
  WHEN "category" = 'software' THEN 'SUSCRIPCION'::"ExpenseBucket"
  WHEN "category" IN ('marketing', 'transporte', 'comidas', 'material_oficina') THEN 'GASTO_VARIABLE'::"ExpenseBucket"
  ELSE 'GASTO_VARIABLE'::"ExpenseBucket"
END;

-- CreateIndex
CREATE INDEX "bank_accounts_isActive_name_idx" ON "bank_accounts"("isActive", "name");

-- CreateIndex
CREATE INDEX "expenses_bucket_idx" ON "expenses"("bucket");

-- CreateIndex
CREATE INDEX "expenses_accountId_expenseDate_idx" ON "expenses"("accountId", "expenseDate");

-- CreateIndex
CREATE INDEX "income_entries_accountId_occurredAt_idx" ON "income_entries"("accountId", "occurredAt");

-- AddForeignKey
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_entries"
ADD CONSTRAINT "income_entries_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
