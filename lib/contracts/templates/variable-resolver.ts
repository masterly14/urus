import {
  formatDateEsFromIso,
  formatMoneyEur,
  formatPersonLegalLine,
  formatPeopleList,
} from "@/lib/contracts/docx/formatters";
import type { MoneyEUR, NaturalPerson } from "@/types/contracts";

const VARIABLE_REGEX = /\{\{([\w\[\].?='"!: ]+)\}\}/g;

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isMoneyEur(val: unknown): val is MoneyEUR {
  return val != null && typeof val === "object" && "amount" in val && "literalEs" in val;
}

function isNaturalPerson(val: unknown): val is NaturalPerson {
  return val != null && typeof val === "object" && "fullName" in val && "nationalId" in val;
}

function formatValue(val: unknown, path: string): string {
  if (val == null) return `[${path}]`;

  if (isMoneyEur(val)) return formatMoneyEur(val);

  if (isNaturalPerson(val)) return formatPersonLegalLine(val);

  if (Array.isArray(val)) {
    if (val.every(isNaturalPerson)) return formatPeopleList(val);
    return val.map(String).join(", ");
  }

  if (typeof val === "boolean") return val ? "si" : "no";

  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return formatDateEsFromIso(str);

  return str;
}

function resolveSpecialVariable(
  path: string,
  payload: Record<string, unknown>,
): string | null {
  if (path === "_resolved_buyers") {
    const buyers = payload.buyers;
    if (Array.isArray(buyers) && buyers.every(isNaturalPerson)) {
      return formatPeopleList(buyers);
    }
    return "[buyers]";
  }

  if (path === "_resolved_sellers") {
    const sellers = payload.sellers;
    if (Array.isArray(sellers) && sellers.every(isNaturalPerson)) {
      return formatPeopleList(sellers);
    }
    return "[sellers]";
  }

  return null;
}

export function resolveVariablesInText(
  text: string,
  payload: Record<string, unknown>,
): string {
  return text.replace(VARIABLE_REGEX, (_match, rawPath: string) => {
    const path = rawPath.trim();

    if (path.startsWith("_resolved_")) {
      const resolved = resolveSpecialVariable(path, payload);
      return resolved ?? `{{${path}}}`;
    }

    if (path.includes("===") || path.includes("?")) {
      return resolveInlineConditional(path, payload);
    }

    const val = getNestedValue(payload, path);
    return formatValue(val, path);
  });
}

function resolveInlineConditional(expr: string, payload: Record<string, unknown>): string {
  const ternaryMatch = expr.match(
    /^([\w.[\]]+)\s*===\s*'([^']+)'\s*\?\s*'([^']+)'\s*:\s*'([^']+)'$/,
  );
  if (ternaryMatch) {
    const [, path, expected, thenVal, elseVal] = ternaryMatch;
    const actual = String(getNestedValue(payload, path) ?? "");
    return actual === expected ? thenVal : elseVal;
  }
  return `[${expr}]`;
}

export function resolveVariableList(
  items: unknown[],
  itemTemplate: string,
  separator: string,
): string {
  return items
    .map((item) => {
      return itemTemplate.replace(VARIABLE_REGEX, (_match, rawPath: string) => {
        const path = rawPath.trim();
        if (path.startsWith("item.")) {
          const innerPath = path.slice(5);
          const val = getNestedValue(item, innerPath);
          return formatValue(val, path);
        }
        return `{{${path}}}`;
      });
    })
    .join(separator);
}
