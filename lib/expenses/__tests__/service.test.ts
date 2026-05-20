import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpensePromptType } from "@prisma/client";

const mockExpenseFindUnique = vi.fn();
const mockIsAuthorized = vi.fn();
const mockIsTestWaId = vi.fn();
const mockNormalize = vi.fn();
const mockExtract = vi.fn();
const mockValidate = vi.fn();
const mockGetState = vi.fn();
const mockSaveState = vi.fn();
const mockDeleteState = vi.fn();
const mockSendButtons = vi.fn();
const mockSendCorrectionPrompt = vi.fn();
const mockSendClarityPrompt = vi.fn();
const mockSendMediaAccessError = vi.fn();
const mockSendPersistedMessage = vi.fn();
const mockPersistExpense = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    expense: {
      findUnique: (...args: unknown[]) => mockExpenseFindUnique(...args),
    },
  },
}));

vi.mock("../security", () => ({
  isAuthorizedExpenseWaId: (...args: unknown[]) => mockIsAuthorized(...args),
  isExpenseTestWaId: (...args: unknown[]) => mockIsTestWaId(...args),
}));

vi.mock("../recognition/normalizer", () => ({
  normalizeExpenseInboundMessage: (...args: unknown[]) => mockNormalize(...args),
}));

vi.mock("../recognition/extract", () => ({
  extractExpenseFieldsFromText: (...args: unknown[]) => mockExtract(...args),
}));

vi.mock("../recognition/validate", () => ({
  validateExpenseDraft: (...args: unknown[]) => mockValidate(...args),
}));

vi.mock("../conversation/state", () => ({
  getExpenseConversationState: (...args: unknown[]) => mockGetState(...args),
  saveExpenseConversationState: (...args: unknown[]) => mockSaveState(...args),
  deleteExpenseConversationState: (...args: unknown[]) => mockDeleteState(...args),
}));

vi.mock("../conversation/confirmation", () => ({
  sendExpenseConfirmationButtons: (...args: unknown[]) => mockSendButtons(...args),
  sendExpenseCorrectionPrompt: (...args: unknown[]) => mockSendCorrectionPrompt(...args),
  sendExpenseClarityPrompt: (...args: unknown[]) => mockSendClarityPrompt(...args),
  sendExpenseMediaAccessError: (...args: unknown[]) => mockSendMediaAccessError(...args),
  sendExpensePersistedMessage: (...args: unknown[]) => mockSendPersistedMessage(...args),
}));

vi.mock("../persistence", () => ({
  persistConfirmedExpenseFromDraft: (...args: unknown[]) => mockPersistExpense(...args),
}));

import { processInboundExpenseSync } from "../service";

