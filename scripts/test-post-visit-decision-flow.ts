import "dotenv/config";
import { decideVisitWorkItem, type VisitDecision } from "@/lib/visitas/decisions";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function parseDecision(value: string | null): VisitDecision {
  if (value === "green" || value === "yellow" || value === "red") return value;
  throw new Error("Indica --decision=green|yellow|red.");
}

async function main() {
  if (!process.argv.includes("--dry-run")) {
    throw new Error("Este script requiere --dry-run. No envia WhatsApp real ni escribe en Inmovilla.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL es obligatorio para el dry-run.");
  }

  const visitWorkItemId = arg("visitId") ?? process.env.POST_VISIT_DECISION_VISIT_ID;
  if (!visitWorkItemId) {
    throw new Error("Indica --visitId=... o POST_VISIT_DECISION_VISIT_ID.");
  }

  const decision = parseDecision(arg("decision") ?? "yellow");
  const result = await decideVisitWorkItem({
    visitWorkItemId,
    decision,
    notes: "Dry-run de decision post-visita.",
    reason: "Dry-run",
    decidedBy: "dry-run",
  });

  console.log(JSON.stringify({
    mode: "dry-run",
    visitWorkItemId,
    decision,
    decisionEventId: result.decisionEventId,
    branchEventId: result.branchEventId ?? null,
    operacion: result.operacion ?? null,
    deactivate: result.deactivate ?? null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
