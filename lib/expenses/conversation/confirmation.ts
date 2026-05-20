import { sendInteractiveMessage, sendTextMessage } from "@/lib/whatsapp/send";
import {
  EXPENSE_CONFIRM_BUTTON_ID,
  EXPENSE_CORRECT_BUTTON_ID,
  type ExpenseDraft,
} from "../types";

function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatExpenseDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

export function buildExpenseConfirmationText(draft: ExpenseDraft): string {
  const rows = [
    "He analizado tu gasto y propongo registrar:",
    "",
    `- Importe: ${formatAmount(draft.fields.amount, draft.fields.currency)}`,
    `- Categoría: ${draft.fields.category}`,
    `- Fecha: ${formatExpenseDate(draft.fields.expenseDate)}`,
    `- Proveedor: ${draft.fields.vendor ?? "No indicado"}`,
    `- Descripción: ${draft.fields.description}`,
    "",
    "¿Confirmas el registro?",
  ];
  return rows.join("\n");
}

export async function sendExpenseConfirmationButtons(
  waId: string,
  draft: ExpenseDraft,
): Promise<string | null> {
  const result = await sendInteractiveMessage(
    waId,
    {
      type: "button",
      body: { text: buildExpenseConfirmationText(draft) },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: EXPENSE_CONFIRM_BUTTON_ID,
              title: "Confirmar registro",
            },
          },
          {
            type: "reply",
            reply: {
              id: EXPENSE_CORRECT_BUTTON_ID,
              title: "Corregir datos",
            },
          },
        ],
      },
    },
    {
      trace: {
        source: "expense_confirmation",
        kind: "interactive_buttons",
        aggregateId: waId,
      },
    },
  );

  return result.messages[0]?.id ?? null;
}

function formatAttemptLabel(count: number): string {
  return count === 1 ? "1 intento" : `${count} intentos`;
}

/** Mensaje guiado cuando faltan datos o la corrección no fue clara (formato WhatsApp: *negrita*). */
export function buildExpenseClarityPromptText(attemptCount: number): string {
  const attempts = formatAttemptLabel(attemptCount);
  return [
    "⚠️ *No he podido entender el gasto*",
    "",
    `Tras *${attempts}* no tengo datos suficientes para registrarlo con confianza.`,
    "",
    "📋 *Envíamelo en una línea con este formato:*",
    "",
    "*importe* | *categoría* | *fecha* | *proveedor* | *descripción*",
    "",
    "💡 *Ejemplo:*",
    "45,90 | transporte | 19/05/2026 | Repsol | gasolina visita cliente",
    "",
    "También puedes enviar *texto libre*, *audio* 🎤, *foto del ticket* 📷 o *PDF* 📄",
  ].join("\n");
}

export function buildExpenseGuidedFormatText(): string {
  return [
    "📋 *Registra tu gasto así:*",
    "",
    "*importe* | *categoría* | *fecha* | *proveedor* | *descripción*",
    "",
    "💡 *Ejemplo:*",
    "45,90 | transporte | 19/05/2026 | Repsol | gasolina visita cliente",
  ].join("\n");
}

export async function sendExpenseCorrectionPrompt(waId: string): Promise<void> {
  await sendTextMessage(
    waId,
    [
      "✏️ *Perfecto, corrijamos el gasto*",
      "",
      "Indícame qué cambiar en texto libre.",
      "",
      "💡 *Ejemplo:*",
      "El importe es *92,50* (no 82,50) y la categoría es *transporte*",
    ].join("\n"),
    {
      trace: {
        source: "expense_correction",
        kind: "request_details",
        aggregateId: waId,
      },
    },
  );
}

export async function sendExpenseClarityPrompt(
  waId: string,
  attemptCount: number,
): Promise<void> {
  await sendTextMessage(
    waId,
    buildExpenseClarityPromptText(attemptCount),
    {
      trace: {
        source: "expense_correction",
        kind: "clarity_request",
        aggregateId: waId,
      },
    },
  );
}

export async function sendExpensePersistedMessage(
  waId: string,
  amount: number,
  currency: string,
): Promise<void> {
  await sendTextMessage(
    waId,
    `Listo. Gasto registrado correctamente por ${formatAmount(amount, currency)}.`,
    {
      trace: {
        source: "expense_confirmation",
        kind: "persisted",
        aggregateId: waId,
      },
    },
  );
}

export async function sendExpenseMediaAccessError(waId: string): Promise<void> {
  await sendTextMessage(
    waId,
    [
      "📎 *No pude leer el archivo*",
      "",
      "WhatsApp no me dejó descargar la imagen, audio o PDF.",
      "",
      "Reenvíalo o cuéntame el gasto en texto:",
      "",
      buildExpenseGuidedFormatText(),
    ].join("\n"),
    {
      trace: {
        source: "expense_media_access",
        kind: "media_unavailable",
        aggregateId: waId,
      },
    },
  );
}
