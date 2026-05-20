import { ExpensePromptType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  sendExpenseClarityPrompt,
  sendExpenseConfirmationButtons,
  sendExpenseCorrectionPrompt,
  sendExpenseMediaAccessError,
  sendExpensePersistedMessage,
} from "./conversation/confirmation";
import {
  deleteExpenseConversationState,
  getExpenseConversationState,
  saveExpenseConversationState,
} from "./conversation/state";
import { persistConfirmedExpenseFromDraft } from "./persistence";
import { extractExpenseFieldsFromText } from "./recognition/extract";
import { normalizeExpenseInboundMessage } from "./recognition/normalizer";
import { validateExpenseDraft } from "./recognition/validate";
import { isAuthorizedExpenseWaId, isExpenseTestWaId } from "./security";
import {
  EXPENSE_CONFIRM_BUTTON_ID,
  EXPENSE_CORRECT_BUTTON_ID,
  type ExpenseInboundMessage,
  type ExpenseProcessResult,
} from "./types";

const MAX_CORRECTION_ATTEMPTS = Number(
  process.env.MAX_EXPENSE_CORRECTION_ATTEMPTS ?? "3",
);

function getMaxCorrectionAttempts(): number {
  if (Number.isFinite(MAX_CORRECTION_ATTEMPTS) && MAX_CORRECTION_ATTEMPTS > 0) {
    return MAX_CORRECTION_ATTEMPTS;
  }
  return 3;
}

function extractInteractiveButtonId(
  inbound: ExpenseInboundMessage,
): string | null {
  if (inbound.type !== "interactive") return null;
  return (
    inbound.interactiveReply?.buttonId?.trim() ||
    (inbound.message.interactive &&
    typeof inbound.message.interactive === "object" &&
    (inbound.message.interactive as Record<string, unknown>).button_reply &&
    typeof (inbound.message.interactive as Record<string, unknown>).button_reply ===
      "object"
      ? ((inbound.message.interactive as Record<string, unknown>).button_reply as Record<
          string,
          unknown
        >).id
      : null)
  ) as string | null;
}

function isExpenseKeywordText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /\b(gasto|factura|ticket|recibo|pagu[eé]|he pagado|compra|transferencia|importe)\b/.test(
      normalized,
    ) || /\d+[.,]?\d*\s?(eur|€)/.test(normalized)
  );
}

function isMediaExpenseCandidate(type: string): boolean {
  return type === "audio" || type === "image" || type === "document";
}

function isPotentialExpenseInbound(inbound: ExpenseInboundMessage): boolean {
  if (isExpenseTestWaId(inbound.waId)) {
    // Banco de pruebas: cualquier mensaje del waId de test se deriva al flujo de gastos.
    return inbound.type === "text" || isMediaExpenseCandidate(inbound.type);
  }
  if (isMediaExpenseCandidate(inbound.type)) return true;
  if (inbound.type === "text" && inbound.textBody) {
    return isExpenseKeywordText(inbound.textBody);
  }
  return false;
}

function buildPriorDraftSummary(waId: string, lastDescription: string): string {
  return `waId=${waId}; borrador previo: ${lastDescription}`;
}

async function handleConfirm(
  inbound: ExpenseInboundMessage,
): Promise<ExpenseProcessResult> {
  const state = await getExpenseConversationState(inbound.waId);
  if (!state) {
    return { handled: true, skipQueue: true, reason: "missing_state" };
  }

  await persistConfirmedExpenseFromDraft({
    waId: inbound.waId,
    draft: state.draft,
    createdByRole: "ceo",
  });
  await deleteExpenseConversationState(inbound.waId);
  await sendExpensePersistedMessage(
    inbound.waId,
    state.draft.fields.amount,
    state.draft.fields.currency,
  );

  return { handled: true, skipQueue: true, reason: "expense_confirmed" };
}

async function handleCorrectionButton(
  inbound: ExpenseInboundMessage,
): Promise<ExpenseProcessResult> {
  const state = await getExpenseConversationState(inbound.waId);
  if (!state) {
    return { handled: true, skipQueue: true, reason: "missing_state" };
  }

  await saveExpenseConversationState({
    waId: inbound.waId,
    draft: state.draft,
    attemptCount: state.attemptCount,
    lastPromptType: ExpensePromptType.CORRECTION,
    pendingMessageId: state.pendingMessageId,
    lastMessageId: inbound.messageId,
  });
  await sendExpenseCorrectionPrompt(inbound.waId);
  return { handled: true, skipQueue: true, reason: "correction_requested" };
}

