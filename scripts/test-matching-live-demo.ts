/**
 * Demo en vivo del Smart Matching (M5).
 *
 * Simula el flujo completo con datos realistas del mercado inmobiliario español:
 *
 *   1. Crea 5 demandas activas (compradores reales con criterios distintos).
 *   2. Inyecta 3 propiedades nuevas una por una.
 *   3. Para cada propiedad, ejecuta el pipeline completo:
 *      PROPIEDAD_CREADA → consumer → matching → MATCH_GENERADO → projection.
 *   4. Muestra en consola el desglose de scoring por cada cruce.
 *   5. Simula feedback del comprador: "otra zona, más metros".
 *   6. Re-cruza y muestra cómo cambian los resultados.
 *   7. Limpia todo al terminar (--no-cleanup para inspeccionar).
 *
 * Usa BD real (Neon). NO toca servicios externos (WA, Statefox, OpenAI).
 *
 * USO:
 *   npx tsx scripts/test-matching-live-demo.ts
 *   npx tsx scripts/test-matching-live-demo.ts --no-cleanup
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { appendEvent } from "../lib/event-store";
import { enqueueJob } from "../lib/job-queue";
import { runConsumerCycle } from "../lib/workers/consumer";
import { runProjectionCycle } from "../lib/projections";
import { computeMatchScore } from "../lib/matching/scoring";
import type { PropertyForMatching, DemandForMatching } from "../lib/matching/types";

// ─── Config ──────────────────────────────────────────────────────────────────

const RUN_ID = `match-demo-${Date.now()}`;
const WORKER_ID = `match-demo-worker-${Date.now()}`;
const NO_CLEANUP = process.argv.includes("--no-cleanup");

const allEventIds: string[] = [];
const allCorrelationIds: string[] = [];
const allDemandIds: string[] = [];
const allPropertyIds: string[] = [];

function cid(suffix: string): string {
  const id = `${RUN_ID}:${suffix}`;
  allCorrelationIds.push(id);
  return id;
}

// ─── Colores para consola ────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bg_green: "\x1b[42m",
  bg_red: "\x1b[41m",
  bg_yellow: "\x1b[43m",
};

function header(text: string) {
  console.log(`\n${C.bold}${C.cyan}${"═".repeat(80)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${text}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${"═".repeat(80)}${C.reset}\n`);
}

function subheader(text: string) {
  console.log(`\n${C.bold}${C.magenta}  ── ${text} ──${C.reset}\n`);
}

function scoreBar(score: number, max: number = 100): string {
  const pct = Math.round((score / max) * 100);
  const filled = Math.round(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  const color = pct >= 70 ? C.green : pct >= 50 ? C.yellow : C.red;
  return `${color}${bar}${C.reset} ${pct}%`;
}

function criterionLine(label: string, score: number, reason: string): string {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? C.green : pct >= 50 ? C.yellow : C.red;
  const indicator = pct >= 70 ? "●" : pct >= 50 ? "◐" : pct > 0 ? "◔" : "○";
  return `    ${color}${indicator}${C.reset} ${label.padEnd(14)} ${color}${String(pct).padStart(3)}%${C.reset}  ${C.dim}${reason}${C.reset}`;
}

// ─── Test data ───────────────────────────────────────────────────────────────

interface DemandSeed {
  id: string;
  nombre: string;
  telefono: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  descripcion: string;
}

interface PropertySeed {
  id: string;
  ref: string;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  ciudad: string;
  zona: string;
}

const DEMANDS: DemandSeed[] = [
  {
    id: `DEM-A-${RUN_ID}`,
    nombre: "Familia García — busca piso céntrico",
    telefono: "34600100001",
    presupuestoMin: 200_000,
    presupuestoMax: 300_000,
    habitacionesMin: 3,
    tipos: "Piso",
    zonas: "Centro, Casco Histórico",
    descripcion: "Familia con 2 hijos, busca piso en zona centro de Córdoba. Presupuesto hasta 300K.",
  },
  {
    id: `DEM-B-${RUN_ID}`,
    nombre: "Inversor Ruiz — busca local comercial",
    telefono: "34600100002",
    presupuestoMin: 80_000,
    presupuestoMax: 200_000,
    habitacionesMin: 0,
    tipos: "Local, Oficina",
    zonas: "Centro, Tendillas",
    descripcion: "Inversor busca local comercial en zona comercial de Córdoba.",
  },
  {
    id: `DEM-C-${RUN_ID}`,
    nombre: "Pareja López — busca ático luminoso",
    telefono: "34600100003",
    presupuestoMin: 180_000,
    presupuestoMax: 280_000,
    habitacionesMin: 2,
    tipos: "Ático, Dúplex, Piso",
    zonas: "Brillante, Ciudad Jardín, Centro",
    descripcion: "Pareja joven sin hijos, busca ático o dúplex con terraza.",
  },
  {
    id: `DEM-D-${RUN_ID}`,
    nombre: "Sr. Fernández — busca chalet familiar",
    telefono: "34600100004",
    presupuestoMin: 350_000,
    presupuestoMax: 600_000,
    habitacionesMin: 4,
    tipos: "Chalet, Villa, Casa",
    zonas: "Alcolea, Trassierra, Periurbano",
    descripcion: "Familia numerosa, busca chalet con jardín en zona periurbana.",
  },
  {
    id: `DEM-E-${RUN_ID}`,
    nombre: "Estudiante Martínez — busca estudio barato",
    telefono: "34600100005",
    presupuestoMin: 50_000,
    presupuestoMax: 120_000,
    habitacionesMin: 0,
    tipos: "Estudio, Loft, Piso",
    zonas: "Ciudad Jardín, Fátima, Sector Sur",
    descripcion: "Joven estudiante buscando su primera vivienda económica.",
  },
];

const PROPERTIES: PropertySeed[] = [
  {
    id: `PROP-1-${RUN_ID}`,
    ref: `URUS-DEMO-001`,
    titulo: "Piso reformado en pleno Centro — 3 hab, luminoso",
    tipoOfer: "Piso",
    precio: 245_000,
    metrosConstruidos: 95,
    habitaciones: 3,
    ciudad: "Córdoba",
    zona: "Centro",
  },
  {
    id: `PROP-2-${RUN_ID}`,
    ref: `URUS-DEMO-002`,
    titulo: "Ático con terraza panorámica — Brillante",
    tipoOfer: "Ático",
    precio: 265_000,
    metrosConstruidos: 85,
    habitaciones: 2,
    ciudad: "Córdoba",
    zona: "Brillante",
  },
  {
    id: `PROP-3-${RUN_ID}`,
    ref: `URUS-DEMO-003`,
    titulo: "Nave comercial zona Tendillas — 120m²",
    tipoOfer: "Local",
    precio: 175_000,
    metrosConstruidos: 120,
    habitaciones: 0,
    ciudad: "Córdoba",
    zona: "Tendillas",
  },
];

// ─── Pipeline helpers ────────────────────────────────────────────────────────

async function drainPipeline(maxCycles = 50): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxCycles; i++) {
    const c = await runConsumerCycle({ workerId: WORKER_ID });
    const p = await runProjectionCycle({ workerId: WORKER_ID });
    total += c.processed + p.processed;
    if (c.noWork && p.noWork) break;
  }
  return total;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function setup() {
  header("SETUP — Creando datos de prueba");

  for (const d of DEMANDS) {
    allDemandIds.push(d.id);
    const corrId = cid(`demand-${d.id}`);
    const ev = await appendEvent({
      type: "DEMANDA_CREADA",
      aggregateType: "DEMAND",
      aggregateId: d.id,
      payload: {
        snapshot: {
          codigo: d.id,
          ref: `.demo.${d.id.slice(-4)}.`,
          nombre: d.nombre,
          estadoId: "20",
          estadoNombre: "Buscando",
          presupuestoMin: d.presupuestoMin,
          presupuestoMax: d.presupuestoMax,
          habitacionesMin: d.habitacionesMin,
          tipos: d.tipos,
          zonas: d.zonas,
          fechaActualizacion: new Date().toISOString(),
          agente: "demo-agent",
          telefono: d.telefono,
        },
      },
      correlationId: corrId,
    });
    allEventIds.push(ev.id);

    await enqueueJob({
      type: "PROCESS_EVENT",
      payload: { eventId: ev.id },
      idempotencyKey: `process_event:${ev.id}`,
      sourceEventId: ev.id,
    });

    await prisma.demandSnapshot.upsert({
      where: { codigo: d.id },
      create: {
        codigo: d.id,
        ref: `.demo.${d.id.slice(-4)}.`,
        nombre: d.nombre,
        estadoId: "20",
        estadoNombre: "Buscando",
        presupuestoMin: d.presupuestoMin,
        presupuestoMax: d.presupuestoMax,
        habitacionesMin: d.habitacionesMin,
        tipos: d.tipos,
        zonas: d.zonas,
        fechaActualizacion: new Date().toISOString(),
        agente: "demo-agent",
        raw: {
          telefono: d.telefono,
          keycli: `CLI-DEMO-${d.id.slice(-4)}`,
          keyagente: `AGT-DEMO-${d.id.slice(-4)}`,
          tipopropiedad: d.tipos.split(",")[0].trim(),
        },
      },
      update: {},
    });

    console.log(`  ${C.green}+${C.reset} ${d.nombre}`);
    console.log(`    ${C.dim}${d.descripcion}${C.reset}`);
    console.log(`    ${C.dim}Zonas: ${d.zonas} | Tipos: ${d.tipos} | ${d.presupuestoMin.toLocaleString("es-ES")}€–${d.presupuestoMax.toLocaleString("es-ES")}€ | ≥${d.habitacionesMin} hab${C.reset}`);
  }

  const processed = await drainPipeline();
  console.log(`\n  ${C.dim}Pipeline drenado: ${processed} tareas procesadas${C.reset}`);

  const count = await prisma.demandCurrent.count({
    where: { codigo: { in: allDemandIds } },
  });
  console.log(`  ${C.green}✓${C.reset} ${count} demandas activas en demands_current`);
}

// ─── Scoring visual ──────────────────────────────────────────────────────────

function showMatchDetail(
  property: PropertyForMatching,
  demand: DemandForMatching,
  demandDesc: string,
) {
  const { totalScore, matchScore, isMatch } = computeMatchScore(property, demand);
  const statusLabel = isMatch
    ? `${C.bg_green}${C.bold} MATCH ${C.reset}`
    : `${C.bg_red}${C.bold} NO MATCH ${C.reset}`;

  console.log(`  ${statusLabel} vs ${C.bold}${demandDesc}${C.reset}`);
  console.log(`    Score total: ${scoreBar(totalScore)}`);
  console.log(criterionLine("Zona", matchScore.zone.score, matchScore.zone.reason));
  console.log(criterionLine("Precio", matchScore.price.score, matchScore.price.reason));
  console.log(criterionLine("Tipología", matchScore.type.score, matchScore.type.reason));
  console.log(criterionLine("Superficie", matchScore.size.score, matchScore.size.reason));
  console.log(criterionLine("Habitaciones", matchScore.rooms.score, matchScore.rooms.reason));
  console.log();
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function ingestProperty(prop: PropertySeed): Promise<void> {
  subheader(`Nueva propiedad: ${prop.titulo}`);
  console.log(`  ${C.cyan}Ref:${C.reset} ${prop.ref}`);
  console.log(`  ${C.cyan}Tipo:${C.reset} ${prop.tipoOfer} | ${C.cyan}Precio:${C.reset} ${prop.precio.toLocaleString("es-ES")}€ | ${C.cyan}Metros:${C.reset} ${prop.metrosConstruidos}m² | ${C.cyan}Hab:${C.reset} ${prop.habitaciones}`);
  console.log(`  ${C.cyan}Ubicación:${C.reset} ${prop.zona}, ${prop.ciudad}`);

  allPropertyIds.push(prop.id);
  const corrId = cid(`prop-${prop.id}`);
  const ev = await appendEvent({
    type: "PROPIEDAD_CREADA",
    aggregateType: "PROPERTY",
    aggregateId: prop.id,
    payload: {
      snapshot: {
        codigo: prop.id,
        ref: prop.ref,
        titulo: prop.titulo,
        tipoOfer: prop.tipoOfer,
        precio: prop.precio,
        metrosConstruidos: prop.metrosConstruidos,
        habitaciones: prop.habitaciones,
        banyos: 1,
        ciudad: prop.ciudad,
        zona: prop.zona,
        estado: "Activo",
        fechaAlta: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        numFotos: 8,
        agente: "demo-agent",
      },
    },
    correlationId: corrId,
  });
  allEventIds.push(ev.id);

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: ev.id },
    idempotencyKey: `process_event:${ev.id}`,
    sourceEventId: ev.id,
  });

  console.log(`\n  ${C.dim}Procesando pipeline...${C.reset}`);
  const processed = await drainPipeline();
  console.log(`  ${C.dim}${processed} tareas procesadas${C.reset}\n`);

  // Show scoring detail for each demand
  const propForMatch: PropertyForMatching = {
    codigo: prop.id,
    ref: prop.ref,
    titulo: prop.titulo,
    tipoOfer: prop.tipoOfer,
    precio: prop.precio,
    metrosConstruidos: prop.metrosConstruidos,
    habitaciones: prop.habitaciones,
    ciudad: prop.ciudad,
    zona: prop.zona,
  };

  const demands = await prisma.demandCurrent.findMany({
    where: { codigo: { in: allDemandIds } },
  });

  let matchCount = 0;
  for (const d of demands) {
    const demForMatch: DemandForMatching = {
      codigo: d.codigo,
      ref: d.ref,
      nombre: d.nombre,
      presupuestoMin: d.presupuestoMin,
      presupuestoMax: d.presupuestoMax,
      habitacionesMin: d.habitacionesMin,
      tipos: d.tipos,
      zonas: d.zonas,
    };
    const seedDesc = DEMANDS.find((s) => s.id === d.codigo)?.nombre ?? d.nombre;
    const { isMatch } = computeMatchScore(propForMatch, demForMatch);
    if (isMatch) matchCount++;
    showMatchDetail(propForMatch, demForMatch, seedDesc);
  }

  // Verify events in event store
  const matchEvents = await prisma.event.findMany({
    where: {
      type: "MATCH_GENERADO",
      correlationId: corrId,
    },
  });

  console.log(`  ${C.bold}Resumen:${C.reset} ${C.green}${matchCount} matches${C.reset} de ${demands.length} demandas evaluadas`);
  console.log(`  ${C.bold}Eventos MATCH_GENERADO:${C.reset} ${matchEvents.length} en el Event Store`);
  if (matchEvents.length > 0) {
    for (const me of matchEvents) {
      const p = me.payload as Record<string, unknown>;
      console.log(`    ${C.green}→${C.reset} ${p.demandRef ?? p.demandId} ↔ ${p.propertyRef ?? p.propertyId} (score: ${p.totalScore})`);
    }
  }
}

// ─── Feedback del comprador (simula DEMANDA_ACTUALIZADA) ─────────────────────

async function simulateBuyerFeedback(): Promise<void> {
  header("FEEDBACK DEL COMPRADOR — Ajuste de demanda");

  const targetDemand = DEMANDS[0];
  console.log(`  ${C.bold}Comprador:${C.reset} ${targetDemand.nombre}`);
  console.log(`  ${C.bold}Mensaje simulado:${C.reset} "El piso del Centro me gustó pero necesito más metros,`);
  console.log(`  al menos 100m². Y también miraría en Ciudad Jardín."`);
  console.log();

  const before = await prisma.demandCurrent.findUnique({
    where: { codigo: targetDemand.id },
  });
  console.log(`  ${C.dim}ANTES:  zonas="${before?.zonas}" | metros=sin criterio${C.reset}`);

  const corrId = cid("feedback");
  const ev = await appendEvent({
    type: "DEMANDA_ACTUALIZADA",
    aggregateType: "DEMAND",
    aggregateId: targetDemand.id,
    payload: {
      variables: {
        zonas: ["Centro", "Casco Histórico", "Ciudad Jardín"],
        metrosMin: 100,
      },
      detectedAt: new Date().toISOString(),
      source: { channel: "whatsapp_feedback", test: true },
    },
    correlationId: corrId,
  });
  allEventIds.push(ev.id);

  await enqueueJob({
    type: "PROCESS_EVENT",
    payload: { eventId: ev.id },
    idempotencyKey: `process_event:${ev.id}`,
    sourceEventId: ev.id,
  });

  const processed = await drainPipeline();
  console.log(`  ${C.dim}Pipeline drenado: ${processed} tareas procesadas${C.reset}`);

  const after = await prisma.demandCurrent.findUnique({
    where: { codigo: targetDemand.id },
  });
  console.log(`  ${C.dim}DESPUÉS: zonas="${after?.zonas}" | metros=actualización procesada${C.reset}`);

  const prop = PROPERTIES[0];
  const propForMatch: PropertyForMatching = {
    codigo: prop.id,
    ref: prop.ref,
    titulo: prop.titulo,
    tipoOfer: prop.tipoOfer,
    precio: prop.precio,
    metrosConstruidos: prop.metrosConstruidos,
    habitaciones: prop.habitaciones,
    ciudad: prop.ciudad,
    zona: prop.zona,
  };

  console.log(`\n  ${C.bold}Comparación ANTES / DESPUÉS del feedback:${C.reset}`);
  console.log(`  ${C.bold}Propiedad: ${prop.titulo}${C.reset}\n`);

  const demBefore: DemandForMatching = {
    codigo: before!.codigo,
    ref: before!.ref,
    nombre: before!.nombre,
    presupuestoMin: before!.presupuestoMin,
    presupuestoMax: before!.presupuestoMax,
    habitacionesMin: before!.habitacionesMin,
    tipos: before!.tipos,
    zonas: before!.zonas,
  };
  console.log(`  ${C.bold}${C.yellow}▸ ANTES del feedback:${C.reset}`);
  showMatchDetail(propForMatch, demBefore, `${targetDemand.nombre} (ORIGINAL)`);

  const demAfter: DemandForMatching = {
    codigo: after!.codigo,
    ref: after!.ref,
    nombre: after!.nombre,
    presupuestoMin: after!.presupuestoMin,
    presupuestoMax: after!.presupuestoMax,
    habitacionesMin: after!.habitacionesMin,
    tipos: after!.tipos,
    zonas: after!.zonas ?? "Centro, Casco Histórico, Ciudad Jardín",
    metrosMin: 100,
  };
  console.log(`  ${C.bold}${C.green}▸ DESPUÉS del feedback (zonas ampliadas + metrosMin=100):${C.reset}`);
  showMatchDetail(propForMatch, demAfter, `${targetDemand.nombre} (ACTUALIZADA)`);

  const { totalScore: scoreBefore } = computeMatchScore(propForMatch, demBefore);
  const { totalScore: scoreAfter } = computeMatchScore(propForMatch, demAfter);
  const delta = scoreAfter - scoreBefore;
  const deltaColor = delta > 0 ? C.green : delta < 0 ? C.red : C.dim;
  console.log(`  ${C.bold}Impacto:${C.reset} Score ${scoreBefore} → ${scoreAfter} (${deltaColor}${delta > 0 ? "+" : ""}${delta}${C.reset})`);
  console.log(`  ${C.yellow}Nota:${C.reset} Con metrosMin=100m², el piso de 95m² recibe penalización en superficie.`);
  console.log(`  El sistema NO descarta — penaliza proporcionalmente para dar oportunidad al comercial.`);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  if (NO_CLEANUP) {
    console.log(`\n  ${C.yellow}Cleanup omitido (--no-cleanup).${C.reset}`);
    console.log(`  IDs para inspección:`);
    console.log(`    Demandas: ${allDemandIds.join(", ")}`);
    console.log(`    Propiedades: ${allPropertyIds.join(", ")}`);
    return;
  }

  console.log(`\n  ${C.dim}Limpiando datos de test...${C.reset}`);

  const testEvents = await prisma.event.findMany({
    where: { correlationId: { in: allCorrelationIds } },
    select: { id: true },
  });
  const testEventIds = [...new Set([...allEventIds, ...testEvents.map((e) => e.id)])];

  if (testEventIds.length > 0) {
    await prisma.jobQueue.deleteMany({
      where: { sourceEventId: { in: testEventIds } },
    });
  }

  await prisma.event.deleteMany({
    where: { correlationId: { in: allCorrelationIds } },
  });

  await prisma.propertyCurrent.deleteMany({
    where: { codigo: { in: allPropertyIds } },
  });
  await prisma.demandCurrent.deleteMany({
    where: { codigo: { in: allDemandIds } },
  });
  await prisma.demandSnapshot.deleteMany({
    where: { codigo: { in: allDemandIds } },
  });

  console.log(`  ${C.green}✓${C.reset} Cleanup completado`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  header("SMART MATCHING — Demo en tiempo real");
  console.log(`  Run ID: ${C.bold}${RUN_ID}${C.reset}`);
  console.log(`  Base de datos: ${C.bold}Neon (producción)${C.reset}`);
  console.log(`  Servicios externos: ${C.dim}ninguno (demo offline)${C.reset}`);

  try {
    await setup();

    header("FASE 1 — Ingesta de propiedades y cruce automático");

    for (const prop of PROPERTIES) {
      await ingestProperty(prop);
    }

    await simulateBuyerFeedback();

    header("DEMO COMPLETADA");
    console.log(`  ${C.green}✓${C.reset} 5 demandas activas creadas y proyectadas`);
    console.log(`  ${C.green}✓${C.reset} 3 propiedades ingestadas con cruce automático`);
    console.log(`  ${C.green}✓${C.reset} Eventos MATCH_GENERADO emitidos al Event Store`);
    console.log(`  ${C.green}✓${C.reset} Feedback del comprador procesado y demanda actualizada`);
    console.log(`  ${C.green}✓${C.reset} Re-cruce con criterios actualizados`);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`\n${C.red}ERROR FATAL:${C.reset}`, err);
  process.exit(1);
});
