/**
 * Lista en consola las propiedades de PropertyCurrent agrupadas por comercial.
 *
 * Uso: npx tsx scripts/list-properties-by-comercial.ts
 *      npm run list:properties-by-comercial
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { extractRefCode } from "../lib/routing/parse-ref-code";

async function main() {
  const comerciales = await prisma.comercial.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      activo: true,
      inmovillaRefCode: true,
      inmovillaAgentId: true,
    },
  });

  const props = await prisma.propertyCurrent.findMany({
    orderBy: { codigo: "asc" },
    select: {
      codigo: true,
      ref: true,
      titulo: true,
      zona: true,
      ciudad: true,
      agente: true,
      comercialId: true,
    },
  });

  const byId = new Map(comerciales.map((c) => [c.id, c]));
  const unassigned: typeof props = [];
  const buckets = new Map<string, typeof props>();

  for (const c of comerciales) {
    buckets.set(c.id, []);
  }

  for (const p of props) {
    if (!p.comercialId) {
      unassigned.push(p);
      continue;
    }
    const list = buckets.get(p.comercialId);
    if (list) list.push(p);
    else unassigned.push(p);
  }

  console.log("\n=== Propiedades por comercial ===\n");
  console.log(`Total PropertyCurrent: ${props.length}\n`);

  for (const c of comerciales) {
    const list = buckets.get(c.id) ?? [];
    const label = c.activo ? "" : " (inactivo)";
    console.log(
      `--- ${c.nombre}${label} [id=${c.id}] refCode=${c.inmovillaRefCode ?? "—"} agentId=${c.inmovillaAgentId ?? "—"} — ${list.length} propiedades ---`,
    );
    for (const p of list) {
      const refExtract = p.ref ? extractRefCode(p.ref) : null;
      console.log(
        `   ${p.codigo}  ref="${p.ref}"${refExtract ? ` → extractRef=${refExtract}` : ""}  agente="${p.agente}"  ${p.ciudad} ${p.zona}  ${p.titulo.slice(0, 60)}${p.titulo.length > 60 ? "…" : ""}`,
      );
    }
    console.log("");
  }

  console.log(
    `--- Sin comercialId (${unassigned.length} propiedades) ---`,
  );
  for (const p of unassigned) {
    const refExtract = p.ref ? extractRefCode(p.ref) : null;
    console.log(
      `   ${p.codigo}  ref="${p.ref}"${refExtract ? ` → extractRef=${refExtract}` : ""}  agente="${p.agente}"`,
    );
  }
  console.log("\n=== Fin ===\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
