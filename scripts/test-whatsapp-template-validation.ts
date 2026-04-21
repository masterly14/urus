/**
 * Validación de plantilla WhatsApp Cloud API usando configuración de .env.
 *
 * Uso:
 *   npx tsx scripts/test-whatsapp-template-validation.ts
 *
 * Variables opcionales:
 * - WHATSAPP_TEMPLATE_VALIDATION_TO: destino (default: WHATSAPP_TEST_TO o 573113541077)
 * - WHATSAPP_VALIDATION_TEMPLATE_ENV_KEY: nombre de la variable env que contiene la plantilla (default: WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS)
 * - WHATSAPP_VALIDATION_TEMPLATE_VARS: variables del body (JSON array o texto separado por "|")
 *
 * Ejemplo:
 *   WHATSAPP_VALIDATION_TEMPLATE_ENV_KEY=WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS
 *   WHATSAPP_VALIDATION_TEMPLATE_VARS=["Santiago","Urus Capital Group"]
 */

import "dotenv/config";
import { sendTemplateMessage } from "@/lib/whatsapp";
import type { TemplateObject } from "@/lib/whatsapp";

const DEFAULT_TO = "573113541077";
const DEFAULT_TEMPLATE_ENV_KEY = "WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS";

const KNOWN_TEMPLATE_PARAM_COUNT: Record<string, number> = {
  WHATSAPP_TEMPLATE_MATCH: 2,
  WHATSAPP_TEMPLATE_LEAD_ASIGNADO: 3,
  WHATSAPP_TEMPLATE_CONTRATO_FIRMA_ENVIADA: 4,
  WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D1: 4,
  WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D3: 4,
  WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D5: 4,
  WHATSAPP_TEMPLATE_CONTRATO_FIRMA_SLA_ESCALADO: 3,
  WHATSAPP_TEMPLATE_PRICING_INFORME: 5,
  WHATSAPP_TEMPLATE_POSTVENTA_AGRADECIMIENTO: 3,
  WHATSAPP_TEMPLATE_POSTVENTA_RESENA: 2,
  WHATSAPP_TEMPLATE_POSTVENTA_REFERIDOS: 2,
  WHATSAPP_TEMPLATE_POSTVENTA_RECAPTACION: 3,
  WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS: 2,
  WHATSAPP_TEMPLATE_POSTVENTA_NAVIDAD: 2,
  WHATSAPP_TEMPLATE_DEV_EXERCISE: 3,
};

function normalizePhone(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function readTemplateNameFromEnv(templateEnvKey: string): string {
  const templateName = process.env[templateEnvKey]?.trim();
  if (!templateName) {
    throw new Error(
      `No se encontró la plantilla en .env para la clave ${templateEnvKey}.`,
    );
  }
  return templateName;
}

function parseTemplateVariables(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }

  const trimmed = raw.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error(
        "WHATSAPP_VALIDATION_TEMPLATE_VARS debe ser un array JSON de strings.",
      );
    }
    return parsed.map((value) => value.trim()).filter(Boolean);
  }

  return trimmed
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
}

