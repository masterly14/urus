/**
 * register-qstash-parte-visita-rescate.ts
 *
 * Registra (o reutiliza) el schedule de QStash que dispara cada 15 minutos el
 * cron de rescate `/api/cron/parte-visita-rescate`.
 *
 * Es idempotente: si ya existe un schedule activo con el mismo destination y
 * misma expresión cron, no crea otro. Si existen schedules con la misma
 * destination y cron distinto, los lista para que el operador decida.
 *
 * Uso:
 *   npx tsx scripts/register-qstash-parte-visita-rescate.ts
 *
 * Variables requeridas:
 *   QSTASH_TOKEN
 *   NEXT_PUBLIC_APP_URL  (o VERCEL_URL)  → URL pública del despliegue.
 */

import "dotenv/config";
import { Client } from "@upstash/qstash";
import { getPublicAppUrl } from "../lib/microsite/app-url";

const CRON_EXPRESSION = "*/15 * * * *";
const ROUTE = "/api/cron/parte-visita-rescate";

type ExistingSchedule = {
  scheduleId: string;
  cron?: string;
  destination?: string;
  paused?: boolean;
};

async function listSchedules(token: string): Promise<ExistingSchedule[]> {
  const res = await fetch("https://qstash.upstash.io/v2/schedules", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`QStash list HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as ExistingSchedule[];
}

async function main() {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.error("QSTASH_TOKEN no configurado en .env");
    process.exit(1);
  }

  const baseUrl = getPublicAppUrl();
  const destination = `${baseUrl}${ROUTE}`;

  console.log(`Destination : ${destination}`);
  console.log(`Cron        : ${CRON_EXPRESSION}`);

  const existing = await listSchedules(token);
  const matchByDest = existing.filter((s) => s.destination === destination);
  const exactMatch = matchByDest.find((s) => s.cron === CRON_EXPRESSION && !s.paused);

  if (exactMatch) {
    console.log(`\nYa existe schedule activo con misma destination y cron:`);
    console.log(`  scheduleId = ${exactMatch.scheduleId}`);
    console.log("Nada que hacer.");
    return;
  }

  if (matchByDest.length > 0) {
    console.log(`\nExisten schedules previos con misma destination pero distinto cron/paused:`);
    for (const s of matchByDest) {
      console.log(
        `  · ${s.scheduleId}  cron="${s.cron ?? ""}"  paused=${!!s.paused}`,
      );
    }
    console.log(
      "\nNo se crea otro automáticamente. Borra/actualiza los anteriores manualmente y vuelve a ejecutar.",
    );
    process.exit(2);
  }

  const client = new Client({ token });
  const result = await client.schedules.create({
    destination,
    cron: CRON_EXPRESSION,
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });

  console.log(`\nSchedule creado:`);
  console.log(`  scheduleId = ${result.scheduleId}`);
  console.log(`  Próximas ejecuciones cada 15 minutos.`);
}

main().catch((err) => {
  console.error("[register-qstash-parte-visita-rescate] ERROR:", err);
  process.exit(99);
});
