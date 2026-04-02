/**
 * Backfill de operaciones históricas.
 *
 * Recorre LegalDocument con operationId sintético (OP-{propertyCode})
 * y crea filas Operacion preservando el código existente.
 * Luego vincula CommercialOperationFact con el operacionId creado.
 *
 * Ejecución: npx tsx scripts/backfill-operaciones.ts
 * Idempotente: omite documentos cuyo operationId ya existe como Operacion.codigo.
 */
import { PrismaClient } from "@/app/generated/prisma/client";

const prisma = new PrismaClient();

async function main() {
  const docs = await prisma.legalDocument.findMany({
    where: { operationId: { startsWith: "OP-" } },
    select: { operationId: true, propertyCode: true },
    distinct: ["operationId"],
  });

  console.log(`[backfill] ${docs.length} operationId(s) sintéticos encontrados`);

  let created = 0;
  let skipped = 0;
  let factsLinked = 0;

  for (const doc of docs) {
    const existing = await prisma.operacion.findFirst({
      where: { codigo: doc.operationId },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const closedEvent = await prisma.event.findFirst({
      where: {
        type: "OPERACION_CERRADA",
        aggregateId: doc.propertyCode,
      },
      orderBy: { occurredAt: "desc" },
      select: { payload: true, occurredAt: true },
    });

    const closedPayload = (closedEvent?.payload ?? {}) as Record<string, unknown>;
    const newEstado = typeof closedPayload.newEstado === "string"
      ? closedPayload.newEstado.toLowerCase()
      : "";

    let estado: "CERRADA_VENTA" | "CERRADA_ALQUILER" | "CERRADA_TRASPASO" | "EN_CURSO" = "EN_CURSO";
    if (newEstado.includes("vendid")) estado = "CERRADA_VENTA";
    else if (newEstado.includes("alquilad")) estado = "CERRADA_ALQUILER";
    else if (newEstado.includes("traspaso")) estado = "CERRADA_TRASPASO";

    const closedAt = closedEvent?.occurredAt ?? null;

    const snapshot = await prisma.propertySnapshot.findUnique({
      where: { codigo: doc.propertyCode },
      select: { ciudad: true, agente: true },
    });

    let comercialId: string | null = null;
    if (snapshot?.agente) {
      const comercial = await prisma.comercial.findFirst({
        where: { nombre: snapshot.agente.trim() },
        select: { id: true },
      });
      comercialId = comercial?.id ?? null;
    }

    const operacion = await prisma.operacion.create({
      data: {
        codigo: doc.operationId,
        propertyCode: doc.propertyCode,
        ciudad: snapshot?.ciudad ?? "",
        estado,
        closedAt,
        comercialId,
      },
    });

    created++;

    const updatedFacts = await prisma.commercialOperationFact.updateMany({
      where: { propertyCode: doc.propertyCode, operacionId: null },
      data: { operacionId: operacion.id },
    });

    factsLinked += updatedFacts.count;
  }

  console.log(
    `[backfill] Completado: ${created} creadas, ${skipped} omitidas, ${factsLinked} facts vinculados`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
