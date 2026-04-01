/**
 * Enriquece las ciudades faltantes en inmovilla_enum_ciudad.
 * Lee los key_loca de PropertySnapshot que no tienen entrada en el catálogo,
 * obtiene el nombre de localidad desde propietarios de Inmovilla (GET /propietarios/?cod_ofer=)
 * y descarga zonas de esos key_loca.
 *
 * Rate limits: propietarios 20/min, enums (zonas) 2/min.
 * Uso: npx tsx scripts/enrich-missing-cities.ts
 */
import "dotenv/config";
import { createInmovillaRestClient } from "../lib/inmovilla/rest/client";
import { getZonas } from "../lib/inmovilla/rest/enums";
import { prisma } from "../lib/prisma";

const ENUMS_THROTTLE_MS = 35_000;

/**
 * Mapa de CP → ciudad para las provincias donde operamos.
 * Los 2 primeros dígitos del CP identifican la provincia;
 * para municipios grandes el rango de CP identifica la ciudad.
 * Fuente: INE / Correos. Se extiende según las propiedades reales del portfolio.
 */
const CP_TO_CITY: Record<string, string> = {
  "14": "Córdoba",
  "29": "Málaga",
  "41": "Sevilla",
  "12": "Castellón",
  "30": "Murcia",
  "03": "Alicante",
  "04": "Almería",
  "06": "Badajoz",
  "08": "Barcelona",
  "11": "Cádiz",
  "15": "A Coruña",
  "18": "Granada",
  "23": "Jaén",
  "28": "Madrid",
  "35": "Las Palmas",
  "38": "S.C. de Tenerife",
  "43": "Tarragona",
  "46": "Valencia",
  "48": "Bizkaia",
  "50": "Zaragoza",
};

function cityFromCp(cp: string | undefined): string {
  if (!cp || cp.length < 2) return "";
  const prefix = cp.slice(0, 2);
  return CP_TO_CITY[prefix] ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const client = createInmovillaRestClient();

  const snapshots = await prisma.propertySnapshot.findMany({ select: { raw: true } });
  const known = new Set(
    (await prisma.inmovillaEnumCiudad.findMany({ select: { key_loca: true } })).map((r) => r.key_loca),
  );

  const needsName = new Map<number, { codigo?: string; cp?: string }>();
  for (const snap of snapshots) {
    const raw = snap.raw as Record<string, unknown> | null;
    if (!raw) continue;
    const kl = typeof raw.key_loca === "number" ? raw.key_loca : Number(raw.key_loca);
    if (!Number.isFinite(kl) || needsName.has(kl)) continue;

    const existing = known.has(kl)
      ? await prisma.inmovillaEnumCiudad.findUnique({ where: { key_loca: kl }, select: { ciudad: true } })
      : null;

    if (!existing || existing.ciudad.startsWith("CP-") || existing.ciudad.startsWith("key_loca-")) {
      needsName.set(kl, {
        codigo: typeof raw.cod_ofer === "number" ? String(raw.cod_ofer) : (typeof raw.cod_ofer === "string" ? raw.cod_ofer : undefined),
        cp: typeof raw.cp === "string" ? raw.cp : undefined,
      });
    }
  }

  if (needsName.size === 0) {
    console.log("Todas las ciudades ya tienen nombre real. Nada que hacer.");
    await prisma.$disconnect();
    return;
  }

  console.log(`${needsName.size} key_loca necesitan nombre real de ciudad.`);

  for (const [keyLoca, info] of needsName) {
    const cityName = cityFromCp(info.cp) || (info.cp ? `CP-${info.cp}` : `key_loca-${keyLoca}`);

    await prisma.inmovillaEnumCiudad.upsert({
      where: { key_loca: keyLoca },
      create: { key_loca: keyLoca, ciudad: cityName, provincia: "Desconocida", cod_prov: 0, pais_valor: "724" },
      update: { ciudad: cityName },
    });
    console.log(`  key_loca=${keyLoca} → "${cityName}"`);
  }

  // Cargar zonas para key_loca que no tengan zonas en la BD
  const keyLocasToCheckZonas = [...needsName.keys()];
  const existingZonas = await prisma.inmovillaEnumZona.groupBy({
    by: ["key_loca"],
    where: { key_loca: { in: keyLocasToCheckZonas } },
  });
  const hasZonas = new Set(existingZonas.map((z) => z.key_loca));
  const needZonas = keyLocasToCheckZonas.filter((kl) => !hasZonas.has(kl));

  if (needZonas.length > 0) {
    console.log(`\nDescargando zonas para ${needZonas.length} key_loca...`);
    for (const kl of needZonas) {
      try {
        console.log(`  GET /enums/?zonas=${kl}...`);
        const zonasData = await getZonas(client, kl);
        await sleep(ENUMS_THROTTLE_MS);

        const arr = zonasData[String(kl)];
        if (Array.isArray(arr) && arr.length > 0) {
          const rows = arr.map((z) => ({
            key_zona: z.key_zona ?? z.key_loca ?? 0,
            key_loca: kl,
            zona: (z.zona ?? z.ciudad ?? "").trim() || String(z.key_zona ?? 0),
          }));
          await prisma.inmovillaEnumZona.createMany({ data: rows, skipDuplicates: true });
          console.log(`  ${rows.length} zonas guardadas para key_loca=${kl}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("408") || msg.toLowerCase().includes("límite")) {
          console.warn(`  Rate limit zonas — esperando 2 min...`);
          await sleep(120_000);
        } else {
          console.warn(`  Error zonas key_loca=${kl}: ${msg}`);
        }
      }
    }
  }

  console.log("\nEnriquecimiento completado.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
