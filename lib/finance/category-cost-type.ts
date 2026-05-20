import type { ExpenseBucket, ExpenseCostType } from "@prisma/client";
import type { ExpenseCategory } from "@/lib/expenses/types";

const FACTURA_CATEGORIES = new Set<ExpenseCategory>([
  "alquiler",
  "suministros",
  "servicios_profesionales",
]);

const SUSCRIPCION_CATEGORIES = new Set<ExpenseCategory>(["software"]);

export function defaultExpenseBucket(category: string): ExpenseBucket {
  if (FACTURA_CATEGORIES.has(category as ExpenseCategory)) {
    return "FACTURA";
  }
  if (SUSCRIPCION_CATEGORIES.has(category as ExpenseCategory)) {
    return "SUSCRIPCION";
  }
  return "GASTO_VARIABLE";
}

export function costTypeFromBucket(bucket: ExpenseBucket): ExpenseCostType {
  if (bucket === "GASTO_VARIABLE") {
    return "VARIABLE";
  }
  return "FIJO";
}

export function defaultCostType(category: string): ExpenseCostType {
  return costTypeFromBucket(defaultExpenseBucket(category));
}
