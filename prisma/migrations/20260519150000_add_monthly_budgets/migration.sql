-- CreateEnum
CREATE TYPE "FinanceBudgetBucket" AS ENUM ('INGRESOS', 'FACTURA', 'SUSCRIPCION', 'GASTO_VARIABLE', 'AHORRO', 'DEUDA');

-- CreateTable
CREATE TABLE "monthly_budgets" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "bucket" "FinanceBudgetBucket" NOT NULL,
  "budgetEur" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "monthly_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_budgets_period_bucket_key" ON "monthly_budgets"("period", "bucket");

-- CreateIndex
CREATE INDEX "monthly_budgets_period_idx" ON "monthly_budgets"("period");
