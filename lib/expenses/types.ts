import type { ExpensePromptType, ExpenseStatus } from "@prisma/client";

export const EXPENSE_CONFIRM_BUTTON_ID = "expense_confirm_register";
export const EXPENSE_CORRECT_BUTTON_ID = "expense_correct_data";

export const DEFAULT_EXPENSE_CURRENCY = "EUR";
export const DEFAULT_EXPENSE_CATEGORIES = [
  "alquiler",
  "suministros",
  "marketing",
  "transporte",
  "comidas",
  "software",
  "servicios_profesionales",
  "material_oficina",
  "otros",
] as const;

export type ExpenseCategory = (typeof DEFAULT_EXPENSE_CATEGORIES)[number];

export type ExpenseAttachmentDraft = {
  mediaType: "audio" | "image" | "document";
  metaMediaId: string | null;
  mimeType: string;
  sha256: string | null;
  filename: string | null;
  sizeBytes: number | null;
};

export type ExpenseDraftFields = {
  amount: number;
  currency: string;
  category: string;
  description: string;
  vendor: string | null;
  expenseDate: string;
};

export type ExpenseDraft = {
  sourceMessageId: string;
  originMessageType: string;
  normalizedInput: string;
  fields: ExpenseDraftFields;
  aiConfidence: number | null;
  attachments: ExpenseAttachmentDraft[];
};

export type ExpenseConversationDraftState = {
  draft: ExpenseDraft;
  attemptCount: number;
  lastPromptType: ExpensePromptType;
  pendingMessageId: string | null;
  lastMessageId: string | null;
  expiresAt: string;
};

export type ExpenseInboundInteractiveReply = {
  type: "button_reply" | "list_reply" | "nfm_reply" | string;
  buttonId?: string;
  buttonTitle?: string;
};

export type ExpenseInboundMessage = {
  waId: string;
  messageId: string;
  timestamp?: string;
  type: string;
  textBody?: string | null;
  interactiveReply?: ExpenseInboundInteractiveReply | null;
  message: Record<string, unknown>;
};

export type ExpenseProcessResult = {
  handled: boolean;
  skipQueue: boolean;
  reason:
    | "not_authorized"
    | "not_expense_message"
    | "duplicate_message"
    | "confirmation_sent"
    | "correction_requested"
    | "correction_reprocessed"
    | "clarity_requested"
    | "expense_confirmed"
    | "missing_state"
    | "unsupported_media"
    | "invalid_payload"
    | "error";
  errorMessage?: string;
};

export type ExpenseRecordStatus = ExpenseStatus;
