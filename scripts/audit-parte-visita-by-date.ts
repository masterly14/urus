/**
 * Auditoría de Partes de Visita para un día concreto (Europe/Madrid).
 *
 * Uso:
 *   npx tsx scripts/audit-parte-visita-by-date.ts --date 2026-06-03
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { resolveComercial } from "../lib/routing/resolve-comercial";
import { normalizeComercialWhatsappPhone } from "../lib/routing/comercial-whatsapp";

const TZ = "Europe/Madrid";
const SEP = "═".repeat(72);

function parseArgs(argv: string[]): { date: string } {
  let date = "";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--date") date = argv[++i];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error("Uso: npx tsx scripts/audit-parte-visita-by-date.ts --date YYYY-MM-DD");
    process.exit(1);
  }
  return { date };
}

/** Ventana [inicio, fin) del día civil en Europe/Madrid → UTC. */
function madridDayBounds(dateYmd: string): { start: Date; end: Date } {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  const offsetMatch = parts?.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? Number(offsetMatch[1]) : 2;
  const start = new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function fmtMadrid(d: Date): string {
  return d.toLocaleString("es-ES", { timeZone: TZ });
}

function fmtIso(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

type Verdict =
  | "ENVIADO_OK"
  | "NO_ENVIADO_PENDING"
  | "NO_ENVIADO_SIN_QSTASH"
  | "PUBLICACION_QSTASH_FALLIDA"
  | "CANCELADA"
  | "AVANZADO_POST_ENVIO";

async function qstashEventsForSession(
  sessionId: string,
  since: Date,
): Promise<Array<{ state?: string; url?: string; createdAt?: number; body?: string }>> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return [];
  try {
    const res = await fetch(
      `https://qstash.upstash.io/v2/events?count=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: Array<Record<string, unknown>> };
    const events = data.events ?? [];
    return events
      .filter((e) => {
        const url = String(e.url ?? "");
        const body = String(e.body ?? "");
        return (
          url.includes("/api/parte-visita/send") &&
          (body.includes(sessionId) || url.includes(sessionId))
        );
      })
      .map((e) => ({
        state: String(e.state ?? ""),
        url: String(e.url ?? ""),
        createdAt: typeof e.createdAt === "number" ? e.createdAt : undefined,
        body: String(e.body ?? "").slice(0, 120),
      }));
  } catch {
    return [];
  }
}

async function main() {
  const { date } = parseArgs(process.argv);
  const { start, end } = madridDayBounds(date);
  const now = new Date();

  console.log(`\n${SEP}`);
  console.log(`  AUDITORÍA PARTES DE VISITA — ${date} (${TZ})`);
  console.log(SEP);
  console.log(`Ventana UTC: ${fmtIso(start)} → ${fmtIso(end)}`);
  console.log(`Generado: ${fmtMadrid(now)} (${fmtIso(now)})`);

  const sessions = await prisma.parteVisitaSession.findMany({
    where: { visitDateTime: { gte: start, lt: end } },
    orderBy: { visitDateTime: "asc" },
  });

  const parteCreatedSameDay = await prisma.parteVisitaSession.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
  });

  const visitsConfirmed = await prisma.visitSchedulingSession.findMany({
    where: {
      confirmedSlotStart: { gte: start, lt: end },
      state: { in: ["VISIT_CONFIRMED", "VISIT_COMPLETED"] },
    },
    orderBy: { confirmedSlotStart: "asc" },
    select: {
      id: true,
      state: true,
      confirmedSlotStart: true,
      buyerWaId: true,
      visitorPhone: true,
      propertyCode: true,
      comercialId: true,
      calendarEventId: true,
    },
  });

  const parteByVisitId = new Map(sessions.map((s) => [s.visitSessionId, s]));
  const visitsSinParte = visitsConfirmed.filter((v) => !parteByVisitId.has(v.id));

  console.log(`\nResumen cuantitativo:`);
  console.log(`  ParteVisitaSession (visitDateTime en día) : ${sessions.length}`);
  console.log(`  Visitas confirmadas/completadas (slot)    : ${visitsConfirmed.length}`);
  console.log(`  Visitas sin ParteVisitaSession            : ${visitsSinParte.length}`);
  console.log(`  Parte creadas ese día (createdAt)         : ${parteCreatedSameDay.length}`);

  const pendingHastaFinDia = await prisma.parteVisitaSession.findMany({
    where: {
      state: "PENDING",
      visitDateTime: { gte: new Date(start.getTime() - 48 * 3600_000), lt: end },
    },
    orderBy: { visitDateTime: "asc" },
  });
  if (pendingHastaFinDia.length > 0) {
    console.log(`  PENDING con visita ≤ fin del día (±48h)   : ${pendingHastaFinDia.length}`);
  }

  const buckets: Record<Verdict, typeof sessions> = {
    ENVIADO_OK: [],
    NO_ENVIADO_PENDING: [],
    NO_ENVIADO_SIN_QSTASH: [],
    PUBLICACION_QSTASH_FALLIDA: [],
    CANCELADA: [],
    AVANZADO_POST_ENVIO: [],
  };

  type Row = {
    session: (typeof sessions)[0];
    verdict: Verdict;
    comercialWa: string | null;
    comercialNombre: string | null;
    whatsappSends: number;
    qstashId: string | null;
    publishError: string | null;
    legacyJob: string | null;
    visitState: string | null;
    qstashEvents: number;
    notas: string[];
  };

  const rows: Row[] = [];

  for (const s of sessions) {
    const visit = await prisma.visitSchedulingSession.findUnique({
      where: { id: s.visitSessionId },
      select: { state: true, calendarEventId: true, confirmedSlotStart: true },
    });
    const comercial = await resolveComercial({
      comercialId: s.comercialId,
      requireActive: false,
    });
    const comercialWa = normalizeComercialWhatsappPhone(comercial);

    const whatsappSends = await prisma.event.findMany({
      where: {
        type: "WHATSAPP_ENVIADO",
        aggregateType: "WHATSAPP_CONVERSATION",
        occurredAt: { gte: new Date(s.createdAt.getTime() - 60_000) },
        OR: [
          { payload: { path: ["parteVisitaSessionId"], equals: s.id } },
          { payload: { path: ["sessionId"], equals: s.id } },
        ],
      },
      select: { id: true, occurredAt: true, payload: true, aggregateId: true },
      orderBy: { occurredAt: "asc" },
    });

    const legacyJob = await prisma.jobQueue.findFirst({
      where: {
        type: "PARTE_VISITA_ENVIAR_FORMULARIO",
        OR: [
          { payload: { path: ["sessionId"], equals: s.id } },
          { idempotencyKey: { startsWith: `parte_visita_formulario:${s.id}` } },
        ],
      },
      select: { id: true, status: true, attempts: true, lastError: true, availableAt: true },
    });

    const qstashEv = await qstashEventsForSession(s.id, s.createdAt);

    const notas: string[] = [];
    let verdict: Verdict;

    if (s.state === "CANCELADA") {
      verdict = "CANCELADA";
    } else if (s.state === "PENDING") {
      if (!s.qstashMessageId && s.schedulePublishError) {
        verdict = "PUBLICACION_QSTASH_FALLIDA";
        notas.push("Publish a QStash falló al crear/programar.");
      } else if (!s.qstashMessageId) {
        verdict = "NO_ENVIADO_SIN_QSTASH";
        notas.push("Sin qstashMessageId — nunca programado en QStash.");
      } else {
        verdict = "NO_ENVIADO_PENDING";
        notas.push(
          "QStash programado pero sigue PENDING — callback no ejecutó o rescate no corrió.",
        );
      }
    } else if (
      s.state === "FORMULARIO_ENVIADO" ||
      whatsappSends.some((e) => {
        const k = (e.payload as { kind?: string }).kind;
        return (
          k === "parte_visita_formulario_flow" ||
          k === "parte_visita_formulario_template"
        );
      })
    ) {
      verdict = "ENVIADO_OK";
    } else {
      verdict = "AVANZADO_POST_ENVIO";
      notas.push(`Estado ${s.state} sin traza clara de formulario en eventos.`);
    }

    if (legacyJob) {
      notas.push(
        `Job legacy ${legacyJob.id} status=${legacyJob.status} attempts=${legacyJob.attempts}`,
      );
    }
    if (whatsappSends.length === 0 && verdict.startsWith("NO_ENVIADO")) {
      notas.push("Sin eventos WHATSAPP_ENVIADO al comercial.");
    }
    if (qstashEv.length > 0) {
      notas.push(`QStash events API: ${qstashEv.length} hit(s).`);
    }

    buckets[verdict].push(s);
    rows.push({
      session: s,
      verdict,
      comercialWa,
      comercialNombre: comercial?.nombre ?? null,
      whatsappSends: whatsappSends.length,
      qstashId: s.qstashMessageId,
      publishError: s.schedulePublishError,
      legacyJob: legacyJob
        ? `${legacyJob.status} (${legacyJob.attempts} intentos)`
        : null,
      visitState: visit?.state ?? null,
      qstashEvents: qstashEv.length,
      notas,
    });
  }

  const noEnviados = rows.filter((r) => r.verdict.startsWith("NO_ENVIADO") || r.verdict === "PUBLICACION_QSTASH_FALLIDA");

  console.log(`\n${SEP}`);
  console.log("  CLASIFICACIÓN");
  console.log(SEP);
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(32)} ${v.length}`);
  }

  if (noEnviados.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  NO ENVIADOS / FALLIDOS (${noEnviados.length}) — DETALLE`);
    console.log(SEP);
    for (const r of noEnviados) {
      const s = r.session;
      console.log(`\n  · Sesión ${s.id}`);
      console.log(`    Veredicto       : ${r.verdict}`);
      console.log(`    Visita (Madrid) : ${fmtMadrid(s.visitDateTime)}`);
      console.log(`    Comprador       : ${s.buyerPhone} ${s.buyerNombre ? `(${s.buyerNombre})` : ""}`);
      console.log(`    Comercial       : ${r.comercialNombre ?? s.comercialId} → WA ${r.comercialWa ?? "?"}`);
      console.log(`    Propiedad       : ${s.propertyCode} / ${s.propertyRef}`);
      console.log(`    Estado BD       : ${s.state}`);
      console.log(`    qstashMessageId : ${r.qstashId ?? "(null)"}`);
      console.log(`    scheduleAttempts: ${s.scheduleAttempts}`);
      if (r.publishError) console.log(`    publishError    : ${r.publishError}`);
      console.log(`    visitSession    : ${s.visitSessionId} (${r.visitState ?? "?"})`);
      console.log(`    WHATSAPP_ENVIADO: ${r.whatsappSends} evento(s)`);
      if (r.legacyJob) console.log(`    Job legacy      : ${r.legacyJob}`);
      for (const n of r.notas) console.log(`    → ${n}`);
    }
  }

  const enviados = rows.filter((r) => r.verdict === "ENVIADO_OK");
  if (enviados.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  ENVIADOS OK (${enviados.length}) — traza WhatsApp`);
    console.log(SEP);
    for (const r of enviados) {
      const s = r.session;
      const sends = await prisma.event.findMany({
        where: {
          type: "WHATSAPP_ENVIADO",
          OR: [
            { payload: { path: ["parteVisitaSessionId"], equals: s.id } },
            { payload: { path: ["sessionId"], equals: s.id } },
          ],
        },
        orderBy: { occurredAt: "asc" },
        select: { occurredAt: true, payload: true, aggregateId: true },
      });
      console.log(
        `\n  · ${fmtMadrid(s.visitDateTime)} | ${s.buyerPhone} | ${s.propertyRef} | ${s.state}`,
      );
      console.log(`    Comercial WA: ${r.comercialWa} (${r.comercialNombre})`);
      console.log(`    qstashMessageId: ${s.qstashMessageId ?? "(null)"}`);
      if (sends.length === 0) {
        console.log(
          "    ⚠ Estado FORMULARIO_ENVIADO pero sin WHATSAPP_ENVIADO en event store.",
        );
      } else {
        for (const e of sends) {
          const p = e.payload as { kind?: string };
          console.log(
            `    · ${fmtMadrid(e.occurredAt)} ${p.kind ?? "?"} → ${e.aggregateId}`,
          );
        }
      }
    }
  }

  const visitasAgendadas = await prisma.event.findMany({
    where: {
      type: "VISITA_AGENDADA",
      occurredAt: { gte: start, lt: end },
    },
    orderBy: { occurredAt: "asc" },
    select: { id: true, occurredAt: true, payload: true, aggregateId: true },
  });
  if (visitasAgendadas.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  EVENTOS VISITA_AGENDADA el ${date} (${visitasAgendadas.length})`);
    console.log(SEP);
    for (const e of visitasAgendadas) {
      const p = e.payload as Record<string, unknown>;
      console.log(
        `  · ${fmtMadrid(e.occurredAt)} aggregate=${e.aggregateId} visitSession=${p.visitSessionId ?? "?"} buyer=${p.buyerWaId ?? p.buyerPhone ?? "?"}`,
      );
    }
  }

  const canceladas = rows.filter((r) => r.verdict === "CANCELADA");
  if (canceladas.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  CANCELADAS (${canceladas.length})`);
    console.log(SEP);
    for (const r of canceladas) {
      const s = r.session;
      const sends = await prisma.event.findMany({
        where: {
          type: "WHATSAPP_ENVIADO",
          OR: [
            { payload: { path: ["parteVisitaSessionId"], equals: s.id } },
            { payload: { path: ["sessionId"], equals: s.id } },
          ],
        },
        select: { occurredAt: true, payload: true, aggregateId: true },
      });
      console.log(`\n  · ${s.id}`);
      console.log(`    Visita: ${fmtMadrid(s.visitDateTime)} | ${s.buyerPhone} | ${s.propertyRef}`);
      console.log(`    Creada: ${fmtMadrid(s.createdAt)} | Actualizada: ${fmtMadrid(s.updatedAt)}`);
      console.log(`    qstash: ${s.qstashMessageId ?? "(null)"} | err: ${s.schedulePublishError ?? "(none)"}`);
      console.log(`    Envíos WA: ${sends.length}`);
      for (const e of sends) {
        const p = e.payload as { kind?: string };
        console.log(`      · ${fmtMadrid(e.occurredAt)} ${p.kind} → ${e.aggregateId}`);
      }
      const visit = await prisma.visitSchedulingSession.findUnique({
        where: { id: s.visitSessionId },
        select: { id: true, state: true, confirmedSlotStart: true, calendarEventId: true },
      });
      console.log(
        `    VisitScheduling: ${visit ? `${visit.state} slot=${visit.confirmedSlotStart ? fmtMadrid(visit.confirmedSlotStart) : "?"}` : "NO ENCONTRADA"}`,
      );
      const cancelEv = await prisma.event.findFirst({
        where: {
          type: "VISITA_CANCELADA",
          OR: [
            { payload: { path: ["visitSessionId"], equals: s.visitSessionId } },
            { payload: { path: ["parteVisitaSessionId"], equals: s.id } },
          ],
        },
        orderBy: { occurredAt: "desc" },
        select: { type: true, occurredAt: true, payload: true },
      });
      if (cancelEv) {
        console.log(
          `    Evento cancelación: ${cancelEv.type} @ ${fmtMadrid(cancelEv.occurredAt)}`,
        );
      } else {
        console.log(
          "    Evento cancelación: (no encontrado — posible cancelación manual en BD)",
        );
      }
    }
  }

  if (pendingHastaFinDia.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  PENDING HUÉRFANOS (visita en ventana ampliada)`);
    console.log(SEP);
    for (const s of pendingHastaFinDia) {
      const inDay =
        s.visitDateTime >= start && s.visitDateTime < end ? "SÍ (3-jun)" : "no";
      console.log(
        `  · ${s.id} visit=${fmtMadrid(s.visitDateTime)} [${inDay}] buyer=${s.buyerPhone} qstash=${s.qstashMessageId ?? "null"} err=${s.schedulePublishError ?? "-"}`,
      );
    }
  }

  if (visitsSinParte.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  VISITAS CONFIRMADAS SIN ParteVisitaSession (${visitsSinParte.length})`);
    console.log(SEP);
    for (const v of visitsSinParte) {
      console.log(
        `  · visit=${v.id} slot=${fmtMadrid(v.confirmedSlotStart!)} buyer=${v.buyerWaId} property=${v.propertyCode} state=${v.state}`,
      );
    }
  }

  console.log(`\n${SEP}`);
  console.log("  ACCIONES DE RESCATE SUGERIDAS");
  console.log(SEP);
  if (noEnviados.length === 0 && visitsSinParte.length === 0) {
    console.log("  (ninguna — todas las sesiones del día tienen envío o están canceladas)");
  } else {
    for (const r of noEnviados) {
      console.log(
        `  npm run parte-visita:force-send -- --parte-session-id ${r.session.id} --confirm --force`,
      );
    }
    for (const v of visitsSinParte) {
      console.log(
        `  # Visita sin sesión parte: revisar orchestrator scheduleParteVisita — visit-session-id ${v.id}`,
      );
    }
    console.log(
      "\n  Cron rescate (si está activo): POST /api/cron/parte-visita-rescate cada 15 min.",
    );
  }

  console.log("");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[audit-parte-visita-by-date] ERROR:", err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(99);
});