function defaultVariablesForTemplate(templateEnvKey: string): string[] {
  const buyer = process.env.TEST_CLIENT_NOMBRE?.trim() || "Cliente";
  const agency = process.env.AGENCY_NAME?.trim() || "Urus Capital Group";
  const operationRef = "OP-2026-000123";
  const docType = "Contrato de arras";
  const signUrl = `${process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://platform.uruscapitalgroup.com"}/firma/demo-token`;
  const reportUrl = `${process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://platform.uruscapitalgroup.com"}/pricing/demo`;
  const commercial = "Santiago";
  const score = "85";
  const sla = "5 minutos";
  const gap = "-5.2%";

  switch (templateEnvKey) {
    case "WHATSAPP_TEMPLATE_MATCH":
      return [buyer, "https://platform.uruscapitalgroup.com/seleccion/demo"];
    case "WHATSAPP_TEMPLATE_LEAD_ASIGNADO":
      return [operationRef, score, sla];
    case "WHATSAPP_TEMPLATE_CONTRATO_FIRMA_ENVIADA":
    case "WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D1":
    case "WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D3":
    case "WHATSAPP_TEMPLATE_CONTRATO_FIRMA_D5":
      return [buyer, docType, operationRef, signUrl];
    case "WHATSAPP_TEMPLATE_CONTRATO_FIRMA_SLA_ESCALADO":
      return [operationRef, docType, signUrl];
    case "WHATSAPP_TEMPLATE_PRICING_INFORME":
      return ["COD-1234", "Centro", "250000", gap, reportUrl];
    case "WHATSAPP_TEMPLATE_POSTVENTA_AGRADECIMIENTO":
      return [buyer, "Comercial demo", agency];
    case "WHATSAPP_TEMPLATE_POSTVENTA_RESENA":
      return [buyer, process.env.GOOGLE_REVIEW_URL?.trim() || "https://g.page/r/demo/review"];
    case "WHATSAPP_TEMPLATE_POSTVENTA_REFERIDOS":
      return [buyer, "https://wa.me/34600000000"];
    case "WHATSAPP_TEMPLATE_POSTVENTA_RECAPTACION":
      return [buyer, commercial, "https://wa.me/34600000000"];
    case "WHATSAPP_TEMPLATE_POSTVENTA_CUMPLEANOS":
    case "WHATSAPP_TEMPLATE_POSTVENTA_NAVIDAD":
      return [buyer, agency];
    case "WHATSAPP_TEMPLATE_DEV_EXERCISE":
      return [commercial, "Visualizacion", "Cierre de objeciones"];
    default:
      return [buyer, agency];
  }
}

function getExpectedParamCount(templateEnvKey: string): number | null {
  const explicit = process.env.WHATSAPP_VALIDATION_TEMPLATE_EXPECTED_PARAMS?.trim();
  if (!explicit) return KNOWN_TEMPLATE_PARAM_COUNT[templateEnvKey] ?? null;
  const parsed = Number(explicit);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      "WHATSAPP_VALIDATION_TEMPLATE_EXPECTED_PARAMS debe ser un entero >= 0.",
    );
  }
  return parsed;
}

type MetaTemplateComponent = {
  type?: string;
  text?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string }>;
};

function countPlaceholders(text: string | undefined): number {
  if (!text) return 0;
  const matches = text.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
}

