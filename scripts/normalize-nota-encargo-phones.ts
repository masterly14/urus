/**
 * One-shot migration script: normalizes propietarioPhone in nota_encargo_sessions
 * to E.164 format without '+' (wa_id compatible: 34XXXXXXXXX for Spain).
 *
 * Usage: npx tsx scripts/normalize-nota-encargo-phones.ts [--dry-run]
 *
 * Requires DATABASE_URL in env.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePhoneES(raw: string): string {
  const cleaned = raw.replace(/[\s\-\.\+\(\)]/g, "");
  if (cleaned.length === 9 && /^\d{9}$/.test(cleaned)) {
    return `34${cleaned}`;
  }
  return cleaned;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[normalize-phones] Starting ${dryRun ? "(DRY RUN)" : "(LIVE)"}...`,
  );

  const sessions = await prisma.notaEncargoSession.findMany({
    select: { id: true, propietarioPhone: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const session of sessions) {
    const normalized = normalizePhoneES(session.propietarioPhone);
    if (normalized === session.propietarioPhone) {
      skipped++;
      continue;
    }

    console.log(
      `  ${session.id}: "${session.propietarioPhone}" → "${normalized}"`,
    );

    if (!dryRun) {
      await prisma.notaEncargoSession.update({
        where: { id: session.id },
        data: { propietarioPhone: normalized },
      });
    }
    updated++;
  }

  console.log(
    `[normalize-phones] Done. Updated: ${updated}, Skipped: ${skipped}, Total: ${sessions.length}`,
  );
}

main()
  .catch((err) => {
    console.error("[normalize-phones] Fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
