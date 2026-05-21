import "dotenv/config";

async function main() {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.log("NO_TOKEN");
    return;
  }
  const res = await fetch("https://qstash.upstash.io/v2/schedules", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.log(`HTTP_${res.status}`);
    console.log(await res.text());
    return;
  }
  const data = (await res.json()) as Array<{
    scheduleId: string;
    destination?: string;
    cron?: string;
    paused?: boolean;
  }>;
  const match = data.filter((s) =>
    (s.destination ?? "").includes("/api/cron/parte-visita-rescate"),
  );
  console.log(`MATCH=${match.length}`);
  for (const s of match) {
    console.log(
      `${s.scheduleId} cron=${s.cron ?? ""} paused=${!!s.paused} dest=${s.destination ?? ""}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
