import type { ConditionalBlockConfig, TemplateBlock } from "@/types/contract-template";

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function evaluateCondition(
  condition: ConditionalBlockConfig,
  payload: Record<string, unknown>,
): TemplateBlock[] {
  const actual = getNestedValue(payload, condition.flagPath);
  let result: boolean;

  switch (condition.operator) {
    case "eq":
      result = String(actual) === String(condition.value);
      break;
    case "neq":
      result = String(actual) !== String(condition.value);
      break;
    case "truthy":
      result = Boolean(actual);
      break;
    case "falsy":
      result = !actual;
      break;
    default:
      result = false;
  }

  return result
    ? (condition.thenBlocks ?? [])
    : (condition.elseBlocks ?? []);
}
