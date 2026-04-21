import { prisma } from "@/lib/prisma";
import { PlantillasListClient } from "./plantillas-list-client";

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

  return <PlantillasListClient templates={templates} />;
}
