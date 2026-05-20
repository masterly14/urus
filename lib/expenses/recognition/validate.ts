import { DEFAULT_EXPENSE_CATEGORIES } from "../types";

const CATEGORY_SET = new Set(DEFAULT_EXPENSE_CATEGORIES);

export type ExpenseValidationInput = {
  amount: number;
  currency: string;
  category: string;
  description: string;
  vendor: string | null;
  expenseDate: string;
};

export type ExpenseValidationResult =
  | { ok: true; normalized: ExpenseValidationInput }
  | { ok: false; errors: string[] };

export function validateExpenseDraft(
  input: ExpenseValidationInput,
): ExpenseValidationResult {
  const errors: string[] = [];

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push("El importe debe ser mayor que 0.");
  }

  const category = input.category.trim().toLowerCase();
  if (!CATEGORY_SET.has(category as (typeof DEFAULT_EXPENSE_CATEGORIES)[number])) {
    errors.push(`Categoría no permitida: ${input.category}`);
  }

  const description = input.description.trim();
  if (description.length < 3) {
    errors.push("La descripción debe tener al menos 3 caracteres.");
  }

  const date = new Date(input.expenseDate);
  if (Number.isNaN(date.getTime())) {
    errors.push("La fecha del gasto no es válida.");
  }

  const currency = input.currency.trim().toUpperCase();
  if (currency.length < 3 || currency.length > 6) {
    errors.push("La moneda debe tener entre 3 y 6 caracteres.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    normalized: {
      amount,
      currency,
      category,
      description,
      vendor: input.vendor?.trim() || null,
      expenseDate: date.toISOString(),
    },
  };
}
