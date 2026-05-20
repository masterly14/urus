# Finanzas CEO derivadas desde datos reales

## Qué se construyó

Se reemplazó el enfoque de carga manual del snapshot financiero para los KPI de costes, EBITDA y cash por un modelo derivado desde:

- Gastos confirmados (`Expense`) registrados por WhatsApp o editados en UI.
- Ingresos derivados de operaciones cerradas (`commercial_operation_facts`).
- Ingresos manuales complementarios (`IncomeEntry`).
- Saldo inicial mensual de tesorería (`TreasuryBalance`).

El dashboard financiero queda accesible para `ceo` y `admin` y permite ajuste por gasto individual.

## Modelos y schema

Archivos clave:

- `prisma/schema.prisma`
- `prisma/migrations/20260519121000_add_finance_ledger/migration.sql`

Cambios principales:

- `Expense.costType` con enum `ExpenseCostType` (`FIJO`, `VARIABLE`).
- `Expense.bucket` con enum `ExpenseBucket` (`FACTURA`, `SUSCRIPCION`, `GASTO_VARIABLE`, `AHORRO`, `DEUDA`).
- `Expense.accountId` para asociar cada gasto a una cuenta bancaria.
- `IncomeEntry` para ingresos manuales por periodo.
- `IncomeEntry.accountId` para asociar ingresos manuales a cuenta bancaria.
- `TreasuryBalance` para saldo inicial mensual.
- `BankAccount` para catálogo de cuentas bancarias operativas.
- `RecurringExpense` para plantillas de gastos recurrentes mensuales.
- `MonthlyBudget` para presupuesto mensual por bucket financiero.
- Backfill de `Expense.costType` por categoría en migración.

## Backend y agregación

Módulo nuevo:

- `lib/finance/category-cost-type.ts`
- `lib/finance/aggregator.ts`
- `lib/finance/incomes/repository.ts`
- `lib/finance/accounts/repository.ts`
- `lib/finance/treasury/repository.ts`

Fórmulas:

- `gastosTotales = sum(expenses.confirmed.amount)`
- `costesFijos = sum(expenses.confirmed.amount where costType=FIJO)`
- `costesVariables = sum(expenses.confirmed.amount where costType=VARIABLE)`
- `ingresosTotales = ingresosDerivados + ingresosManuales`
- `ebitda = ingresosTotales - gastosTotales`
- `cash = openingBalance + ingresosTotales - gastosTotales`

Refactor en:

- `lib/dashboard/ceo/queries.ts`

Ahora `getCeoOverview()` usa agregados derivados para:

- `kpis.ebitda`
- `kpis.costeOperativo`
- `kpis.cashDisponible`

`kpis.capacidadReinversion` se mantiene en `CeoMonthlySnapshot.reinvestmentCapacity` de forma manual.

## Endpoints nuevos/actualizados

- `GET /api/finanzas/overview?period=YYYY-MM`
- `GET|POST /api/finanzas/ingresos`
- `PATCH|DELETE /api/finanzas/ingresos/[id]`
- `GET|POST /api/finanzas/cuentas`
- `PATCH|DELETE /api/finanzas/cuentas/[id]`
- `GET|POST /api/finanzas/recurrentes`
- `PATCH|DELETE /api/finanzas/recurrentes/[id]`
- `GET|POST /api/finanzas/presupuestos`
- `GET|POST /api/finanzas/tesoreria`
- `PATCH /api/expenses/[id]` (edición de `bucket`, `costType`, `accountId` y campos financieros)
- `GET /api/expenses` y `GET /api/expenses/summary` ahora aceptan `period`, `costType`, `bucket` y `accountId`.

Todos los endpoints anteriores requieren rol `ceo|admin`.

## UI

Página financiera renovada:

- `app/platform/bi/financiero/page.tsx`

Incluye:

- KPIs derivados del periodo.
- Tabs `Resumen del mes | Movimientos | Gastos | Ingresos | Tesorería | Configuración`.
- Select inline de bucket y cuenta bancaria por gasto.
- Form de ingresos manuales.
- Form de saldo inicial de tesorería.
- Gestión CRUD de cuentas bancarias en pestaña Configuración.
- Gestión CRUD de recurrentes y generación automática en estado `EXPECTED`.
- Resumen con `Cantidad restante` real vs presupuestada.
- Tabla de presupuesto/real/desviación por bucket (incluye `INGRESOS`).
- Movimientos unificados (gastos + ingresos) con filtros por bucket/cuenta/categoría.
- Presupuesto base editable desde Configuración con auto-copia desde el mes anterior.

Cron nuevo:

- `POST /api/cron/generate-recurring` (auth QStash / `CRON_SECRET`)
- genera gastos recurrentes del día de forma idempotente (`lastGeneratedPeriod` + `sourceMessageId` sintético)

Match automático:

- Al confirmar un gasto desde WhatsApp, se intenta emparejar con un `Expense` esperado del mismo mes por similitud de proveedor (fuzzy).
- Si hay match, se convierte el esperado en `CONFIRMED` reutilizando el mismo registro.

Reinversión conectada a datos reales:

- `app/platform/bi/reinversion/page.tsx`

Se sobreescriben costes/capacidad desde `GET /api/finanzas/overview` (manteniendo `?mock=1`).

Además, se retiró el modal legacy de snapshot:

- eliminado `components/bi/ceo-snapshot-modal.tsx`
- `components/bi/ceo-snapshot-alert.tsx` ahora redirige a `/platform/bi/financiero`

## Variables de entorno

Esta entrega no introduce nuevas variables de entorno. Reutiliza las ya existentes del sistema (`DATABASE_URL`, etc.).

## Cómo probar

### Unit/API tests

```bash
npx vitest run lib/finance/__tests__/category-cost-type.test.ts lib/finance/__tests__/aggregator.test.ts lib/dashboard/ceo/__tests__/queries.finance.test.ts app/api/finanzas/__tests__/overview.route.test.ts
```

### Verificación cercana a producción

```bash
npm run finance:verify -- --period=2026-05
npm run finance:generate-recurring -- --date=2026-05-05
```

Script:

- `scripts/finance/verify-aggregation.ts`

### Flujo manual

1. Registrar gasto por WhatsApp y confirmarlo.
2. Ir a `/platform/bi/financiero`, validar aparición en tabla y KPI.
3. Cambiar `Fijo/Variable` en un gasto y verificar ajuste inmediato de costes.
4. Añadir ingreso manual.
5. Guardar saldo inicial de tesorería.
6. Revisar `/platform/bi/vision-ejecutiva` y `/platform/bi/reinversion` para validar KPI derivados.
