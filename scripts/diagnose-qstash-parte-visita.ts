/**
 * diagnose-qstash-parte-visita.ts
 *
 * Diagnóstico directo de QStash para el envío del Parte de Visita.
 *
 * Listará:
 *   1. Todos los schedules registrados (para detectar schedules cron persistentes).
 *   2. Todos los mensajes "in-flight" (no entregados todavía) — necesario para
 *      detectar mensajes diferidos con `notBefore` futuro.
 *   3. Todos los events en una ventana, filtrando por URL que contenga
 *      `parte-visita` o por sessionId concreto.
 *   4. DLQ (dead letter queue) por si el envío llegó al endpoint y falló.
 *
 * Uso:
 *   npx tsx scripts/diagnose-qstash-parte-visita.ts
 *   npx tsx scripts/diagnose-qstash-parte-visita.ts --session cmpcdowb00007l1047zin61bh
 *   npx tsx scripts/diagnose-qstash-parte-visita.ts --hours 168
 */

import "dotenv/config";

const SEP = "─".repeat(80);

type Args = { sessionId?: string; hours: number };

function parseArgs(argv: string[]): Args {
  const out: Args = { hours: 96 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--session") out.sessionId = argv[++i];
    else if (a === "--hours") out.hours = Number(argv[++i]);
  }
  return out;
}

function h(title: string) {
  console.log(`\n${SEP}`);
  console.log(`  ${title}`);
  console.log(SEP);
}

