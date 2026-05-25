/**
 * Audita cruces históricos contra la nueva decisión geográfica del motor.
 *
 * Por defecto es read-only. Solo emite MATCH_INVALIDADO al pasar --apply.
 */
import "dotenv/config";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { evaluateLocationMatch } from "@/lib/matching";
import { buildDemandLocationContext } from "@/lib/matching/location-context";
import type { DemandForMatching, PropertyForMatching } from "@/lib/matching";
import type { JsonValue } from "@/lib/event-store/types";

interface CliOptions {
  demandId?: string;
  days: number;
  limit: number;
  apply: boolean;
  json: boolean;
}

interface MatchPayload {
  demandId?: string;
  demandRef?: string;
  demandNombre?: string;
  propertyId?: string;
  propertyRef?: string;
  totalScore?: number;
}

interface AuditLine {
  matchEventId: string;
  createdAt: string;
  demandId: string;
  demandRef: string;
  propertyId: string;
  propertyRef: string;
  totalScore: number;
  propertyLocation: string;
  demandZones: string;
  status: "valid" | "invalid" | "unknown";
  reason: string;
  invalidationEventId: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    days: 30,
    limit: 500,
    apply: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--apply") options.apply = true;
    else if (arg === "--json") options.json = true;
    else if (arg.startsWith("--demand=")) options.demandId = arg.slice("--demand=".length);
    else if (arg.startsWith("--days=")) options.days = Number(arg.slice("--days=".length));
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
  }

  if (!Number.isFinite(options.days) || options.days <= 0) options.days = 30;
  if (!Number.isFinite(options.limit) || options.limit <= 0) options.limit = 500;
  return options;
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readMatchPayload(value: unknown): MatchPayload {
  const record = payloadRecord(value);
  return {
    demandId: typeof record.demandId === "string" ? record.demandId : undefined,
    demandRef: typeof record.demandRef === "string" ? record.demandRef : undefined,
    demandNombre: typeof record.demandNombre === "string" ? record.demandNombre : undefined,
    propertyId: typeof record.propertyId === "string" ? record.propertyId : undefined,
    propertyRef: typeof record.propertyRef === "string" ? record.propertyRef : undefined,
    totalScore: typeof record.totalScore === "number" ? record.totalScore : undefined,
  };
}

function asDemandForMatching(row: {
  codigo: string;
  ref: string;
  nombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  metrosMin: number | null;
  metrosMax: number | null;
  tipoOperacion: string | null;
}): DemandForMatching {
  return {
    codigo: row.codigo,
    ref: row.ref,
    nombre: row.nombre,
    presupuestoMin: row.presupuestoMin,
    presupuestoMax: row.presupuestoMax,
    habitacionesMin: row.habitacionesMin,
    tipos: row.tipos,
    zonas: row.zonas,
    ...(row.metrosMin != null ? { metrosMin: row.metrosMin } : {}),
    ...(row.metrosMax != null ? { metrosMax: row.metrosMax } : {}),
    ...(row.tipoOperacion ? { tipoOperacion: row.tipoOperacion } : {}),
  };
}

function asPropertyForMatching(row: {
  codigo: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  ciudad: string;
  zona: string;
}): PropertyForMatching {
  return {
    codigo: row.codigo,
    ref: row.ref,
    titulo: row.titulo,
    tipoOfer: row.tipoOfer,
    precio: row.precio,
    metrosConstruidos: row.metrosConstruidos,
    habitaciones: row.habitaciones,
    ciudad: row.ciudad,
    zona: row.zona,
  };
}

