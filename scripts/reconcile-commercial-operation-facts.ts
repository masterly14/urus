import "dotenv/config";

import { prisma } from "@/lib/prisma";

interface CliOptions {
  apply: boolean;
  limit: number;
  from?: Date;
  to?: Date;
}

interface PriceCandidate {
  price: number;
  source: string;
  propertyRef?: string;
  ciudad?: string;
  zona?: string;
}

type JsonRecord = Record<string, unknown>;

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let limit = 500;
  let from: Date | undefined;
  let to: Date | undefined;

  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.slice("--limit=".length));
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.floor(parsed);
      continue;
    }
    if (arg.startsWith("--from=")) {
      from = parseDate(arg.slice("--from=".length));
      continue;
    }
    if (arg.startsWith("--to=")) {
      to = parseDate(arg.slice("--to=".length));
    }
  }

  return { apply, limit, from, to };
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function fromPropertyLike(
  source: string,
  value: JsonRecord | null,
): PriceCandidate | null {
  if (!value) return null;
  const price = toPositiveNumber(value.precio) ?? toPositiveNumber(value.price);
  if (price == null) return null;
  return {
    price,
    source,
    propertyRef: typeof value.ref === "string" ? value.ref : undefined,
    ciudad: typeof value.ciudad === "string" ? value.ciudad : undefined,
    zona: typeof value.zona === "string" ? value.zona : undefined,
  };
}

function fromEventPayload(
  source: string,
  payloadValue: unknown,
): PriceCandidate | null {
  const payload = asRecord(payloadValue);
  if (!payload) return null;

  return (
    fromPropertyLike(`${source}.snapshot`, asRecord(payload.snapshot)) ??
    fromPropertyLike(`${source}.after`, asRecord(payload.after)) ??
    fromPropertyLike(source, payload)
  );
}

async function resolveCandidateForFact(input: {
  propertyCode: string;
  sourceEventId: string;
}): Promise<PriceCandidate | null> {
  const [snapshot, current, sourceEvent] = await Promise.all([
    prisma.propertySnapshot.findUnique({
      where: { codigo: input.propertyCode },
      select: { precio: true, ref: true, ciudad: true, zona: true },
    }),
    prisma.propertyCurrent.findUnique({
      where: { codigo: input.propertyCode },
      select: { precio: true, ref: true, ciudad: true, zona: true },
    }),
    prisma.event.findUnique({
      where: { id: input.sourceEventId },
      select: { payload: true },
    }),
  ]);

  const fromSnapshot =
    snapshot && snapshot.precio > 0
      ? {
          price: snapshot.precio,
          source: "propertySnapshot.precio",
          propertyRef: snapshot.ref,
          ciudad: snapshot.ciudad,
          zona: snapshot.zona,
        }
      : null;
  if (fromSnapshot) return fromSnapshot;

  const fromCurrent =
    current && current.precio > 0
      ? {
          price: current.precio,
          source: "propertyCurrent.precio",
          propertyRef: current.ref,
          ciudad: current.ciudad,
          zona: current.zona,
        }
      : null;
  if (fromCurrent) return fromCurrent;

  const fromSourceEvent = fromEventPayload("sourceEvent.payload", sourceEvent?.payload);
  if (fromSourceEvent) return fromSourceEvent;

  const sourcePayload = asRecord(sourceEvent?.payload);
  const linkedStatusEventId =
    sourcePayload && typeof sourcePayload.sourceEstadoCambiadoEventId === "string"
      ? sourcePayload.sourceEstadoCambiadoEventId
      : null;

  if (linkedStatusEventId) {
    const linkedStatusEvent = await prisma.event.findUnique({
      where: { id: linkedStatusEventId },
      select: { payload: true },
    });
    const fromLinkedEvent = fromEventPayload(
      "linkedStatusEvent.payload",
      linkedStatusEvent?.payload,
    );
    if (fromLinkedEvent) return fromLinkedEvent;
  }

  const recentPropertyEvents = await prisma.event.findMany({
    where: {
      aggregateId: input.propertyCode,
      type: { in: ["PROPIEDAD_CREADA", "PROPIEDAD_MODIFICADA", "ESTADO_CAMBIADO"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { payload: true, type: true },
  });

  for (const event of recentPropertyEvents) {
    const candidate = fromEventPayload(`propertyEvent.${event.type}`, event.payload);
    if (candidate) return candidate;
  }

  return null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const where: {
    grossAmountEur: null;
    closedAt?: { gte?: Date; lte?: Date };
  } = { grossAmountEur: null };
  if (options.from || options.to) {
    where.closedAt = {};
    if (options.from) where.closedAt.gte = options.from;
    if (options.to) where.closedAt.lte = options.to;
  }

  const facts = await prisma.commercialOperationFact.findMany({
    where,
    orderBy: { closedAt: "desc" },
    take: options.limit,
    select: {
      id: true,
      sourceEventId: true,
      propertyCode: true,
      operacionId: true,
      newEstado: true,
      closedAt: true,
      propertyRef: true,
      ciudad: true,
      zona: true,
    },
  });

  let reconciled = 0;
  let unresolved = 0;
  const unresolvedRows: Array<{
    factId: string;
    propertyCode: string;
    sourceEventId: string;
    closedAt: string;
    newEstado: string;
  }> = [];

  for (const fact of facts) {
    const candidate = await resolveCandidateForFact({
      propertyCode: fact.propertyCode,
      sourceEventId: fact.sourceEventId,
    });

    if (!candidate) {
      unresolved++;
      unresolvedRows.push({
        factId: fact.id,
        propertyCode: fact.propertyCode,
        sourceEventId: fact.sourceEventId,
        closedAt: fact.closedAt.toISOString(),
        newEstado: fact.newEstado,
      });
      continue;
    }

    if (options.apply) {
      await prisma.commercialOperationFact.update({
        where: { id: fact.id },
        data: {
          grossAmountEur: candidate.price,
          propertyRef: fact.propertyRef || candidate.propertyRef || "",
          ciudad: fact.ciudad || candidate.ciudad || "",
          zona: fact.zona || candidate.zona || "",
        },
      });
    }

    reconciled++;
    console.log(
      `[reconcile-commercial-operation-facts] fact=${fact.id} property=${fact.propertyCode} source=${candidate.source} price=${candidate.price}`,
    );
  }

  console.log("[reconcile-commercial-operation-facts] summary");
  console.log(`  mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`  range.from: ${options.from?.toISOString() ?? "none"}`);
  console.log(`  range.to: ${options.to?.toISOString() ?? "none"}`);
  console.log(`  scannedFacts: ${facts.length}`);
  console.log(`  reconciled: ${reconciled}`);
  console.log(`  unresolved: ${unresolved}`);

  if (unresolvedRows.length > 0) {
    console.log("[reconcile-commercial-operation-facts] unresolvedRows");
    console.log(JSON.stringify(unresolvedRows, null, 2));
  }
}

main()
  .catch((err) => {
    console.error("[reconcile-commercial-operation-facts] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