describe("processInboundExpenseSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAuthorized.mockResolvedValue(true);
    mockIsTestWaId.mockReturnValue(false);
    mockExpenseFindUnique.mockResolvedValue(null);
    mockGetState.mockResolvedValue(null);
    mockSendButtons.mockResolvedValue("wamid.expense.confirmation");
  });

  it("procesa texto de gasto y envía confirmación sin encolar", async () => {
    mockNormalize.mockResolvedValue({
      sourceMessageType: "text",
      normalizedText: "pagué 49.90 eur de gasolina",
      attachments: [],
    });
    mockExtract.mockResolvedValue({
      fields: {
        amount: 49.9,
        currency: "EUR",
        category: "transporte",
        description: "gasolina",
        vendor: "Repsol",
        expenseDate: "2026-05-19T12:00:00.000Z",
      },
      aiConfidence: 0.91,
    });
    mockValidate.mockReturnValue({
      ok: true,
      normalized: {
        amount: 49.9,
        currency: "EUR",
        category: "transporte",
        description: "gasolina",
        vendor: "Repsol",
        expenseDate: "2026-05-19T12:00:00.000Z",
      },
    });

    const result = await processInboundExpenseSync({
      waId: "34600111222",
      messageId: "wamid.1",
      type: "text",
      textBody: "Gasto 49.90 EUR gasolina",
      message: { type: "text", text: { body: "Gasto 49.90 EUR gasolina" } },
    });

    expect(result).toMatchObject({
      handled: true,
      skipQueue: true,
      reason: "confirmation_sent",
    });
    expect(mockSaveState).toHaveBeenCalledTimes(1);
  });

  it("confirma gasto desde botón y limpia estado conversacional", async () => {
    mockGetState.mockResolvedValue({
      draft: {
        sourceMessageId: "wamid.original",
        originMessageType: "text",
        normalizedInput: "texto",
        fields: {
          amount: 80,
          currency: "EUR",
          category: "marketing",
          description: "Campaña local",
          vendor: "Meta",
          expenseDate: "2026-05-19T12:00:00.000Z",
        },
        aiConfidence: 0.88,
        attachments: [],
      },
      attemptCount: 0,
      lastPromptType: ExpensePromptType.CONFIRMATION,
      pendingMessageId: "wamid.pending",
      lastMessageId: "wamid.prev",
      expiresAt: "2026-05-19T13:00:00.000Z",
    });

    const result = await processInboundExpenseSync({
      waId: "34600111222",
      messageId: "wamid.confirm",
      type: "interactive",
      interactiveReply: {
        type: "button_reply",
        buttonId: "expense_confirm_register",
      },
      message: {
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "expense_confirm_register" },
        },
      },
    });

    expect(result.reason).toBe("expense_confirmed");
    expect(mockPersistExpense).toHaveBeenCalledTimes(1);
    expect(mockDeleteState).toHaveBeenCalledTimes(1);
  });

  it("si supera intentos de corrección solicita mayor claridad", async () => {
    mockGetState.mockResolvedValue({
      draft: {
        sourceMessageId: "wamid.original",
        originMessageType: "text",
        normalizedInput: "gasto",
        fields: {
          amount: 10,
          currency: "EUR",
          category: "otros",
          description: "prueba",
          vendor: null,
          expenseDate: "2026-05-19T12:00:00.000Z",
        },
        aiConfidence: 0.4,
        attachments: [],
      },
      attemptCount: 3,
      lastPromptType: ExpensePromptType.CORRECTION,
      pendingMessageId: "wamid.pending",
      lastMessageId: "wamid.prev",
      expiresAt: "2026-05-19T13:00:00.000Z",
    });

    const result = await processInboundExpenseSync({
      waId: "34600111222",
      messageId: "wamid.correction.4",
      type: "text",
      textBody: "era 12.50",
      message: { type: "text", text: { body: "era 12.50" } },
    });

    expect(result.reason).toBe("clarity_requested");
    expect(mockSendClarityPrompt).toHaveBeenCalledTimes(1);
  });

  it("deduplica cuando message.id ya fue registrado", async () => {
    mockExpenseFindUnique.mockResolvedValue({ id: "exp_1" });

    const result = await processInboundExpenseSync({
      waId: "34600111222",
      messageId: "wamid.dup",
      type: "text",
      textBody: "gasto 20 eur",
      message: { type: "text", text: { body: "gasto 20 eur" } },
    });

    expect(result).toMatchObject({
      handled: true,
      skipQueue: true,
      reason: "duplicate_message",
    });
  });

  it("acepta texto libre cuando el waId es de sandbox de pruebas", async () => {
    mockIsTestWaId.mockReturnValue(true);
    mockNormalize.mockResolvedValue({
      sourceMessageType: "text",
      normalizedText: "esto no contiene keyword pero debe entrar por sandbox",
      attachments: [],
    });
    mockExtract.mockResolvedValue({
      fields: {
        amount: 12,
        currency: "EUR",
        category: "otros",
        description: "prueba sandbox",
        vendor: null,
        expenseDate: "2026-05-19T12:00:00.000Z",
      },
      aiConfidence: 0.8,
    });
    mockValidate.mockReturnValue({
      ok: true,
      normalized: {
        amount: 12,
        currency: "EUR",
        category: "otros",
        description: "prueba sandbox",
        vendor: null,
        expenseDate: "2026-05-19T12:00:00.000Z",
      },
    });

    const result = await processInboundExpenseSync({
      waId: "573113541077",
      messageId: "wamid.sandbox.text",
      type: "text",
      textBody: "hola",
      message: { type: "text", text: { body: "hola" } },
    });

    expect(result.reason).toBe("confirmation_sent");
    expect(mockSaveState).toHaveBeenCalledTimes(1);
  });

  it("si falla media metadata responde como unsupported_media y avisa al usuario", async () => {
    mockNormalize.mockRejectedValue(
      new Error("WhatsApp media metadata 123 failed (400): GraphMethodException"),
    );

    const result = await processInboundExpenseSync({
      waId: "573113541077",
      messageId: "wamid.media.fail",
      type: "image",
      message: { type: "image", image: { id: "123" } },
    });

    expect(result.reason).toBe("unsupported_media");
    expect(mockSendMediaAccessError).toHaveBeenCalledWith("573113541077");
  });

  it("si el texto no trae datos de gasto suficientes pide formato guiado", async () => {
    mockNormalize.mockResolvedValue({
      sourceMessageType: "text",
      normalizedText: "Registra un gasto",
      attachments: [],
    });
    mockExtract.mockResolvedValue({
      fields: {
        amount: 0,
        currency: "EUR",
        category: "otros",
        description: "Gasto operativo",
        vendor: null,
        expenseDate: "2026-05-19T12:00:00.000Z",
      },
      aiConfidence: 0.2,
    });
    mockValidate.mockReturnValue({
      ok: false,
      errors: ["El importe debe ser mayor que 0."],
    });

    const result = await processInboundExpenseSync({
      waId: "573113541077",
      messageId: "wamid.missing.fields",
      type: "text",
      textBody: "Registra un gasto",
      message: { type: "text", text: { body: "Registra un gasto" } },
    });

    expect(result.reason).toBe("clarity_requested");
    expect(mockSendClarityPrompt).toHaveBeenCalledTimes(1);
  });
});