async function buildAudit(options: CliOptions): Promise<AuditLine[]> {
  const since = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
  const where: Record<string, unknown> = {
    type: "MATCH_GENERADO",
    createdAt: { gte: since },
  };

  if (options.demandId) {
    where.payload = { path: ["demandId"], equals: options.demandId };
  }

  const matches = await prisma.event.findMany({
    where,
    orderBy: { position: "desc" },
    take: options.limit,
    select: {
      id: true,
      aggregateId: true,
      createdAt: true,
      payload: true,
    },
  });

  const demandIds = new Set<string>();
  const propertyIds = new Set<string>();
  for (const event of matches) {
    const payload = readMatchPayload(event.payload);
    if (payload.demandId) demandIds.add(payload.demandId);
    if (payload.propertyId) propertyIds.add(payload.propertyId);
  }

  const [demands, properties, invalidations] = await Promise.all([
    demandIds.size > 0
      ? prisma.demandCurrent.findMany({
          where: { codigo: { in: [...demandIds] } },
          select: {
            codigo: true,
            ref: true,
            nombre: true,
            presupuestoMin: true,
            presupuestoMax: true,
            habitacionesMin: true,
            tipos: true,
            zonas: true,
            metrosMin: true,
            metrosMax: true,
            tipoOperacion: true,
          },
        })
      : Promise.resolve([]),
    propertyIds.size > 0
      ? prisma.propertyCurrent.findMany({
          where: { codigo: { in: [...propertyIds] } },
          select: {
            codigo: true,
            ref: true,
            titulo: true,
            tipoOfer: true,
            precio: true,
            metrosConstruidos: true,
            habitaciones: true,
            ciudad: true,
            zona: true,
          },
        })
      : Promise.resolve([]),
    matches.length > 0
      ? prisma.$queryRaw<Array<{ id: string; payload: unknown }>>(
          Prisma.sql`
            SELECT id, payload
            FROM events
            WHERE type::text = 'MATCH_INVALIDADO'
              AND payload->>'matchEventId' IN (${Prisma.join(matches.map((match) => match.id))})
          `,
        )
      : Promise.resolve([]),
  ]);

  const demandMap = new Map(demands.map((demand) => [demand.codigo, demand]));
  const locationContextByDemandId = new Map(
    await Promise.all(
      demands.map(async (demand) => [
        demand.codigo,
        await buildDemandLocationContext(asDemandForMatching(demand)),
      ] as const),
    ),
  );
  const propertyMap = new Map(properties.map((property) => [property.codigo, property]));
  const invalidationByMatchId = new Map<string, string>();
  for (const invalidation of invalidations) {
    const payload = payloadRecord(invalidation.payload);
    const matchEventId = typeof payload.matchEventId === "string" ? payload.matchEventId : null;
    if (matchEventId) invalidationByMatchId.set(matchEventId, invalidation.id);
  }

  const audit: AuditLine[] = [];
  for (const event of matches) {
    const payload = readMatchPayload(event.payload);
    const demandId = payload.demandId ?? "";
    const propertyId = payload.propertyId ?? "";
    const demand = demandId ? demandMap.get(demandId) : null;
    const property = propertyId ? propertyMap.get(propertyId) : null;
    const invalidationEventId = invalidationByMatchId.get(event.id) ?? null;

    if (!demand || !property) {
      audit.push({
        matchEventId: event.id,
        createdAt: event.createdAt.toISOString(),
        demandId,
        demandRef: payload.demandRef ?? "",
        propertyId,
        propertyRef: payload.propertyRef ?? "",
        totalScore: payload.totalScore ?? 0,
        propertyLocation: property ? `${property.zona} (${property.ciudad})` : "(propiedad no encontrada)",
        demandZones: demand?.zonas ?? "(demanda no encontrada)",
        status: "unknown",
        reason: !demand ? "Demanda no encontrada" : "Propiedad no encontrada",
        invalidationEventId,
      });
      continue;
    }

    const decision = evaluateLocationMatch(
      asPropertyForMatching(property),
      asDemandForMatching(demand),
      locationContextByDemandId.get(demand.codigo),
    );
    const invalid = decision.demandHasConcreteZones && decision.status === "rejected";
    audit.push({
      matchEventId: event.id,
      createdAt: event.createdAt.toISOString(),
      demandId,
      demandRef: demand.ref,
      propertyId,
      propertyRef: property.ref,
      totalScore: payload.totalScore ?? 0,
      propertyLocation: `${property.zona} (${property.ciudad})`,
      demandZones: demand.zonas,
      status: invalid ? "invalid" : "valid",
      reason: decision.reason,
      invalidationEventId,
    });
  }

  return audit;
}

async function applyInvalidations(lines: AuditLine[]): Promise<AuditLine[]> {
  const updated: AuditLine[] = [];
  for (const line of lines) {
    if (line.status !== "invalid" || line.invalidationEventId) {
      updated.push(line);
      continue;
    }

    const invalidation = await appendEvent({
      type: "MATCH_INVALIDADO",
      aggregateType: "MATCH",
      aggregateId: `${line.demandId}:${line.propertyId}`,
      causationId: line.matchEventId,
      payload: {
        matchEventId: line.matchEventId,
        demandId: line.demandId,
        demandRef: line.demandRef,
        propertyId: line.propertyId,
        propertyRef: line.propertyRef,
        reason: line.reason,
        previousTotalScore: line.totalScore,
        source: "audit_geographic_matches",
      } as unknown as JsonValue,
    });
    updated.push({ ...line, invalidationEventId: invalidation.id });
  }
  return updated;
}

function printText(lines: AuditLine[], applied: boolean): void {
  const invalid = lines.filter((line) => line.status === "invalid");
  const valid = lines.filter((line) => line.status === "valid");
  const unknown = lines.filter((line) => line.status === "unknown");
  const alreadyInvalidated = invalid.filter((line) => line.invalidationEventId).length;

  console.log("== Auditoria geografica de cruces ==");
  console.log(`Cruces revisados: ${lines.length}`);
  console.log(`Validos: ${valid.length}`);
  console.log(`Invalidos geograficos: ${invalid.length}`);
  console.log(`Unknown: ${unknown.length}`);
  console.log(`Invalidaciones registradas: ${alreadyInvalidated}`);
  console.log(`Modo apply: ${applied ? "si" : "no (read-only)"}`);

  for (const line of invalid.slice(0, 30)) {
    console.log(
      `- ${line.matchEventId} demand=${line.demandRef || line.demandId} property=${line.propertyRef || line.propertyId} ` +
        `score=${line.totalScore} :: ${line.propertyLocation} vs ${line.demandZones} :: ${line.reason}` +
        `${line.invalidationEventId ? ` :: invalidado=${line.invalidationEventId}` : ""}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const initial = await buildAudit(options);
  const lines = options.apply ? await applyInvalidations(initial) : initial;

  if (options.json) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      filters: options,
      summary: {
        total: lines.length,
        valid: lines.filter((line) => line.status === "valid").length,
        invalid: lines.filter((line) => line.status === "invalid").length,
        unknown: lines.filter((line) => line.status === "unknown").length,
        invalidated: lines.filter((line) => line.invalidationEventId).length,
      },
      lines,
    }, null, 2));
  } else {
    printText(lines, options.apply);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

