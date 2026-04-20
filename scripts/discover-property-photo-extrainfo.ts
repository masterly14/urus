/**
 * Discovery script — verifica qué campos relacionados con fotos y portales
 * devuelve REALMENTE la API REST v1 de Inmovilla para una propiedad concreta.
 *
 * Llama en serie (respetando rate limits):
 *   1) GET /propiedades/?cod_ofer=   → ficha completa (~180 campos)
 *   2) GET /propiedades/?extrainfo&cod_ofer=   → publishinfo + leads
 *
 * Imprime resumen de campos candidatos para construcción de URL de foto
 * principal (`lafoto`, `fotoletra`, `numagencia`, `fotos`, etc.) y de
 * `publishinfo[*].publication_url` para el link al portal.
 *
 * Uso:
 *   npx tsx scripts/discover-property-photo-extrainfo.ts
 *   npx tsx scripts/discover-property-photo-extrainfo.ts <cod_ofer>
 *
 * Si no se pasa cod_ofer, toma uno aleatorio de properties_current (primera
 * elegible para Smart Pricing: ciudad "Córdoba", nodisponible=false).
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";

const RATE_LIMIT_PAUSE_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeKeys(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.keys(obj as Record<string, unknown>).sort();
}

function findPhotoRelatedFields(payload: Record<string, unknown>): Record<string, unknown> {
  const needles = [
    "foto",
    "fotos",
    "lafoto",
    "fotoletra",
    "numagencia",
    "numfotos",
    "imagen",
    "photo",
  ];
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    const lk = k.toLowerCase();
    if (needles.some((n) => lk.includes(n))) {
      result[k] = v;
    }
  }
  return result;
}

async function pickCodOfer(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const row = await prisma.propertyCurrent.findFirst({
    where: { nodisponible: false, ciudad: { contains: "rdoba" } },
    select: { codigo: true, ref: true, titulo: true, ciudad: true, zona: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!row) throw new Error("No se encontró ninguna propiedad disponible en la DB");
  console.log(
    `[discover] usando cod_ofer=${row.codigo} (ref=${row.ref}, ${row.ciudad}/${row.zona}): ${row.titulo}`,
  );
  return row.codigo;
}

async function main(): Promise<void> {
  const explicit = process.argv[2];
  const codigo = await pickCodOfer(explicit);

  const client = createInmovillaRestClient();

  console.log("\n─── 1) GET /propiedades/?cod_ofer ───────────────────────────────");
  const ficha = await client.get<Record<string, unknown>>("/propiedades/", {
    cod_ofer: codigo,
  });

  const allKeys = summarizeKeys(ficha);
  console.log(`Total campos: ${allKeys.length}`);
  console.log(`Campos (ordenados alfabéticamente):\n${allKeys.join(", ")}`);

  console.log("\n── Campos relacionados con fotos/agencia ──");
  const photoFields = findPhotoRelatedFields(ficha);
  console.log(JSON.stringify(photoFields, null, 2));

  console.log("\n⏳ pausa de 15s (rate limit propiedades 5/min efectivo)...");
  await delay(RATE_LIMIT_PAUSE_MS);

  console.log("\n─── 2) GET /propiedades/?extrainfo&cod_ofer ─────────────────────");
  let extrainfo: unknown;
  try {
    extrainfo = await client.get<unknown>("/propiedades/", {
      extrainfo: true,
      cod_ofer: codigo,
    });
  } catch (err) {
    console.error(
      `[extrainfo] Error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  console.log("Top-level shape:");
  console.log(JSON.stringify(extrainfo, null, 2).slice(0, 4000));

  const publishinfo: unknown = Array.isArray(extrainfo)
    ? (extrainfo as Array<Record<string, unknown>>).find((e) => "publishinfo" in e)?.publishinfo
    : (extrainfo as Record<string, unknown>)?.publishinfo;

  if (publishinfo && typeof publishinfo === "object") {
    console.log("\n── publishinfo portales detectados ──");
    for (const [portal, data] of Object.entries(publishinfo)) {
      const d = data as Record<string, unknown>;
      console.log(
        `  · ${portal}: state=${d.state ?? "?"}, publication_url=${d.publication_url ?? "—"}`,
      );
    }
  } else {
    console.log("\n⚠ No se detectó `publishinfo` en la respuesta.");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
