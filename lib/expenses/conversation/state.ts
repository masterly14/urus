import { ExpensePromptType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  ExpenseConversationDraftState,
  ExpenseDraft,
} from "../types";

const DEFAULT_TTL_MINUTES = Number(process.env.EXPENSE_CONVERSATION_TTL_MINUTES ?? "30");

function getTtlMinutes(): number {
  if (Number.isFinite(DEFAULT_TTL_MINUTES) && DEFAULT_TTL_MINUTES > 0) {
    return DEFAULT_TTL_MINUTES;
  }
  return 30;
}

export function buildExpenseStateExpiry(now = new Date()): Date {
  return new Date(now.getTime() + getTtlMinutes() * 60 * 1000);
}

function parseDraft(raw: Prisma.JsonValue): ExpenseDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const draft = raw as Record<string, unknown>;
  if (
    typeof draft.sourceMessageId !== "string" ||
    typeof draft.originMessageType !== "string" ||
    typeof draft.normalizedInput !== "string"
  ) {
    return null;
  }
  return draft as unknown as ExpenseDraft;
}

export async function getExpenseConversationState(
  waId: string,
): Promise<ExpenseConversationDraftState | null> {
  const row = await prisma.expenseConversationState.findUnique({
    where: { waId },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.expenseConversationState.delete({ where: { waId } }).catch(() => {});
    return null;
  }

  const draft = parseDraft(row.draft as Prisma.JsonValue);
  if (!draft) return null;

  return {
    draft,
    attemptCount: row.attemptCount,
    lastPromptType: row.lastPromptType,
    pendingMessageId: row.pendingMessageId,
    lastMessageId: row.lastMessageId,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function saveExpenseConversationState(input: {
  waId: string;
  draft: ExpenseDraft;
  attemptCount: number;
  lastPromptType: ExpensePromptType;
  pendingMessageId: string | null;
  lastMessageId: string | null;
  expiresAt?: Date;
}): Promise<void> {
  await prisma.expenseConversationState.upsert({
    where: { waId: input.waId },
    create: {
      waId: input.waId,
      draft: input.draft as unknown as Prisma.InputJsonValue,
      attemptCount: input.attemptCount,
      lastPromptType: input.lastPromptType,
      pendingMessageId: input.pendingMessageId,
      lastMessageId: input.lastMessageId,
      expiresAt: input.expiresAt ?? buildExpenseStateExpiry(),
    },
    update: {
      draft: input.draft as unknown as Prisma.InputJsonValue,
      attemptCount: input.attemptCount,
      lastPromptType: input.lastPromptType,
      pendingMessageId: input.pendingMessageId,
      lastMessageId: input.lastMessageId,
      expiresAt: input.expiresAt ?? buildExpenseStateExpiry(),
    },
  });
}

export async function deleteExpenseConversationState(waId: string): Promise<void> {
  await prisma.expenseConversationState.delete({ where: { waId } }).catch(() => {});
}
