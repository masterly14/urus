import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createWabaTemplatesClient, type WabaTemplatesClientConfig } from "./meta-client";
import type { WabaTemplate } from "./types";

export type SyncWhatsAppTemplatesResult = {
  fetched: number;
  upserted: number;
  syncedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function upsertTemplate(template: WabaTemplate, syncedAt: Date): Promise<void> {
  await prisma.whatsAppTemplate.upsert({
    where: {
      name_language: {
        name: template.name,
        language: template.language,
      },
    },
    create: {
      wabaTemplateId: template.id,
      name: template.name,
      language: template.language,
      status: template.status,
      category: template.category ?? null,
      components: toJson(template.components),
      raw: toJson(template),
      syncedAt,
    },
    update: {
      wabaTemplateId: template.id,
      status: template.status,
      category: template.category ?? null,
      components: toJson(template.components),
      raw: toJson(template),
      syncedAt,
    },
  });
}

export async function syncWhatsAppTemplates(
  config: WabaTemplatesClientConfig = {},
): Promise<SyncWhatsAppTemplatesResult> {
  const client = createWabaTemplatesClient(config);
  const templates = await client.listTemplates();
  const syncedAt = new Date();

  for (const template of templates) {
    await upsertTemplate(template, syncedAt);
  }

  return {
    fetched: templates.length,
    upserted: templates.length,
    syncedAt: syncedAt.toISOString(),
  };
}
