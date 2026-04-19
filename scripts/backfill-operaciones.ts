/**
 * Backfill de operaciones históricas.
 *
 * Recorre LegalDocument con operationId sintético (OP-{propertyCode})
 * y crea filas Operacion preservando el código existente.
 * Luego vincula CommercialOperationFact con el operacionId creado.
 *
 * También resuelve demandId para operaciones existentes que no lo tengan,
 * consultando VisitSchedulingSession, MicrositeSelectionFeedback y MATCH_GENERADO.
 *
 * Ejecución: npx tsx scripts/backfill-operaciones.ts
 * Idempotente: omite documentos cuyo operationId ya existe como Operacion.codigo.
 */
import { PrismaClient } from "@prisma/client";
import { resolveDemandIdForProperty } from "../lib/operacion/resolve-demand";

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
  let demandsLinked = 0;

  for (const doc of docs) {
    const existing = await prisma.operacion.findFirst({
      where: { codigo: doc.operationId },
    });

    if (existing) {
      if (!existing.demandId) {
        const demandId = await resolveDemandIdForProperty(doc.propertyCode);
        if (demandId) {
          await prisma.operacion.update({
            where: { id: existing.id },
            data: { demandId },
          });
          demandsLinked++;
        }
      }
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
      const { resolveComercialFromAgente } = await import("../lib/routing/resolve-comercial");
      const comercial = await resolveComercialFromAgente(snapshot.agente);
      comercialId = comercial?.id ?? null;
    }

    const demandId = await resolveDemandIdForProperty(doc.propertyCode);
    if (demandId) demandsLinked++;

    const operacion = await prisma.operacion.create({
      data: {
        codigo: doc.operationId,
        propertyCode: doc.propertyCode,
        ciudad: snapshot?.ciudad ?? "",
        estado,
        closedAt,
        comercialId,
        demandId,
      },
    });

    created++;

    const updatedFacts = await prisma.commercialOperationFact.updateMany({
      where: { propertyCode: doc.propertyCode, operacionId: null },
      data: { operacionId: operacion.id },
    });

    factsLinked += updatedFacts.count;
  }

  // Second pass: patch existing operaciones without demandId
  const opsWithoutDemand = await prisma.operacion.findMany({
    where: { demandId: null },
    select: { id: true, propertyCode: true },
  });

  console.log(`[backfill] ${opsWithoutDemand.length} operaciones sin demandId — resolviendo...`);
  let patchedExisting = 0;

  for (const op of opsWithoutDemand) {
    const demandId = await resolveDemandIdForProperty(op.propertyCode);
    if (demandId) {
      await prisma.operacion.update({
        where: { id: op.id },
        data: { demandId },
      });
      patchedExisting++;
    }
  }

  console.log(
    `[backfill] Completado: ${created} creadas, ${skipped} omitidas, ${factsLinked} facts vinculados, ${demandsLinked + patchedExisting} demandas vinculadas (${patchedExisting} existentes parcheadas)`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