function ts(ms?: number | null): string {
  if (!ms) return "(null)";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

async function qstashGet<T>(path: string): Promise<T> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) throw new Error("QSTASH_TOKEN no configurado");
  const res = await fetch(`https://qstash.upstash.io${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`QStash ${path} HTTP ${res.status} ${res.statusText} — ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const args = parseArgs(process.argv);

  // ----------------------------------------------------------------------
  // 1) Schedules registrados
  // ----------------------------------------------------------------------
  h("1) /v2/schedules — schedules persistentes (cron-like)");
  try {
    type Schedule = {
      scheduleId: string;
      cron?: string;
      destination?: string;
      createdAt?: number;
      lastScheduleTime?: number;
      paused?: boolean;
    };
    const schedules = await qstashGet<Schedule[]>("/v2/schedules");
    if (!Array.isArray(schedules) || schedules.length === 0) {
      console.log("  (sin schedules registrados)");
    } else {
      for (const s of schedules) {
        const isParte = (s.destination ?? "").includes("parte-visita");
        const tag = isParte ? "  ← PARTE-VISITA" : "";
        console.log(
          `  · ${s.scheduleId}  cron="${s.cron ?? ""}"  paused=${!!s.paused}\n    dest=${s.destination ?? "(none)"}${tag}`,
        );
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ----------------------------------------------------------------------
  // 2) Mensajes pendientes (in-flight, no entregados aún)
  // ----------------------------------------------------------------------
  h("2) /v2/messages — mensajes pendientes de entrega (incluye `notBefore` futuros)");
  try {
    type Message = {
      messageId: string;
      url?: string;
      notBefore?: number;
      createdAt?: number;
      body?: string;
      retried?: number;
    };
    const messages = await qstashGet<Message[]>("/v2/messages");
    if (!Array.isArray(messages) || messages.length === 0) {
      console.log("  (sin mensajes pendientes)");
    } else {
      const matching = messages.filter((m) => (m.url ?? "").includes("parte-visita"));
      const other = messages.length - matching.length;
      if (matching.length === 0) {
        console.log(`  Sin mensajes pendientes hacia /api/parte-visita/send`);
        console.log(`  (informativo: ${messages.length} mensajes pendientes en total)`);
      } else {
        for (const m of matching) {
          console.log(
            `  · ${m.messageId}\n    url=${m.url}\n    notBefore=${ts(m.notBefore)}  createdAt=${ts(m.createdAt)}\n    body=${(m.body ?? "").slice(0, 200)}`,
          );
        }
        console.log(`\n  (informativo: ${other} mensajes pendientes hacia otras URLs)`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ----------------------------------------------------------------------
  // 3) Events recientes
  // ----------------------------------------------------------------------
  h("3) /v2/events — events recientes (todos, sin filtrar por URL)");
  try {
    const since = Date.now() - args.hours * 3600_000;
    type Event = {
      time: number;
      state: string;
      messageId: string;
      url?: string;
      header?: Record<string, string>;
      body?: string;
      nextDeliveryTime?: number;
      error?: string;
      responseStatus?: number;
    };
    type EventsResponse = { events?: Event[] };
    const resp = await qstashGet<EventsResponse>(
      `/v2/events?fromDate=${since}&count=1000`,
    );
    const events = resp.events ?? [];
    console.log(`  Total events en ${args.hours}h: ${events.length}`);
    const parte = events.filter((e) => (e.url ?? "").includes("parte-visita"));
    console.log(`  Events hacia /api/parte-visita/send: ${parte.length}`);
    if (parte.length === 0) {
      const urls = new Map<string, number>();
      for (const e of events) {
        const u = (e.url ?? "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
        urls.set(u, (urls.get(u) ?? 0) + 1);
      }
      const top = [...urls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
      console.log("\n  Top 15 URLs vistas en QStash events (para verificar que QStash está activo):");
      for (const [u, n] of top) console.log(`    ${n.toString().padStart(5)}  ${u}`);
    } else {
      const byMsg = new Map<string, Event[]>();
      for (const e of parte) {
        const list = byMsg.get(e.messageId) ?? [];
        list.push(e);
        byMsg.set(e.messageId, list);
      }
      for (const [mid, list] of byMsg.entries()) {
        list.sort((a, b) => a.time - b.time);
        console.log(`\n  ▼ messageId=${mid}  url=${list[0]?.url ?? "(none)"}`);
        for (const e of list) {
          const next = e.nextDeliveryTime ? `  next=${ts(e.nextDeliveryTime)}` : "";
          const err = e.error ? `  err=${e.error.slice(0, 200)}` : "";
          const status =
            typeof e.responseStatus === "number" ? `  status=${e.responseStatus}` : "";
          console.log(`     ${ts(e.time)}  state=${e.state}${status}${next}${err}`);
        }
        const body = list[0]?.body;
        if (body) console.log(`     body=${body.slice(0, 200)}`);
      }
    }

    if (args.sessionId) {
      const bySession = events.filter((e) => (e.body ?? "").includes(args.sessionId!));
      console.log(`\n  Events con sessionId=${args.sessionId} en body: ${bySession.length}`);
      for (const e of bySession) {
        console.log(
          `    ${ts(e.time)}  state=${e.state}  url=${e.url ?? "(none)"}`,
        );
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  // ----------------------------------------------------------------------
  // 4) DLQ
  // ----------------------------------------------------------------------
  h("4) /v2/dlq — dead-letter queue (mensajes que fallaron tras todos los retries)");
  try {
    type DlqEntry = {
      messageId: string;
      url?: string;
      createdAt?: number;
      responseStatus?: number;
      responseBody?: string;
    };
    type DlqResponse = { messages?: DlqEntry[] };
    const resp = await qstashGet<DlqResponse>("/v2/dlq");
    const items = resp.messages ?? [];
    if (items.length === 0) {
      console.log("  (DLQ vacío)");
    } else {
      const parte = items.filter((i) => (i.url ?? "").includes("parte-visita"));
      if (parte.length === 0) {
        console.log(`  Ninguno hacia /api/parte-visita/send. Total DLQ: ${items.length}`);
      } else {
        for (const i of parte) {
          console.log(
            `  · ${i.messageId}  status=${i.responseStatus ?? "?"}\n    url=${i.url}\n    createdAt=${ts(i.createdAt)}\n    response=${(i.responseBody ?? "").slice(0, 300)}`,
          );
        }
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }
}

main().catch((err) => {
  console.error("[diagnose-qstash-parte-visita] ERROR:", err);
  process.exit(99);
});
