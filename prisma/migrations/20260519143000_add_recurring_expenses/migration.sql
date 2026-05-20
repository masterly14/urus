-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE 'EXPECTED';

-- CreateTable
CREATE TABLE "recurring_expenses" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vendor" TEXT NOT NULL,
  "amountEur" DECIMAL(12,2) NOT NULL,
  "dayOfMonth" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "bucket" "ExpenseBucket" NOT NULL DEFAULT 'FACTURA',
  "accountId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastGeneratedPeriod" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "expenses"
ADD COLUMN "recurringExpenseId" TEXT;

-- CreateIndex
CREATE INDEX "recurring_expenses_active_dayOfMonth_idx" ON "recurring_expenses"("active", "dayOfMonth");

-- CreateIndex
CREATE INDEX "recurring_expenses_lastGeneratedPeriod_idx" ON "recurring_expenses"("lastGeneratedPeriod");

-- CreateIndex
CREATE INDEX "expenses_recurringExpenseId_expenseDate_idx" ON "expenses"("recurringExpenseId", "expenseDate");

-- AddForeignKey
ALTER TABLE "recurring_expenses"
ADD CONSTRAINT "recurring_expenses_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "bank_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_recurringExpenseId_fkey"
FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed base recurring templates inferred from CEO worksheet (ENE)
INSERT INTO "recurring_expenses" ("id", "name", "vendor", "amountEur", "dayOfMonth", "category", "bucket", "createdAt", "updatedAt")
VALUES
  ('rec_chatgpt', 'ChatGPT', 'CHAT GPT', 19.01, 5, 'software', 'SUSCRIPCION', NOW(), NOW()),
  ('rec_statefox', 'Statefox', 'STATEFOX', 112.53, 5, 'software', 'SUSCRIPCION', NOW(), NOW()),
  ('rec_idealista', 'Idealista', 'IDEALISTA', 647.47, 5, 'marketing', 'FACTURA', NOW(), NOW()),
  ('rec_inmovilla', 'Inmovilla', 'INMOVILLA', 95.59, 5, 'software', 'SUSCRIPCION', NOW(), NOW()),
  ('rec_habitatsoft', 'HabitatSoft', 'HABITATSOFT', 156.09, 5, 'software', 'SUSCRIPCION', NOW(), NOW()),
  ('rec_marketing', 'Marketing', 'MARKETING', 612.00, 5, 'marketing', 'FACTURA', NOW(), NOW()),
  ('rec_ford_credit', 'Ford Credit', 'FORD CREDIT', 476.57, 5, 'otros', 'DEUDA', NOW(), NOW()),
  ('rec_nomina', 'Nómina', 'NÓMINA', 1600.00, 1, 'servicios_profesionales', 'FACTURA', NOW(), NOW()),
  ('rec_fotocasa', 'Fotocasa', 'FOTOCASA', 48.40, 5, 'marketing', 'FACTURA', NOW(), NOW()),
  ('rec_seguro_caixa', 'Seguro Caixa', 'SEGURO CAIXA', 49.80, 5, 'otros', 'FACTURA', NOW(), NOW()),
  ('rec_gestor', 'Gestor', 'GESTOR', 145.20, 5, 'servicios_profesionales', 'FACTURA', NOW(), NOW()),
  ('rec_redes', 'Gestión redes', 'GESTIÓN REDES', 210.94, 5, 'marketing', 'FACTURA', NOW(), NOW());