async function reprocessCorrectionText(
  inbound: ExpenseInboundMessage,
): Promise<ExpenseProcessResult> {
  const state = await getExpenseConversationState(inbound.waId);
  if (!state) {
    return { handled: false, skipQueue: false, reason: "not_expense_message" };
  }

  if (state.lastMessageId && state.lastMessageId === inbound.messageId) {
    return { handled: true, skipQueue: true, reason: "duplicate_message" };
  }

  if (state.lastPromptType !== ExpensePromptType.CORRECTION &&
      state.lastPromptType !== ExpensePromptType.CLARITY_REQUEST) {
    return { handled: false, skipQueue: false, reason: "not_expense_message" };
  }

  const correctionText = inbound.textBody?.trim();
  if (!correctionText) {
    return { handled: true, skipQueue: true, reason: "invalid_payload" };
  }

  const nextAttempt = state.attemptCount + 1;
  if (nextAttempt > getMaxCorrectionAttempts()) {
    await saveExpenseConversationState({
      waId: inbound.waId,
      draft: state.draft,
      attemptCount: nextAttempt,
      lastPromptType: ExpensePromptType.CLARITY_REQUEST,
      pendingMessageId: state.pendingMessageId,
      lastMessageId: inbound.messageId,
    });
    await sendExpenseClarityPrompt(inbound.waId, nextAttempt);
    return { handled: true, skipQueue: true, reason: "clarity_requested" };
  }

  const normalized = [
    state.draft.normalizedInput,
    `Corrección del usuario: ${correctionText}`,
  ].join("\n\n");

  const extracted = await extractExpenseFieldsFromText({
    normalizedText: normalized,
    priorDraftSummary: buildPriorDraftSummary(
      inbound.waId,
      state.draft.fields.description,
    ),
  });
  const validation = validateExpenseDraft(extracted.fields);
  if (!validation.ok) {
    await saveExpenseConversationState({
      waId: inbound.waId,
      draft: state.draft,
      attemptCount: nextAttempt,
      lastPromptType: ExpensePromptType.CLARITY_REQUEST,
      pendingMessageId: state.pendingMessageId,
      lastMessageId: inbound.messageId,
    });
    await sendExpenseClarityPrompt(inbound.waId, nextAttempt);
    return { handled: true, skipQueue: true, reason: "clarity_requested" };
  }

  const updatedDraft = {
    ...state.draft,
    normalizedInput: normalized,
    fields: validation.normalized,
    aiConfidence: extracted.aiConfidence,
  };

  const pendingMessageId = await sendExpenseConfirmationButtons(
    inbound.waId,
    updatedDraft,
  );
  await saveExpenseConversationState({
    waId: inbound.waId,
    draft: updatedDraft,
    attemptCount: nextAttempt,
    lastPromptType: ExpensePromptType.CONFIRMATION,
    pendingMessageId,
    lastMessageId: inbound.messageId,
  });

  return { handled: true, skipQueue: true, reason: "correction_reprocessed" };
}

export async function processInboundExpenseSync(
  inbound: ExpenseInboundMessage,
): Promise<ExpenseProcessResult> {
  try {
    const authorized = await isAuthorizedExpenseWaId(inbound.waId);
    if (!authorized) {
      return { handled: false, skipQueue: false, reason: "not_authorized" };
    }

    const buttonId = extractInteractiveButtonId(inbound);
    if (buttonId === EXPENSE_CONFIRM_BUTTON_ID) {
      return handleConfirm(inbound);
    }
    if (buttonId === EXPENSE_CORRECT_BUTTON_ID) {
      return handleCorrectionButton(inbound);
    }

    if (inbound.type === "text") {
      const correctionResult = await reprocessCorrectionText(inbound);
      if (correctionResult.handled) {
        return correctionResult;
      }
    }

    if (!isPotentialExpenseInbound(inbound)) {
      return { handled: false, skipQueue: false, reason: "not_expense_message" };
    }

    const duplicate = await prisma.expense.findUnique({
      where: { sourceMessageId: inbound.messageId },
      select: { id: true },
    });
    if (duplicate) {
      return { handled: true, skipQueue: true, reason: "duplicate_message" };
    }

    const normalized = await normalizeExpenseInboundMessage(inbound);
    if (!normalized.normalizedText.trim()) {
      return { handled: true, skipQueue: true, reason: "invalid_payload" };
    }

    const extracted = await extractExpenseFieldsFromText({
      normalizedText: normalized.normalizedText,
    });
    const validation = validateExpenseDraft(extracted.fields);
    if (!validation.ok) {
      await sendExpenseClarityPrompt(inbound.waId, 1);
      return { handled: true, skipQueue: true, reason: "clarity_requested" };
    }

    const draft = {
      sourceMessageId: inbound.messageId,
      originMessageType: normalized.sourceMessageType,
      normalizedInput: normalized.normalizedText,
      fields: validation.normalized,
      aiConfidence: extracted.aiConfidence,
      attachments: normalized.attachments,
    };

    const pendingMessageId = await sendExpenseConfirmationButtons(
      inbound.waId,
      draft,
    );
    await saveExpenseConversationState({
      waId: inbound.waId,
      draft,
      attemptCount: 0,
      lastPromptType: ExpensePromptType.CONFIRMATION,
      pendingMessageId,
      lastMessageId: inbound.messageId,
    });

    return { handled: true, skipQueue: true, reason: "confirmation_sent" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[expenses/service] processInboundExpenseSync:", errorMessage);

    if (
      /WhatsApp media metadata/i.test(errorMessage) ||
      /GraphMethodException/i.test(errorMessage)
    ) {
      await sendExpenseMediaAccessError(inbound.waId);
      return {
        handled: true,
        skipQueue: true,
        reason: "unsupported_media",
        errorMessage,
      };
    }

    return {
      handled: true,
      skipQueue: true,
      reason: "error",
      errorMessage,
    };
  }
}
