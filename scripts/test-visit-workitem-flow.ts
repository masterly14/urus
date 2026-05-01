import "dotenv/config";
import { createOrUpdateVisitWorkItemsForDemandInterest } from "@/lib/visitas/work-items";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function main() {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("Este script requiere --dry-run. No envia WhatsApp real ni escribe en Inmovilla.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio para el dry-run.");
  }

  const demandId = arg("demandId") ?? process.env.VISIT_WORKITEM_DEMAND_ID;
  const propertyId = arg("propertyId") ?? undefined;
  if (!demandId) {
    throw new Error("Indica --demandId=... o VISIT_WORKITEM_DEMAND_ID.");
  }

  const results = await createOrUpdateVisitWorkItemsForDemandInterest({
    demandId,
    propertyIds: propertyId ? [propertyId] : undefined,
    nluSummary: "Dry-run de creacion de visita pre-creada.",
  });

  console.log(JSON.stringify({
    mode: "dry-run",
    demandId,
    propertyId: propertyId ?? null,
    createdOrUpdated: results.length,
    visits: results.map(({ workItem, created }) => ({
      id: workItem.id,
      created,
      status: workItem.status,
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/platform/visitas?visitId=${workItem.id}`,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
