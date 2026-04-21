/**
 * PDF generation for Market Report (M7 — Smart Pricing).
 * Uses pdf-lib (same dependency as lib/nota-encargo/generate-pdf.ts).
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
  type RGB,
} from "pdf-lib";
import type { MarketReport, MarketReportRecord } from "./market-report-types";

const MARGIN = 50;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const TITLE_SIZE = 16;
const H1_SIZE = 12;
const H2_SIZE = 10;
const BODY_SIZE = 9;
const SMALL_SIZE = 7.5;

const DARK: RGB = rgb(0.1, 0.1, 0.1);
const GOLD: RGB = rgb(0.72, 0.58, 0.2);
const GRAY: RGB = rgb(0.4, 0.4, 0.4);
const GREEN: RGB = rgb(0.13, 0.77, 0.37);
const AMBER: RGB = rgb(0.96, 0.62, 0.04);
const RED: RGB = rgb(0.93, 0.26, 0.21);

function semaforoRGB(s: string): RGB {
  if (s === "verde") return GREEN;
  if (s === "amarillo") return AMBER;
  return RED;
}

const MAX_CHARS = 90;

function wrap(text: string, maxChars = MAX_CHARS): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

interface DrawCtx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
}

function ensureSpace(ctx: DrawCtx, need: number): DrawCtx {
  if (ctx.y - need < MARGIN) {
    const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
    return { ...ctx, page, y: PAGE_H - MARGIN };
  }
  return ctx;
}

function drawSection(ctx: DrawCtx, title: string): DrawCtx {
  ctx = ensureSpace(ctx, 30);
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 2 },
    end: { x: PAGE_W - MARGIN, y: ctx.y + 2 },
    thickness: 0.5,
    color: GOLD,
  });
  ctx.page.drawText(title, {
    x: MARGIN,
    y: ctx.y - H1_SIZE,
    size: H1_SIZE,
    font: ctx.fontBold,
    color: GOLD,
  });
  ctx.y -= H1_SIZE + 12;
  return ctx;
}

function drawParagraph(
  ctx: DrawCtx,
  text: string,
  color: RGB = DARK,
  size = BODY_SIZE,
): DrawCtx {
  const lines = wrap(text, Math.round(MAX_CHARS * (BODY_SIZE / size)));
  const lh = size * 1.6;
  for (const line of lines) {
    ctx = ensureSpace(ctx, lh + 4);
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y,
      size,
      font: ctx.font,
      color,
    });
    ctx.y -= lh;
  }
  ctx.y -= 4;
  return ctx;
}

function drawBullet(
  ctx: DrawCtx,
  text: string,
  color: RGB = DARK,
  bulletColor?: RGB,
): DrawCtx {
  const lines = wrap(text, MAX_CHARS - 4);
  const lh = BODY_SIZE * 1.6;
  for (let i = 0; i < lines.length; i++) {
    ctx = ensureSpace(ctx, lh + 2);
    if (i === 0) {
      ctx.page.drawText("•", {
        x: MARGIN + 4,
        y: ctx.y,
        size: BODY_SIZE,
        font: ctx.fontBold,
        color: bulletColor ?? GOLD,
      });
    }
    ctx.page.drawText(lines[i], {
      x: MARGIN + 16,
      y: ctx.y,
      size: BODY_SIZE,
      font: ctx.font,
      color,
    });
    ctx.y -= lh;
  }
  return ctx;
}

function drawKV(
  ctx: DrawCtx,
  label: string,
  value: string,
  valueColor: RGB = DARK,
): DrawCtx {
  const lh = BODY_SIZE * 1.6;
  ctx = ensureSpace(ctx, lh + 2);
  ctx.page.drawText(`${label}: `, {
    x: MARGIN,
    y: ctx.y,
    size: BODY_SIZE,
    font: ctx.fontBold,
    color: GRAY,
  });
  ctx.page.drawText(value, {
    x: MARGIN + ctx.fontBold.widthOfTextAtSize(`${label}: `, BODY_SIZE),
    y: ctx.y,
    size: BODY_SIZE,
    font: ctx.font,
    color: valueColor,
  });
  ctx.y -= lh;
  return ctx;
}

export async function generateMarketReportPdf(
  record: MarketReportRecord,
): Promise<Buffer> {
  const report: MarketReport = record.report;
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let ctx: DrawCtx = {
    doc,
    page,
    y: PAGE_H - MARGIN,
    font: helvetica,
    fontBold: helveticaBold,
  };

  // ── Header ────────────────────────────────────────────────────────────────
  ctx.page.drawText("INFORME DE MERCADO — URUS CAPITAL GROUP", {
    x: MARGIN,
    y: ctx.y,
    size: TITLE_SIZE,
    font: ctx.fontBold,
    color: DARK,
  });
  ctx.y -= TITLE_SIZE + 6;

  ctx.page.drawText(
    `Ciudad: ${record.ciudad}  ·  Fecha: ${new Date(record.generatedAt).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })}`,
    {
      x: MARGIN,
      y: ctx.y,
      size: SMALL_SIZE,
      font: ctx.font,
      color: GRAY,
    },
  );
  ctx.y -= SMALL_SIZE + 4;

  ctx.page.drawText(
    `Modelo: ${record.model}  ·  Confianza: ${Math.round(report.confidence * 100)}%`,
    {
      x: MARGIN,
      y: ctx.y,
      size: SMALL_SIZE,
      font: ctx.font,
      color: GRAY,
    },
  );
  ctx.y -= SMALL_SIZE + 12;

  // ── Resumen Ejecutivo ─────────────────────────────────────────────────────
  ctx = drawSection(ctx, "RESUMEN EJECUTIVO");
  ctx = drawParagraph(ctx, report.resumenEjecutivo);

  // ── Panorama de Mercado ───────────────────────────────────────────────────
  ctx = drawSection(ctx, "PANORAMA DE MERCADO");
  ctx = drawKV(ctx, "Oferta total", `${report.panoramaMercado.ofertaTotal} inmuebles`);
  ctx = drawKV(ctx, "Rango €/m²", report.panoramaMercado.rangoM2);
  ctx = drawKV(ctx, "Demanda global", report.panoramaMercado.demandaGlobal.toUpperCase());
  ctx.y -= 4;
  ctx = drawParagraph(ctx, report.panoramaMercado.descripcion);

  // ── Zonas Destacadas ──────────────────────────────────────────────────────
  ctx = drawSection(ctx, "ZONAS DESTACADAS");
  for (const z of report.zonasDestacadas) {
    ctx = ensureSpace(ctx, 40);
    ctx.page.drawText(`${z.zona} — ${z.precioMedioM2.toLocaleString("es-ES")} €/m²`, {
      x: MARGIN,
      y: ctx.y,
      size: H2_SIZE,
      font: ctx.fontBold,
      color: DARK,
    });
    ctx.y -= H2_SIZE + 4;
    ctx = drawParagraph(ctx, z.interpretacion, GRAY);
    if (z.oportunidad) {
      ctx = drawBullet(ctx, `Oportunidad: ${z.oportunidad}`, DARK, GREEN);
    }
    ctx.y -= 2;
  }

  // ── Posicionamiento URUS ──────────────────────────────────────────────────
  ctx = drawSection(ctx, "POSICIONAMIENTO URUS");
  const pos = report.posicionamientoUrus;
  ctx = drawKV(ctx, "Propiedades con informe", `${pos.totalPropiedades}`);
  ctx = drawKV(ctx, "Semáforo verde", `${pos.semaforos.verde}`, GREEN);
  ctx = drawKV(ctx, "Semáforo amarillo", `${pos.semaforos.amarillo}`, AMBER);
  ctx = drawKV(ctx, "Semáforo rojo", `${pos.semaforos.rojo}`, RED);
  ctx = drawKV(
    ctx,
    "Diferencia media vs mercado",
    `${pos.gapMedio > 0 ? "+" : ""}${pos.gapMedio.toFixed(1)}%`,
    pos.gapMedio > 5 ? RED : pos.gapMedio > 0 ? AMBER : GREEN,
  );
  ctx.y -= 4;
  ctx = drawParagraph(ctx, pos.concentracionGeografica, GRAY);
  ctx = drawParagraph(ctx, pos.diagnostico);

  // ── Oportunidades ─────────────────────────────────────────────────────────
  ctx = drawSection(ctx, "OPORTUNIDADES");
  for (const op of report.oportunidades) {
    ctx = drawBullet(ctx, op, DARK, GREEN);
  }

  // ── Riesgos ───────────────────────────────────────────────────────────────
  ctx = drawSection(ctx, "RIESGOS");
  for (const r of report.riesgos) {
    ctx = drawBullet(ctx, r, DARK, RED);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.y -= 16;
  ctx = ensureSpace(ctx, 20);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 2 },
    end: { x: PAGE_W - MARGIN, y: ctx.y + 2 },
    thickness: 0.3,
    color: GRAY,
  });
  ctx.page.drawText(
    `Generado automáticamente por URUS Smart Pricing · ${new Date(record.generatedAt).toISOString()}`,
    {
      x: MARGIN,
      y: ctx.y - SMALL_SIZE - 2,
      size: SMALL_SIZE,
      font: ctx.font,
      color: GRAY,
    },
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
