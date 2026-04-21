/**
 * Repositorio para MarketReport (M7 — Informe IA de Mercado).
 *
 * Persiste el informe en Neon, emite evento MARKET_INFORME_GENERADO
 * y expone queries para obtener el último informe o uno por id.
 */

import { prisma } from "@/lib/prisma";
import { appendEvent, type JsonValue } from "@/lib/event-store";
import type {
  MarketReport,
  MarketReportInputSnapshot,
  MarketReportRecord,
} from "./market-report-types";

export interface PersistMarketReportInput {
  ciudad: string;
  generatedBy: string;
  model: string;
  inputSnapshot: MarketReportInputSnapshot;
  report: MarketReport;
  tokensUsed?: number | null;
}

function toRecord(row: {
  id: string;
  ciudad: string;
  generatedBy: string;
  model: string;
  report: unknown;
  inputSnapshot: unknown;
  tokensUsed: number | null;
  generatedAt: Date;
}): MarketReportRecord {
  return {
    id: row.id,
    ciudad: row.ciudad,
    generatedBy: row.generatedBy,
    model: row.model,
    report: row.report as MarketReport,
    inputSnapshot: row.inputSnapshot as MarketReportInputSnapshot,
    tokensUsed: row.tokensUsed,
    generatedAt: row.generatedAt.toISOString(),
  };
}

export async function persistMarketReport(
  input: PersistMarketReportInput,
): Promise<MarketReportRecord> {
  const event = await appendEvent({
    type: "MARKET_INFORME_GENERADO",
    aggregateType: "MARKET",
    aggregateId: `market:${input.ciudad}`,
    payload: {
      ciudad: input.ciudad,
      generatedBy: input.generatedBy,
      confidence: input.report.confidence,
      zonasCount: input.report.zonasDestacadas.length,
      semaforos: input.report.posicionamientoUrus.semaforos,
      gapMedio: input.report.posicionamientoUrus.gapMedio,
    } as unknown as JsonValue,
  });

  const row = await prisma.marketReport.create({
    data: {
      ciudad: input.ciudad,
      generatedBy: input.generatedBy,
      model: input.model,
      inputSnapshot: JSON.parse(JSON.stringify(input.inputSnapshot)),
      report: JSON.parse(JSON.stringify(input.report)),
      tokensUsed: input.tokensUsed ?? null,
      lastEventId: event.id,
    },
    select: {
      id: true,
      ciudad: true,
      generatedBy: true,
      model: true,
      report: true,
      inputSnapshot: true,
      tokensUsed: true,
      generatedAt: true,
    },
  });

  return toRecord(row);
}

export async function getLatestMarketReport(
  ciudad: string,
): Promise<MarketReportRecord | null> {
  const row = await prisma.marketReport.findFirst({
    where: { ciudad },
    orderBy: { generatedAt: "desc" },
    select: {
      id: true,
      ciudad: true,
      generatedBy: true,
      model: true,
      report: true,
      inputSnapshot: true,
      tokensUsed: true,
      generatedAt: true,
    },
  });

  return row ? toRecord(row) : null;
}

export async function getMarketReportById(
  id: string,
): Promise<MarketReportRecord | null> {
  const row = await prisma.marketReport.findUnique({
    where: { id },
    select: {
      id: true,
      ciudad: true,
      generatedBy: true,
      model: true,
      report: true,
      inputSnapshot: true,
      tokensUsed: true,
      generatedAt: true,
    },
  });

  return row ? toRecord(row) : null;
}
