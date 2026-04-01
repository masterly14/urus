/**
 * Debug: compara volumen de /properties vs /snapshot en Statefox
 * y muestra qué ciudades existen en el snapshot.
 */

import "dotenv/config";

const token = process.env.STATEFOX_BEARER_TOKEN;
if (!token) { console.error("Falta STATEFOX_BEARER_TOKEN"); process.exit(1); }

const headers = { Authorization: `Bearer ${token}` };
const base = "https://statefox.com/public/aapi/props";

async function fetchJSON(url: string) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

async function main() {
  console.log("\n=== 1) /properties — volumen por source (flat, sale, items=500) ===\n");
  for (const source of ["idealista", "fotocasa", "pisoscom", "habitaclia"]) {
    const data = await fetchJSON(`${base}/properties?source=${source}&type=sale&items=500&housing=flat`);
    const props = data.result ?? data.properties ?? {};
    const count = Object.keys(props).length;
    const cities = new Set<string>();
    for (const p of Object.values(props) as Array<{ pCity?: { cityName?: string } }>) {
      if (p.pCity?.cityName) cities.add(p.pCity.cityName);
    }
    console.log(`  ${source}: ${count} props, total=${data.meta?.total ?? "?"}, ciudades=[${[...cities].join(", ")}]`);
  }

  console.log("\n=== 2) /snapshot — volumen total (sale, active, paginando) ===\n");
  let cursor: string | null | undefined = undefined;
  let totalSnap = 0;
  let pages = 0;
  const cityCounts = new Map<string, number>();
  const housingCounts = new Map<string, number>();

  while (pages < 20) {
    const url = new URL(`${base}/snapshot`);
    url.searchParams.set("items", "250");
    url.searchParams.set("type", "sale");
    url.searchParams.set("status", "active");
    if (cursor) url.searchParams.set("next", cursor);

    const data = await fetchJSON(url.toString());
    const result = data.result ?? {};
    const entries = Object.values(result) as Array<{
      pCity?: { cityName?: string; cityRegion?: string };
      pHousing?: string;
      pPrice?: number;
    }>;
    totalSnap += entries.length;
    pages++;

    for (const p of entries) {
      const city = p.pCity?.cityName ?? "(vacío)";
      cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
      const housing = p.pHousing ?? "(vacío)";
      housingCounts.set(housing, (housingCounts.get(housing) ?? 0) + 1);
    }

    cursor = data.meta?.next ?? null;
    console.log(`  Página ${pages}: ${entries.length} props (acumulado: ${totalSnap}), next=${cursor ? "sí" : "null"}`);

    if (!cursor || entries.length === 0) break;
  }

  console.log(`\n  Total snapshot (hasta ${pages} páginas): ${totalSnap}`);

  console.log("\n  Ciudades encontradas (top 20):");
  const sortedCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [city, count] of sortedCities) {
    console.log(`    ${city}: ${count}`);
  }

  console.log("\n  Housing types:");
  for (const [h, count] of [...housingCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${h}: ${count}`);
  }

  console.log("\n==================\n");
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