async function fetchTemplateComponents(
  templateName: string,
): Promise<MetaTemplateComponent[] | null> {
  const businessId = process.env.WHATSAPP_BUSINESS_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!businessId || !accessToken) return null;

  const params = new URLSearchParams({
    fields: "name,language,status,components",
    limit: "100",
  });
  const url = `https://graph.facebook.com/v20.0/${businessId}/message_templates?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;

  const body = (await response.json()) as {
    data?: Array<{
      name?: string;
      language?: string;
      components?: MetaTemplateComponent[];
    }>;
  };

  const selected = body.data?.find((item) => item.name === templateName);
  return selected?.components ?? null;
}

function printTemplateDiagnostics(components: MetaTemplateComponent[]): void {
  console.log("[INFO] Diagnóstico de componentes de plantilla en Meta:");
  for (const component of components) {
    const type = (component.type || "").toUpperCase();
    if (type === "BODY" || type === "HEADER") {
      const count = countPlaceholders(component.text);
      console.log(`- ${type}: ${count} variables`);
      continue;
    }
    if (type === "BUTTONS" && Array.isArray(component.buttons)) {
      component.buttons.forEach((button, index) => {
        const urlVars = countPlaceholders(button.url);
        const textVars = countPlaceholders(button.text);
        const total = urlVars + textVars;
        console.log(
          `- BUTTON[${index}] (${button.type || "unknown"}): ${total} variables`,
        );
      });
      continue;
    }
    console.log(`- ${type || "UNKNOWN"}: sin variables detectadas`);
  }
}

function getBodyVariableCount(components: MetaTemplateComponent[]): number {
  const body = components.find(
    (component) => (component.type || "").toUpperCase() === "BODY",
  );
  return countPlaceholders(body?.text);
}

function hasNonBodyVariables(components: MetaTemplateComponent[]): boolean {
  for (const component of components) {
    const type = (component.type || "").toUpperCase();
    if (type === "BODY") continue;
    if (type === "HEADER" && countPlaceholders(component.text) > 0) return true;
    if (type === "BUTTONS" && Array.isArray(component.buttons)) {
      for (const button of component.buttons) {
        if (countPlaceholders(button.url) + countPlaceholders(button.text) > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

function normalizeVariableCount(values: string[], expectedCount: number): string[] {
  if (expectedCount <= 0) return [];
  if (values.length === expectedCount) return values;
  if (values.length > expectedCount) return values.slice(0, expectedCount);

  const padded = [...values];
  while (padded.length < expectedCount) {
    padded.push(`valor_${padded.length + 1}`);
  }
  return padded;
}

async function main(): Promise<void> {
  if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error(
      "Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en .env.",
    );
  }

  const to = normalizePhone(
    process.env.WHATSAPP_TEMPLATE_VALIDATION_TO ??
      process.env.WHATSAPP_TEST_TO ??
      DEFAULT_TO,
  );
  if (!to) {
    throw new Error("No se pudo resolver un número de destino válido.");
  }

  const templateEnvKey =
    process.env.WHATSAPP_VALIDATION_TEMPLATE_ENV_KEY?.trim() ||
    DEFAULT_TEMPLATE_ENV_KEY;
  const templateName = readTemplateNameFromEnv(templateEnvKey);
  const language = process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "es";
  const parsedVariables = parseTemplateVariables(
    process.env.WHATSAPP_VALIDATION_TEMPLATE_VARS,
  );
  const variables =
    parsedVariables.length > 0
      ? parsedVariables
      : defaultVariablesForTemplate(templateEnvKey);
  const expectedParamCount = getExpectedParamCount(templateEnvKey);

  if (expectedParamCount !== null && variables.length !== expectedParamCount) {
    throw new Error(
      [
        `La plantilla ${templateName} (${templateEnvKey}) espera ${expectedParamCount} parámetros, pero se están enviando ${variables.length}.`,
        "Define WHATSAPP_VALIDATION_TEMPLATE_VARS con la cantidad correcta.",
        `Ejemplo: WHATSAPP_VALIDATION_TEMPLATE_VARS=${JSON.stringify(
          Array.from({ length: expectedParamCount }, (_, i) => `valor_${i + 1}`),
        )}`,
      ].join(" "),
    );
  }
  const templateComponents = await fetchTemplateComponents(templateName);
  if (
    templateComponents &&
    templateComponents.length > 0 &&
    !process.env.WHATSAPP_VALIDATION_TEMPLATE_VARS?.trim()
  ) {
    const bodyCount = getBodyVariableCount(templateComponents);
    if (bodyCount > 0 && !hasNonBodyVariables(templateComponents)) {
      variables.splice(0, variables.length, ...normalizeVariableCount(variables, bodyCount));
    }
  }

  const template: TemplateObject = {
    name: templateName,
    language: { code: language },
    components: [
      {
        type: "body",
        parameters: variables.map((text) => ({ type: "text", text })),
      },
    ],
  };

  console.log("[INFO] Preflight plantilla:");
  console.log(`- Destino: +${to}`);
  console.log(`- Clave env plantilla: ${templateEnvKey}`);
  console.log(`- Nombre plantilla: ${templateName}`);
  console.log(`- Idioma: ${language}`);
  console.log(`- Variables (${variables.length}): ${variables.join(" | ")}`);

  let result;
  try {
    result = await sendTemplateMessage(to, template);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("132000")) {
      const components = templateComponents ?? (await fetchTemplateComponents(templateName));
      if (components && components.length > 0) {
        printTemplateDiagnostics(components);
        console.log(
          "[INFO] Si tu plantilla tiene variables en HEADER o BUTTONS, debes enviarlas también (no solo BODY).",
        );
      } else {
        console.log(
          "[INFO] No se pudo obtener la definición de la plantilla desde Meta para diagnóstico automático.",
        );
      }
    }
    throw error;
  }
  const messageId = result.messages?.[0]?.id;

  console.log("[OK] Plantilla enviada correctamente.");
  console.log(`- Destino: +${to}`);
  console.log(`- Clave env de plantilla: ${templateEnvKey}`);
  console.log(`- Plantilla usada: ${templateName}`);
  console.log(`- Idioma: ${language}`);
  console.log(`- Variables enviadas (${variables.length}): ${variables.join(" | ")}`);
  console.log(`- Message ID: ${messageId ?? "n/a"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] ${message}`);
  process.exitCode = 1;
});
