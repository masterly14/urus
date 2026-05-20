import OpenAI from "openai";
import { z } from "zod";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_EXPENSE_CURRENCY,
  type ExpenseDraftFields,
} from "../types";

const ExtractedExpenseSchema = z.object({
  amount: z.coerce.number().default(0),
  currency: z.string().min(3).max(6).default(DEFAULT_EXPENSE_CURRENCY),
  category: z.string().min(2).default("otros"),
  description: z.string().min(1).default("Gasto operativo"),
  vendor: z.string().nullable().optional(),
  expenseDate: z.string().min(1).default("hoy"),
  aiConfidence: z.number().min(0).max(1).optional(),
});

export type ExtractedExpensePayload = {
  fields: ExpenseDraftFields;
  aiConfidence: number | null;
};

function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY no está configurada");
  }
  return key;
}

function getExtractionModel(): string {
  return process.env.OPENAI_EXPENSE_MODEL?.trim() || "gpt-5.4-mini";
}

function tryParseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("El modelo no devolvió JSON válido para gasto");
  }
}

function normalizeCategory(category: string): string {
  const normalized = category
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
  if ((DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return "otros";
}

function madridYmd(date: Date): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return formatted;
}

function ymdToNoonUtcIso(ymd: string): string {
  return new Date(`${ymd}T12:00:00.000Z`).toISOString();
}

function shiftYmdByDays(ymd: string, days: number): string {
  const base = new Date(`${ymd}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return madridYmd(base);
}

export function normalizeExpenseDateForSpain(value: string, now = new Date()): string {
  const raw = value.trim().toLowerCase();

  if (raw.includes("hoy")) {
    return ymdToNoonUtcIso(madridYmd(now));
  }
  if (raw.includes("ayer")) {
    const todayMadrid = madridYmd(now);
    return ymdToNoonUtcIso(shiftYmdByDays(todayMadrid, -1));
  }

  const ymdMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, "0");
    const d = ymdMatch[3].padStart(2, "0");
    return ymdToNoonUtcIso(`${y}-${m}-${d}`);
  }

  const spanishMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (spanishMatch) {
    const day = spanishMatch[1].padStart(2, "0");
    const month = spanishMatch[2].padStart(2, "0");
    const year = spanishMatch[3].length === 2 ? `20${spanishMatch[3]}` : spanishMatch[3];
    return ymdToNoonUtcIso(`${year}-${month}-${day}`);
  }

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return ymdToNoonUtcIso(madridYmd(asDate));
  }

  return ymdToNoonUtcIso(madridYmd(now));
}

export async function extractExpenseFieldsFromText(input: {
  normalizedText: string;
  priorDraftSummary?: string | null;
}): Promise<ExtractedExpensePayload> {
  const openai = new OpenAI({ apiKey: getOpenAiApiKey() });

  const categories = DEFAULT_EXPENSE_CATEGORIES.join(", ");
  const response = await openai.responses.create({
    model: getExtractionModel(),
    max_output_tokens: 700,
    input: [
      {
        role: "system",
        content: [
          "Eres un analista financiero que extrae gastos operativos desde mensajes de WhatsApp.",
          `Debes mapear category a una de: ${categories}.`,
          "Interpreta fechas relativas (ej. hoy, ayer) en timezone Europe/Madrid.",
          "Devuelve SOLO JSON válido sin markdown.",
          "Formato JSON obligatorio:",
          '{"amount": number, "currency": "EUR", "category": "otros", "description": "texto", "vendor": "string|null", "expenseDate": "ISO-8601|DD/MM/YYYY", "aiConfidence": 0.0}',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          input.priorDraftSummary ? `Borrador previo: ${input.priorDraftSummary}` : "",
          `Entrada de gasto:\n${input.normalizedText}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const parsedRaw = tryParseJsonObject(response.output_text || "{}");
  const parsed = ExtractedExpenseSchema.parse(parsedRaw);

  return {
    fields: {
      amount: parsed.amount,
      currency: parsed.currency?.toUpperCase() || DEFAULT_EXPENSE_CURRENCY,
      category: normalizeCategory(parsed.category),
      description: parsed.description.trim(),
      vendor: parsed.vendor?.trim() || null,
        expenseDate: normalizeExpenseDateForSpain(parsed.expenseDate),
    },
    aiConfidence: parsed.aiConfidence ?? null,
  };
}
