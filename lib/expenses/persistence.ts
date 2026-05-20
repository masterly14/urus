import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCloudinary } from "@/lib/cloudinary/client";
import { uploadContractDocument } from "@/lib/cloudinary/upload-document";
import { uploadWhatsAppAudio } from "@/lib/cloudinary/upload-whatsapp-audio";
import {
  downloadWhatsAppMedia,
  getWhatsAppMediaMetadata,
} from "@/lib/whatsapp/media";
import type { ExpenseDraft } from "./types";
import {
  costTypeFromBucket,
  defaultExpenseBucket,
} from "@/lib/finance/category-cost-type";
import { findBestRecurringExpectedExpense } from "@/lib/finance/recurring/match";

async function uploadExpenseAttachment(
  waId: string,
  sourceMessageId: string,
  attachment: ExpenseDraft["attachments"][number],
): Promise<string | null> {
  const mediaId = attachment.metaMediaId;
  if (!mediaId) return null;

  const metadata = await getWhatsAppMediaMetadata(mediaId);
  const downloaded = await downloadWhatsAppMedia(metadata.url);
  const mime = metadata.mimeType || attachment.mimeType;

  if (attachment.mediaType === "audio") {
    const uploaded = await uploadWhatsAppAudio({
      buffer: downloaded.buffer,
      mediaId,
      waId,
      mimeType: mime,
      messageId: sourceMessageId,
      tags: ["expense"],
    });
    return uploaded.secureUrl;
  }

  if (attachment.mediaType === "document") {
    const uploaded = await uploadContractDocument({
      buffer: downloaded.buffer,
      fileName: attachment.filename || `expense-${mediaId}.pdf`,
      folder: `whatsapp/expenses/${waId}/documents`,
      tags: ["expense", "whatsapp_expense"],
      context: {
        wa_id: waId,
        media_id: mediaId,
        source_message_id: sourceMessageId,
      },
    });
    return uploaded.secureUrl;
  }

  const cloudinary = getCloudinary();
  const dataUri = `data:${mime};base64,${downloaded.buffer.toString("base64")}`;
  const uploaded = await cloudinary.uploader.upload(dataUri, {
    resource_type: "image",
    folder: `whatsapp/expenses/${waId}/images`,
    public_id: mediaId,
    overwrite: true,
    invalidate: true,
    tags: ["expense", "whatsapp_expense_image"],
  });
  return uploaded.secure_url ?? null;
}

export async function persistConfirmedExpenseFromDraft(input: {
  waId: string;
  draft: ExpenseDraft;
  createdByRole: string;
}): Promise<{ id: string }> {
  const existing = await prisma.expense.findUnique({
    where: { sourceMessageId: input.draft.sourceMessageId },
    select: { id: true },
  });
  if (existing) {
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    const bucket = defaultExpenseBucket(input.draft.fields.category);
    const expenseDate = new Date(input.draft.fields.expenseDate);
    const periodFrom = new Date(
      Date.UTC(expenseDate.getUTCFullYear(), expenseDate.getUTCMonth(), 1),
    );
    const periodTo = new Date(
      Date.UTC(expenseDate.getUTCFullYear(), expenseDate.getUTCMonth() + 1, 1),
    );

    const expectedCandidates = await tx.expense.findMany({
      where: {
        status: "EXPECTED",
        recurringExpenseId: { not: null },
        expenseDate: {
          gte: periodFrom,
          lt: periodTo,
        },
      },
      select: {
        id: true,
        vendor: true,
      },
    });
    const recurringMatch = findBestRecurringExpectedExpense(
      input.draft.fields.vendor,
      expectedCandidates,
    );

    const expenseData = {
      waId: input.waId,
      sourceMessageId: input.draft.sourceMessageId,
      amount: input.draft.fields.amount,
      currency: input.draft.fields.currency,
      category: input.draft.fields.category,
      bucket,
      costType: costTypeFromBucket(bucket),
      description: input.draft.fields.description,
      vendor: input.draft.fields.vendor,
      expenseDate,
      status: "CONFIRMED" as const,
      rawInput: {
        normalizedInput: input.draft.normalizedInput,
        originMessageType: input.draft.originMessageType,
        attachments: input.draft.attachments,
        recurringMatchScore: recurringMatch?.score ?? null,
      } as Prisma.InputJsonValue,
      aiConfidence: input.draft.aiConfidence,
      createdByRole: input.createdByRole,
      confirmedAt: new Date(),
    };

    const created = recurringMatch
      ? await tx.expense.update({
          where: { id: recurringMatch.expenseId },
          data: expenseData,
          select: { id: true },
        })
      : await tx.expense.create({
          data: expenseData,
          select: { id: true },
        });

    for (const attachment of input.draft.attachments) {
      const cloudinaryUrl = await uploadExpenseAttachment(
        input.waId,
        input.draft.sourceMessageId,
        attachment,
      );

      await tx.expenseAttachment.create({
        data: {
          expenseId: created.id,
          mediaType: attachment.mediaType,
          metaMediaId: attachment.metaMediaId,
          cloudinaryUrl,
          mimeType: attachment.mimeType,
          sha256: attachment.sha256,
          filename: attachment.filename,
          sizeBytes: attachment.sizeBytes,
        },
      });
    }

    return created;
  });
}
