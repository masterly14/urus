import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const [pending, inProgress] = await Promise.all([
      prisma.jobQueue.count({ where: { status: "PENDING" } }),
      prisma.jobQueue.count({ where: { status: "IN_PROGRESS" } }),
    ]);

    const totalPendientesEnCola = pending + inProgress;

    console.log("[job-queue] trabajos pendientes");
    console.log(`  - PENDING: ${pending}`);
    console.log(`  - IN_PROGRESS: ${inProgress}`);
    console.log(`  - TOTAL_PENDIENTES_EN_COLA: ${totalPendientesEnCola}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[job-queue] error al contar pendientes", error);
  process.exit(1);
});
