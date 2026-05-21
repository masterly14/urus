import "dotenv/config";
import { prisma } from "../lib/prisma";

function iso(d: Date) {
  return d.toISOString();
}

async function main() {
  const now = new Date();
  const sessions = await prisma.parteVisitaSession.findMany({
    where: { state: "PENDING" },
    orderBy: { visitDateTime: "asc" },
    select: {
      id: true,
      visitSessionId: true,
      buyerPhone: true,
      propertyRef: true,
      comercialId: true,
      visitDateTime: true,
      qstashMessageId: true,
      schedulePublishError: true,
      scheduleAttempts: true,
    },
  });

  const past = sessions.filter((s) => s.visitDateTime < now);
  const future = sessions.filter((s) => s.visitDateTime >= now);
  const futureNoQstash = future.filter((s) => !s.qstashMessageId);
  const futureWithQstash = future.filter((s) => !!s.qstashMessageId);

  console.log(`NOW=${iso(now)}`);
  console.log(`TOTAL_PENDING=${sessions.length}`);
  console.log(`PAST_PENDING=${past.length}`);
  console.log(`FUTURE_PENDING=${future.length}`);
  console.log(`FUTURE_PENDING_WITHOUT_QSTASH=${futureNoQstash.length}`);
  console.log(`FUTURE_PENDING_WITH_QSTASH=${futureWithQstash.length}`);

  console.log(`\n[PAST_PENDING] count=${past.length}`);
  for (const s of past) {
    console.log(
      `- id=${s.id} visit=${iso(s.visitDateTime)} buyer=${s.buyerPhone} ref=${s.propertyRef} comercial=${s.comercialId} qstash=${s.qstashMessageId ?? "(null)"} attempts=${s.scheduleAttempts}${s.schedulePublishError ? ` err=${JSON.stringify(s.schedulePublishError)}` : ""}`,
    );
  }

  console.log(`\n[FUTURE_PENDING_WITHOUT_QSTASH] count=${futureNoQstash.length}`);
  for (const s of futureNoQstash) {
    console.log(
      `- id=${s.id} visit=${iso(s.visitDateTime)} buyer=${s.buyerPhone} ref=${s.propertyRef} comercial=${s.comercialId} qstash=(null) attempts=${s.scheduleAttempts}${s.schedulePublishError ? ` err=${JSON.stringify(s.schedulePublishError)}` : ""}`,
    );
  }

  console.log(`\n[FUTURE_PENDING_WITH_QSTASH] count=${futureWithQstash.length}`);
  for (const s of futureWithQstash.slice(0, 20)) {
    console.log(
      `- id=${s.id} visit=${iso(s.visitDateTime)} buyer=${s.buyerPhone} ref=${s.propertyRef} comercial=${s.comercialId} qstash=${s.qstashMessageId} attempts=${s.scheduleAttempts}`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
