import "dotenv/config";
import { startNluInitialContactForDemand } from "@/lib/nlu/initial-contact";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("Este script requiere --dry-run. No envia WhatsApp real.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio para el dry-run.");
  }

  const demandId = arg("demandId") ?? process.env.NLU_INITIAL_CONTACT_DEMAND_ID;
  if (!demandId) {
    throw new Error("Indica --demandId=... o NLU_INITIAL_CONTACT_DEMAND_ID.");
  }

  const result = await startNluInitialContactForDemand({
    demandId,
    dryRun: true,
  });

  console.log(JSON.stringify({
    mode: "dry-run",
    sent: result.sent,
    skippedReason: result.skippedReason ?? null,
    demandId: result.demandId,
    waId: result.waId ?? null,
    eventId: result.eventId,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
