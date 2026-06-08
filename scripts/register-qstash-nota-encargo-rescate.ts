import "dotenv/config";
import { Client } from "@upstash/qstash";
import { getPublicAppUrl } from "../lib/microsite/app-url";

const CRON_EXPRESSION = "*/15 * * * *";
const ROUTE = "/api/cron/nota-encargo-rescate";

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

  const destination = `${getPublicAppUrl()}${ROUTE}`;
  console.log(`Destination : ${destination}`);
  console.log(`Cron        : ${CRON_EXPRESSION}`);

  const existing = await listSchedules(token);
  const matchByDest = existing.filter((s) => s.destination === destination);
  const exactMatch = matchByDest.find(
    (s) => s.cron === CRON_EXPRESSION && !s.paused,
  );

  if (exactMatch) {
    console.log(`\nYa existe schedule activo: ${exactMatch.scheduleId}`);
    return;
  }

  if (matchByDest.length > 0) {
    console.error("\nExisten schedules con misma destination pero distinto cron.");
    process.exit(2);
  }

  const client = new Client({ token });
  const result = await client.schedules.create({
    destination,
    cron: CRON_EXPRESSION,
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
  });

  console.log(`\nSchedule creado: ${result.scheduleId}`);
}

main().catch((err) => {
  console.error("[register-qstash-nota-encargo-rescate] ERROR:", err);
  process.exit(99);
});
