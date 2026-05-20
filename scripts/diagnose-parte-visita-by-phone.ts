/**
 * diagnose-parte-visita-by-phone.ts
 *
 * Diagnóstico end-to-end del Parte de Visita para un comprador concreto.
 *
 * Para un buyerPhone dado:
 *   1. Lista todas las VisitSchedulingSession (estado, confirmedSlotStart,
 *      calendarEventId, comercialId).
 *   2. Lista todas las ParteVisitaSession asociadas (state, visitDateTime).
 *   3. Resuelve el comercial vinculado y muestra cómo se normaliza su teléfono
 *      WhatsApp (lo que se usa para enviar el Flow).
 *   4. Para cada sesión PENDING o FORMULARIO_ENVIADO comprueba si existe un
 *      `JobQueue` legacy de tipo PARTE_VISITA_ENVIAR_FORMULARIO.
 *   5. Lista eventos WHATSAPP_ENVIADO al comercial relacionados con la sesión
 *      (kind=parte_visita_contexto / parte_visita_formulario_flow).
 *   6. Lista eventos VISITA_AGENDADA recientes para el comprador.
 *   7. Consulta la API de QStash y muestra los mensajes recientes que
 *      apunten al endpoint /api/parte-visita/send (filtrando por sessionId).
 *
 * Uso:
 *   npx tsx scripts/diagnose-parte-visita-by-phone.ts --phone 34666390628
 *   npx tsx scripts/diagnose-parte-visita-by-phone.ts --phone 34666390628 --hours 24
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { resolveComercial } from "../lib/routing/resolve-comercial";
import {
  normalizeComercialWhatsappPhone,
  samePhoneByLast9,
} from "../lib/routing/comercial-whatsapp";

const SEP = "─".repeat(80);

function h(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

type Args = { phone?: string; hours: number };

function parseArgs(argv: string[]): Args {
  const out: Args = { hours: 48 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--phone") out.phone = argv[++i];
    else if (a === "--hours") out.hours = Number(argv[++i]);
  }
  return out;
}

function shortDate(d: Date | null | undefined): string {
  if (!d) return "(null)";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function main() {
  const { phone, hours } = parseArgs(process.argv);
  if (!phone) {
    console.error("Uso: npx tsx scripts/diagnose-parte-visita-by-phone.ts --phone <e164>");
    process.exit(1);
  }

  const last9 = phone.replace(/\D/g, "").slice(-9);
  console.log(`\nBuyer phone : ${phone}`);
  console.log(`Last 9      : ${last9}`);
  console.log(`Look-back   : ${hours}h`);
  const since = new Date(Date.now() - hours * 3600_000);

  // ----------------------------------------------------------------------
  // 1) VisitSchedulingSession
  // ----------------------------------------------------------------------
  h("1) VisitSchedulingSession (todas las que coinciden por buyerWaId)");
  const visitSessions = await prisma.visitSchedulingSession.findMany({
    where: {
      OR: [
        { buyerWaId: phone },
        { buyerWaId: { endsWith: last9 } },
        { visitorPhone: phone },
        { visitorPhone: { endsWith: last9 } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (visitSessions.length === 0) {
    console.log("  (ninguna)");
  } else {
    for (const v of visitSessions) {
      console.log(
        `  · id=${v.id}\n    state=${v.state}  confirmed=${shortDate(v.confirmedSlotStart)}  createdAt=${shortDate(v.createdAt)}\n    comercialId=${v.comercialId}  propertyCode=${v.propertyCode}\n    calendarEventId=${v.calendarEventId ?? "(null)"}  visitorPhone=${v.visitorPhone ?? "(null)"}\n    completedAt=${shortDate(v.completedAt)}  draftDemandId=${v.draftDemandId ?? "(null)"}`,
      );
    }
  }

  // ----------------------------------------------------------------------
  // 2) ParteVisitaSession
  // ----------------------------------------------------------------------
  h("2) ParteVisitaSession (por buyerPhone)");
  const parteSessions = await prisma.parteVisitaSession.findMany({
    where: {
      OR: [
        { buyerPhone: phone },
        { buyerPhone: { endsWith: last9 } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (parteSessions.length === 0) {
    console.log("  (ninguna)");
  } else {
    for (const p of parteSessions) {
      console.log(
        `  · id=${p.id}\n    state=${p.state}  visitDateTime=${shortDate(p.visitDateTime)}  createdAt=${shortDate(p.createdAt)}\n    comercialId=${p.comercialId}  buyerPhone=${p.buyerPhone}  propertyRef=${p.propertyRef}  visitSessionId=${p.visitSessionId}`,
      );
    }
  }

  // ----------------------------------------------------------------------
  // 3) Comercial(es) implicados y normalización del teléfono
  // ----------------------------------------------------------------------
  h("3) Comercial(es) implicados — teléfono WhatsApp resuelto");
  const comercialIds = Array.from(
    new Set([
      ...visitSessions.map((v) => v.comercialId),
      ...parteSessions.map((p) => p.comercialId),
    ]),
  );
  if (comercialIds.length === 0) {
    console.log("  (ninguno)");
  } else {
    for (const cid of comercialIds) {
      const c = await resolveComercial({ comercialId: cid, requireActive: false });
      if (!c) {
        console.log(`  · ${cid} — NO ENCONTRADO en BD (¡crítico!)`);
        continue;
      }
      const normalized = normalizeComercialWhatsappPhone(c);
      console.log(
        `  · ${cid}  nombre="${c.nombre}"  activo=${c.activo}\n    waId raw                 = ${(c as { waId?: string | null }).waId ?? "(null)"}\n    telefonoWhatsapp raw     = ${(c as { telefonoWhatsapp?: string | null }).telefonoWhatsapp ?? "(null)"}\n    normalizeComercialPhone  = ${normalized ?? "(NULL — el envío fallará)"}`,
      );
    }
  }

  // ----------------------------------------------------------------------
  // 4) JobQueue legacy
  // ----------------------------------------------------------------------
  h("4) JobQueue legacy (PARTE_VISITA_ENVIAR_FORMULARIO) por sessionId");
  if (parteSessions.length === 0) {
    console.log("  (sin sesiones que comprobar)");
  } else {
    for (const p of parteSessions) {
      const jobs = await prisma.jobQueue.findMany({
        where: {
          type: "PARTE_VISITA_ENVIAR_FORMULARIO",
          OR: [
            { payload: { path: ["sessionId"], equals: p.id } },
            { idempotencyKey: { startsWith: `parte_visita_formulario:${p.id}` } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      if (jobs.length === 0) {
        console.log(`  · session=${p.id}  → sin jobs legacy`);
      } else {
        for (const j of jobs) {
          console.log(
            `  · session=${p.id}\n    job=${j.id}  status=${j.status}  attempts=${j.attempts}  availableAt=${shortDate(j.availableAt)}  lastError=${(j.lastError ?? "").slice(0, 200)}`,
          );
        }
      }
    }
  }

  // ----------------------------------------------------------------------
  // 5) Eventos WHATSAPP_ENVIADO al comercial (kind parte_visita_*)
  // ----------------------------------------------------------------------
  h("5) WHATSAPP_ENVIADO con kind parte_visita_* (últimas " + hours + "h)");
  const comercialPhones: string[] = [];
  for (const cid of comercialIds) {
    const c = await resolveComercial({ comercialId: cid, requireActive: false });
    const n = c ? normalizeComercialWhatsappPhone(c) : null;
    if (n) comercialPhones.push(n);
  }
  if (comercialPhones.length === 0) {
    console.log("  (no hay teléfono de comercial resoluble, no se busca)");
  } else {
    const evs = await prisma.event.findMany({
      where: {
        type: "WHATSAPP_ENVIADO",
        aggregateType: "WHATSAPP_CONVERSATION",
        aggregateId: { in: comercialPhones },
        occurredAt: { gte: since },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    });
    const filtered = evs.filter((e) => {
      const kind = (e.payload as Record<string, unknown> | null)?.["kind"];
      return typeof kind === "string" && kind.startsWith("parte_visita_");
    });
    if (filtered.length === 0) {
      console.log("  (ninguno — el envío nunca se intentó / no quedó registrado)");
    } else {
      for (const e of filtered) {
        const payload = e.payload as Record<string, unknown>;
        console.log(
          `  · ${shortDate(e.occurredAt)}  aggr=${e.aggregateId}  kind=${payload["kind"]}  templateName=${payload["templateName"] ?? "(none)"}  messageId=${payload["messageId"] ?? "(none)"}`,
        );
      }
    }
  }

  // ----------------------------------------------------------------------
  // 6) Eventos VISITA_AGENDADA recientes para el comprador
  // ----------------------------------------------------------------------
  h("6) VISITA_AGENDADA recientes (últimas " + hours + "h, payload con phone)");
  const visitaAgendadaEvts = await prisma.event.findMany({
    where: {
      type: "VISITA_AGENDADA",
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "desc" },
    take: 50,
  });
  const phoneEvts = visitaAgendadaEvts.filter((e) => {
    const p = e.payload as Record<string, unknown> | null;
    if (!p) return false;
    const candidates = [p["buyerPhone"], p["buyerWaId"], p["visitorPhone"]];
    return candidates.some(
      (c) => typeof c === "string" && samePhoneByLast9(c, phone),
    );
  });
  if (phoneEvts.length === 0) {
    console.log("  (ninguno relacionado con este teléfono)");
  } else {
    for (const e of phoneEvts) {
      console.log(
        `  · ${shortDate(e.occurredAt)}  aggrType=${e.aggregateType}  aggrId=${e.aggregateId}\n    payload=${JSON.stringify(e.payload).slice(0, 400)}`,
      );
    }
  }

  // ----------------------------------------------------------------------
  // 7) QStash — mensajes/schedules apuntando a /api/parte-visita/send
  // ----------------------------------------------------------------------
  h("7) QStash — mensajes hacia /api/parte-visita/send (últimas " + hours + "h)");
  const qstashToken = process.env.QSTASH_TOKEN?.trim();
  if (!qstashToken) {
    console.log("  QSTASH_TOKEN no presente — saltando consulta QStash");
  } else {
    type QstashMessage = {
      messageId: string;
      url: string;
      state?: string;
      notBefore?: number;
      createdAt?: number;
      body?: string;
    };
    type QstashEvent = {
      time: number;
      state: string;
      messageId: string;
      url?: string;
      header?: Record<string, string>;
      body?: string;
      nextDeliveryTime?: number;
    };
    const sinceMs = Date.now() - hours * 3600_000;
    const sessionIds = new Set(parteSessions.map((p) => p.id));
    try {
      const res = await fetch(
        `https://qstash.upstash.io/v2/events?fromDate=${sinceMs}&count=1000`,
        {
          headers: { Authorization: `Bearer ${qstashToken}` },
        },
      );
      if (!res.ok) {
        console.log(`  Error consultando QStash events: HTTP ${res.status} ${res.statusText}`);
      } else {
        const json = (await res.json()) as { events?: QstashEvent[] };
        const events = json.events ?? [];
        const matching = events.filter((e) => {
          const url = e.url ?? "";
          if (!url.includes("/api/parte-visita/send")) return false;
          if (sessionIds.size === 0) return true;
          for (const sid of sessionIds) {
            if ((e.body ?? "").includes(sid)) return true;
          }
          return false;
        });
        if (matching.length === 0) {
          console.log(
            "  (ningún evento QStash hacia /api/parte-visita/send que coincida con estas sesiones)",
          );
          const anyParte = events.filter((e) => (e.url ?? "").includes("/api/parte-visita/send"));
          console.log(`  (informativo: hay ${anyParte.length} eventos hacia /api/parte-visita/send en la ventana total)`);
        } else {
          // Agrupar por messageId para ver toda la trayectoria del schedule
          const byMessage = new Map<string, QstashEvent[]>();
          for (const e of matching) {
            const list = byMessage.get(e.messageId) ?? [];
            list.push(e);
            byMessage.set(e.messageId, list);
          }
          for (const [mid, list] of byMessage.entries()) {
            list.sort((a, b) => a.time - b.time);
            console.log(`\n  ▼ QStash messageId=${mid}`);
            for (const e of list) {
              const t = shortDate(new Date(e.time));
              const next = e.nextDeliveryTime
                ? `  next=${shortDate(new Date(e.nextDeliveryTime))}`
                : "";
              console.log(`     ${t}  state=${e.state}${next}`);
            }
          }
        }
      }
    } catch (err) {
      console.log(`  Error consultando QStash: ${(err as Error).message}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[diagnose-parte-visita-by-phone] ERROR:", err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(99);
});
