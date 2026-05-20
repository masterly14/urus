/**
 * Test seguro (solo lectura) que valida el endpoint
 * GET /api/users/:userId/transfer-preview:
 *
 *  1. Para cada usuario con rol "comercial", llama directamente a la lógica de
 *     conteo vía Prisma (igual a la del endpoint).
 *  2. Imprime tabla: userId | nombre | comercialId | propertyCount | demandCount.
 *  3. Compara con un cross-check independiente: cuenta total de PropertyCurrent
 *     y DemandCurrent asignadas, y compara con la suma de los por-comercial.
 *
 * No modifica ningún registro. No requiere INMOVILLA_API_TOKEN.
 *
 * Uso: npm run test:transfer:preview
 *      npx tsx scripts/test-transfer-api-preview.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

type Row = {
  userId: string;
  userName: string;
  email: string;
  comercialId: string | null;
  comercialNombre: string | null;
  propertyCount: number;
  demandCount: number;
};

async function main() {
  console.log("\n=== Validación de transfer-preview ===\n");

  const users = await prisma.user.findMany({
    where: { role: "comercial" },
    select: {
      id: true,
      name: true,
      email: true,
      comercialId: true,
      comercial: { select: { nombre: true } },
    },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) {
    console.log("No hay usuarios con rol comercial.\n");
    return;
  }

  const rows: Row[] = [];
  let totalProperties = 0;
  let totalDemands = 0;
  let usersSinComercial = 0;

  for (const u of users) {
    let propertyCount = 0;
    let demandCount = 0;

    if (u.comercialId) {
      [propertyCount, demandCount] = await Promise.all([
        prisma.propertyCurrent.count({ where: { comercialId: u.comercialId } }),
        prisma.demandCurrent.count({ where: { comercialId: u.comercialId } }),
      ]);
    } else {
      usersSinComercial++;
    }

    totalProperties += propertyCount;
    totalDemands += demandCount;

    rows.push({
      userId: u.id,
      userName: u.name,
      email: u.email,
      comercialId: u.comercialId ?? null,
      comercialNombre: u.comercial?.nombre ?? null,
      propertyCount,
      demandCount,
    });
  }

  console.log(
    "userId                              | nombre                     | comercial                    | props | demands",
  );
  console.log(
    "------------------------------------|----------------------------|------------------------------|-------|--------",
  );
  for (const r of rows) {
    console.log(
      `${r.userId.padEnd(36)} | ${r.userName.padEnd(26).slice(0, 26)} | ${(r.comercialNombre ?? "—").padEnd(28).slice(0, 28)} | ${String(r.propertyCount).padStart(5)} | ${String(r.demandCount).padStart(6)}`,
    );
  }

  console.log("\n--- Cross-check global ---");
  const [globalAssignedProps, globalAssignedDems, orphanProps, orphanDems] =
    await Promise.all([
      prisma.propertyCurrent.count({ where: { comercialId: { not: null } } }),
      prisma.demandCurrent.count({ where: { comercialId: { not: null } } }),
      prisma.propertyCurrent.count({ where: { comercialId: null } }),
      prisma.demandCurrent.count({ where: { comercialId: null } }),
    ]);

  console.log(`Suma por-usuario:    propiedades=${totalProperties}  demandas=${totalDemands}`);
  console.log(
    `Total BD asignados:  propiedades=${globalAssignedProps}  demandas=${globalAssignedDems}  (puede ser > suma si hay comerciales sin user)`,
  );
  console.log(`Sin comercial:       propiedades=${orphanProps}  demandas=${orphanDems}`);
  console.log(`Usuarios sin comercialId vinculado: ${usersSinComercial}\n`);

  // Validación de invariantes
  const errors: string[] = [];
  if (totalProperties > globalAssignedProps) {
    errors.push(
      `INCONSISTENCIA: suma por-usuario (${totalProperties}) > total BD asignados (${globalAssignedProps})`,
    );
  }
  if (totalDemands > globalAssignedDems) {
    errors.push(
      `INCONSISTENCIA: suma por-usuario demandas (${totalDemands}) > total BD asignados (${globalAssignedDems})`,
    );
  }

  if (errors.length > 0) {
    console.error("\n*** ERRORES DETECTADOS ***");
    errors.forEach((e) => console.error("  - " + e));
    process.exitCode = 1;
  } else {
    console.log("OK - conteos consistentes con la BD.\n");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
