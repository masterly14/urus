/**
 * Auditoría rápida de tareas manuales de sincronización.
 *
 * Uso:
 *   npm run audit:sync-tasks
 *   npx tsx scripts/audit-manual-sync-tasks.ts
 */

import "dotenv/config";
import { ManualSyncTaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

function ageDays(iso: Date) {
  const ms = Date.now() - iso.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

async function main() {
  console.log("\n=== Auditoría: tareas manuales de sincronización ===\n");

  const pendingTasks = await prisma.manualSyncTask.findMany({
    where: {
      status: {
        in: [
          ManualSyncTaskStatus.PENDING,
          ManualSyncTaskStatus.IN_PROGRESS,
          ManualSyncTaskStatus.BLOCKED,
        ],
      },
    },
    orderBy: [{ targetComercialName: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      status: true,
      recordCode: true,
      recordRef: true,
      targetComercialName: true,
      targetComercialId: true,
      createdAt: true,
    },
  });

  if (pendingTasks.length === 0) {
    console.log("No hay tareas pendientes/en progreso/bloqueadas.\n");
    return;
  }

  const byComercial = new Map<
    string,
    {
      comercialName: string;
      comercialId: string;
      pending: number;
      inProgress: number;
      blocked: number;
      oldestDays: number;
    }
  >();

  for (const task of pendingTasks) {
    const key = task.targetComercialId;
    const current = byComercial.get(key) ?? {
      comercialName: task.targetComercialName,
      comercialId: task.targetComercialId,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      oldestDays: 0,
    };

    if (task.status === "PENDING") current.pending += 1;
    if (task.status === "IN_PROGRESS") current.inProgress += 1;
    if (task.status === "BLOCKED") current.blocked += 1;

    const days = ageDays(task.createdAt);
    current.oldestDays = Math.max(current.oldestDays, days);

    byComercial.set(key, current);
  }

  const rows = Array.from(byComercial.values()).sort((a, b) => {
    if (b.oldestDays !== a.oldestDays) return b.oldestDays - a.oldestDays;
    return b.pending + b.inProgress + b.blocked - (a.pending + a.inProgress + a.blocked);
  });

  console.log(
    "comercial                      | pendientes | en progreso | bloqueadas | antigüedad máx (días)",
  );
  console.log(
    "------------------------------|-----------:|------------:|-----------:|---------------------:",
  );
  for (const row of rows) {
    console.log(
      `${row.comercialName.padEnd(30).slice(0, 30)} | ${String(row.pending).padStart(10)} | ${String(row.inProgress).padStart(11)} | ${String(row.blocked).padStart(10)} | ${String(row.oldestDays).padStart(20)}`,
    );
  }

  const topOldest = pendingTasks
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 10);

  console.log("\nTop 10 tareas más antiguas:");
  for (const task of topOldest) {
    console.log(
      `- ${task.targetComercialName} | ${task.type} ${task.recordCode}${task.recordRef ? ` (${task.recordRef})` : ""} | ${task.status} | ${ageDays(task.createdAt)} días`,
    );
  }

  console.log("\nResumen:");
  console.log(`- Total tareas abiertas: ${pendingTasks.length}`);
  console.log(`- Comerciales con carga: ${rows.length}`);
  console.log(
    `- Bloqueadas: ${pendingTasks.filter((task) => task.status === "BLOCKED").length}`,
  );
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
