import type { ContractTemplateInput } from "@/types/contracts";
import { flattenContractPayloadForDisplay } from "./flatten-payload-for-display";
import {
  getValueAtPath,
  isEditablePayloadPath,
  parsePayloadPath,
} from "./payload-path-edit";
import { getVariablesForKind } from "@/lib/contracts/templates/variable-catalog";
import {
  formatDateEsFromIso,
  formatMoneyAmountEur,
  formatMoneyEur,
} from "@/lib/contracts/docx/formatters";
import type { MoneyEUR } from "@/types/contracts";

export interface PreviewFieldAnchor {
  path: string;
  label: string;
  value: string;
}

function toCatalogLikePath(path: string): string {
  return path.replace(/\[\d+\]/g, "[]");
}

function isMoneyEur(value: unknown): value is MoneyEUR {
  return (
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    "literalEs" in value &&
    typeof (value as MoneyEUR).amount === "number" &&
    typeof (value as MoneyEUR).literalEs === "string"
  );
}

function deriveDisplayCandidates(
  path: string,
  currentValue: unknown,
  fallback: string,
  payload: unknown,
): string[] {
  const candidates = new Set<string>();
  const safeFallback = fallback.trim();
  if (safeFallback) candidates.add(safeFallback);

  if (typeof currentValue === "string") {
    const v = currentValue.trim();
    if (v) candidates.add(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      candidates.add(formatDateEsFromIso(v));
    }
  }

  if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
    candidates.add(String(currentValue));
    if (path.startsWith("timelines.")) {
      candidates.add(`${currentValue} dias`);
      candidates.add(`${currentValue} dias naturales`);
      candidates.add(`${currentValue} dias habiles`);
    }
    if (path.endsWith(".amount")) {
      candidates.add(formatMoneyAmountEur(currentValue));
    }
  }

  if (path.endsWith(".amount")) {
    const moneyPath = path.slice(0, -".amount".length);
    const moneyValue = getValueAtPath(payload, parsePayloadPath(moneyPath));
    if (isMoneyEur(moneyValue)) {
      candidates.add(formatMoneyEur(moneyValue));
      candidates.add(formatMoneyAmountEur(moneyValue.amount));
      if (moneyValue.literalEs.trim()) candidates.add(moneyValue.literalEs.trim());
    }
  }

  if (path.endsWith(".literalEs")) {
    const moneyPath = path.slice(0, -".literalEs".length);
    const moneyValue = getValueAtPath(payload, parsePayloadPath(moneyPath));
    if (isMoneyEur(moneyValue)) {
      candidates.add(formatMoneyEur(moneyValue));
      if (moneyValue.literalEs.trim()) candidates.add(moneyValue.literalEs.trim());
    }
  }

  return Array.from(candidates).filter((v) => v.trim().length >= 2);
}

export function buildPreviewFieldAnchors(input: ContractTemplateInput): PreviewFieldAnchor[] {
  const payload = input.payload as unknown;
  if (!payload || typeof payload !== "object") return [];

  const catalog = getVariablesForKind(input.kind);
  const labelByPath = new Map<string, string>(
    catalog.map((entry) => [entry.path, entry.label]),
  );

  const anchors: PreviewFieldAnchor[] = [];
  const seen = new Set<string>();

  for (const row of flattenContractPayloadForDisplay(payload)) {
    if (!row.path || !isEditablePayloadPath(payload, row.path)) continue;
    const currentValue = getValueAtPath(payload, parsePayloadPath(row.path));
    const candidates = deriveDisplayCandidates(row.path, currentValue, row.value, payload);
    if (candidates.length === 0) continue;

    const normalizedPath = toCatalogLikePath(row.path);
    const label = labelByPath.get(normalizedPath) ?? row.path;
    for (const candidate of candidates) {
      const key = `${row.path}::${candidate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push({
        path: row.path,
        label,
        value: candidate,
      });
    }
  }

  return anchors
    .map((anchor) => ({ ...anchor, value: anchor.value.trim() }))
    .filter((anchor) => anchor.value.length >= 2)
    .slice(0, 120);
}
