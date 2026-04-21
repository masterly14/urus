import { prisma } from "@/lib/prisma";
import { PlantillasListClient } from "./plantillas-list-client";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const templates = await prisma.contractTemplate.findMany({
    select: {
      id: true,
      documentKind: true,
      version: true,
      name: true,
      isActive: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      createdByUser: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const serializedTemplates = templates.map((template) => ({
    ...template,
    publishedAt: template.publishedAt?.toISOString() ?? null,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  }));

  return <PlantillasListClient templates={serializedTemplates} />;
}
