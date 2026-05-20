import "dotenv/config";
import { PrismaClient, type JobStatus } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET_TYPES = ["WRITE_TO_INMOVILLA", "UPDATE_PROPERTY_STATUS_INMOVILLA"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function shortJson(value: unknown, max = 220): string {
  try {
    const raw = JSON.stringify(value);
    if (!raw) return "null";
    return raw.length <= max ? raw : `${raw.slice(0, max)}...`;
  } catch {
    return String(value);
  }
}

function inferCause(lastError: string | null): string {
  const msg = (lastError ?? "").toLowerCase();
  if (!msg) return "unknown";
  if (msg.includes("circuit breaker open")) return "circuit_open";
  if (msg.includes("session_expired")) return "session_expired";
  if (msg.includes("network_error")) return "network_or_upstream";
  if (msg.includes("verify_mismatch")) return "verify_mismatch";
  if (msg.includes("404")) return "not_found";
  if (msg.includes("401") || msg.includes("403")) return "unauthorized";
  if (msg.includes("timeout")) return "timeout";
  return "other";
}

async function main(): Promise<void> {
  const statuses: JobStatus[] = [
    "PENDING",
    "IN_PROGRESS",
    "COMPLETED",
    "FAILED",
    "DEAD_LETTER",
  ];

  console.log("=".repeat(90));
  console.log("INVESTIGACION ERRORES INMOVILLA");
  console.log("=".repeat(90));

  const circuit = await prisma.circuitBreaker.findUnique({
    where: { id: "egestion-inmovilla" },
  });

  console.log("\n[1/5] Circuit breaker egestion-inmovilla");
  console.log("-".repeat(90));
  if (!circuit) {
    console.log("  No existe registro (nunca usado o limpiado).");
  } else {
    console.log(
      `  status=${circuit.status} failureCount=${circuit.failureCount} openedAt=${circuit.openedAt?.toISOString() ?? "—"} lastFailedAt=${circuit.lastFailedAt?.toISOString() ?? "—"} closedAt=${circuit.closedAt?.toISOString() ?? "—"}`,
    );
  }

  console.log("\n[2/5] Conteo por tipo/status");
  console.log("-".repeat(90));
  const grouped = await prisma.jobQueue.groupBy({
    by: ["type", "status"],
    where: { type: { in: TARGET_TYPES as unknown as TargetType[] } },
    _count: { _all: true },
  });
  for (const type of TARGET_TYPES) {
    const rows = grouped.filter((g) => g.type === type);
    const parts = statuses
      .map((s) => `${s}=${rows.find((r) => r.status === s)?._count._all ?? 0}`)
      .join("  ");
    console.log(`  ${type}: ${parts}`);
  }

  console.log("\n[3/5] Muestras recientes con error (últimos 15 por tipo)");
  console.log("-".repeat(90));
  for (const type of TARGET_TYPES) {
    const rows = await prisma.jobQueue.findMany({
      where: {
        type,
        status: { in: ["FAILED", "DEAD_LETTER", "PENDING", "IN_PROGRESS"] },
        lastError: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        updatedAt: true,
        availableAt: true,
        lastError: true,
        payload: true,
      },
    });

    console.log(`\n  ${type} (${rows.length} filas):`);
    for (const row of rows) {
      const payload = asObject(row.payload);
      const key =
        type === "UPDATE_PROPERTY_STATUS_INMOVILLA"
          ? payload?.propertyCode
          : payload?.operation;
      console.log(
        `    - ${row.id}  ${row.status}  ${row.attempts}/${row.maxAttempts}  cause=${inferCause(row.lastError)}  key=${String(key ?? "—")}  at=${row.updatedAt.toISOString()}`,
      );
      console.log(`      err=${(row.lastError ?? "").slice(0, 220)}`);
      console.log(`      payload=${shortJson(row.payload)}`);
    }
  }

  console.log("\n[4/5] UPDATE_PROPERTY_STATUS_INMOVILLA con 404 (top propertyCode)");
  console.log("-".repeat(90));
  const updateRows = await prisma.jobQueue.findMany({
    where: {
      type: "UPDATE_PROPERTY_STATUS_INMOVILLA",
      lastError: { contains: "404" },
      status: { in: ["PENDING", "FAILED", "DEAD_LETTER", "IN_PROGRESS"] },
    },
    select: { payload: true, lastError: true, status: true },
    take: 300,
  });
  const byCode = new Map<string, { count: number; statuses: Map<JobStatus, number> }>();
  for (const row of updateRows) {
    const payload = asObject(row.payload);
    const propertyCode = String(payload?.propertyCode ?? "unknown");
    if (!byCode.has(propertyCode)) {
      byCode.set(propertyCode, { count: 0, statuses: new Map<JobStatus, number>() });
    }
    const entry = byCode.get(propertyCode)!;
    entry.count += 1;
    entry.statuses.set(row.status, (entry.statuses.get(row.status) ?? 0) + 1);
  }
  const sorted = [...byCode.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (sorted.length === 0) {
    console.log("  No hay 404 recientes para UPDATE_PROPERTY_STATUS_INMOVILLA.");
  } else {
    for (const [code, info] of sorted) {
      const statusParts = [...info.statuses.entries()]
        .map(([s, n]) => `${s}:${n}`)
        .join(", ");
      console.log(`  - propertyCode=${code}  count=${info.count}  statuses=[${statusParts}]`);
    }
  }

  console.log("\n[5/5] Diagnóstico rápido");
  console.log("-".repeat(90));
  const writePending = grouped.find(
    (g) => g.type === "WRITE_TO_INMOVILLA" && g.status === "PENDING",
  )?._count._all ?? 0;
  const updatePending = grouped.find(
    (g) => g.type === "UPDATE_PROPERTY_STATUS_INMOVILLA" && g.status === "PENDING",
  )?._count._all ?? 0;

  if (circuit?.status === "OPEN") {
    console.log(
      `  • Circuit breaker OPEN (failureCount=${circuit.failureCount}). Mientras esté abierto, WRITE_TO_INMOVILLA seguirá reintentando sin ejecutar llamada real.`,
    );
  } else {
    console.log("  • Circuit breaker no está OPEN ahora.");
  }
  console.log(
    `  • PENDING actuales: WRITE_TO_INMOVILLA=${writePending}, UPDATE_PROPERTY_STATUS_INMOVILLA=${updatePending}.`,
  );
  console.log(
    "  • Los 404 de UPDATE_PROPERTY_STATUS_INMOVILLA suelen ser datos inexistentes en Inmovilla (ref no encontrada), no fallo de red.",
  );

  const writeRowsForRef = await prisma.jobQueue.findMany({
    where: {
      type: "WRITE_TO_INMOVILLA",
      status: "DEAD_LETTER",
    },
    select: { payload: true },
    take: 500,
  });
  let testRefCount = 0;
  for (const row of writeRowsForRef) {
    const payload = asObject(row.payload);
    const args = asObject(payload?.args);
    const demandRef = String(args?.demandRef ?? "");
    if (/\.auto_test\.|\.msf_test\./i.test(demandRef)) testRefCount += 1;
  }
  console.log(
    `  • DEAD_LETTER WRITE_TO_INMOVILLA con demandRef de test (.auto_test./.msf_test.): ${testRefCount}/${writeRowsForRef.length}.`,
  );
}

main()
  .catch((err) => {
    console.error("[investigate-inmovilla-errors] fatal:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

