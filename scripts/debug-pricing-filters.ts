/**
 * Debug: muestra exactamente por qué cada propiedad de Statefox es descartada
 * en los filtros de pricing para un inmueble dado.
 *
 * Uso: npx tsx scripts/debug-pricing-filters.ts --property <codigo>
 */

import "dotenv/config";
import { extractPropertyForPricing } from "../lib/pricing/extract-property";
import { mapTiposToHousing } from "../lib/statefox/query-builder";
import { createStatefoxClient, getProperties } from "../lib/statefox/client";
import type { StatefoxSource, StatefoxProperty, GetPropertiesFilters } from "../lib/statefox/types";

const SOURCES: StatefoxSource[] = ["idealista", "fotocasa", "pisoscom", "habitaclia"];
const PRICE_RANGE = 20;
const METERS_RANGE = 20;

function normalize(s: string): string {
  return s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseArgs(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--property" && args[i + 1]) return args[++i];
  }
  console.error("Uso: npx tsx scripts/debug-pricing-filters.ts --property <codigo>");
  process.exit(1);
}

async function main() {
  const code = parseArgs();
  const input = await extractPropertyForPricing(code);
  const housing = mapTiposToHousing(input.tipologiaNombre);
  const client = createStatefoxClient();

  const priceMin = input.precio * (1 - PRICE_RANGE / 100);
  const priceMax = input.precio * (1 + PRICE_RANGE / 100);
  const metersMin = input.metrosConstruidos * (1 - METERS_RANGE / 100);
  const metersMax = input.metrosConstruidos * (1 + METERS_RANGE / 100);

  console.log("\n=== DEBUG FILTROS DE PRICING ===\n");
  console.log(`Inmueble  : ${code}`);
  console.log(`Ciudad    : "${input.ciudad}"`);
  console.log(`Precio    : ${input.precio} € → rango ±${PRICE_RANGE}%: [${priceMin.toFixed(0)}–${priceMax.toFixed(0)}]`);
  console.log(`Metros    : ${input.metrosConstruidos} m² → rango ±${METERS_RANGE}%: [${metersMin.toFixed(1)}–${metersMax.toFixed(1)}]`);
  console.log(`Housing   : ${housing}`);
  console.log(`Tipología : ${input.tipologiaNombre}`);

  let totalAPI = 0;
  let rejectedCity = 0;
  let rejectedPrice = 0;
  let rejectedMeters = 0;
  let rejectedNoPrice = 0;
  let passed = 0;

  for (const source of SOURCES) {
    const filters: GetPropertiesFilters = {
      source,
      type: input.tipoOperacion,
      housing,
      items: 500,
    };

    let response;
    try {
      response = await getProperties(client, filters);
    } catch (err) {
      console.error(`\n[${source}] ERROR: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const entries = Object.entries(response.properties ?? {});
    totalAPI += entries.length;
    console.log(`\n--- ${source}: ${entries.length} resultados ---`);

    for (const [id, prop] of entries) {
      const p = prop as StatefoxProperty;
      const cityName = p.pCity?.cityName ?? "(vacío)";
      const price = p.pPrice ?? 0;
      const meters = p.pMeters?.built ?? 0;

      const cityNorm = normalize(cityName);
      const targetNorm = normalize(input.ciudad);
      const cityMatch = cityNorm.includes(targetNorm) || targetNorm.includes(cityNorm);
      const priceMatch = price >= priceMin && price <= priceMax;
      const metersMatch = meters <= 0 || (meters >= metersMin && meters <= metersMax);

      const reasons: string[] = [];
      if (price <= 0) { reasons.push("SIN_PRECIO"); rejectedNoPrice++; }
      else {
        if (!cityMatch) { reasons.push(`CIUDAD="${cityName}"`); rejectedCity++; }
        if (!priceMatch) { reasons.push(`PRECIO=${price}`); rejectedPrice++; }
        if (!metersMatch) { reasons.push(`METROS=${meters}`); rejectedMeters++; }
      }

      if (reasons.length === 0) {
        passed++;
        console.log(`  ✅ ${id} | ${cityName} | ${price}€ | ${meters}m² | ${p.pPricePerMeter ?? "?"}€/m²`);
      } else {
        console.log(`  ❌ ${id} | ${cityName} | ${price}€ | ${meters}m² | descartado: ${reasons.join(", ")}`);
      }
    }
  }

  console.log("\n=== RESUMEN ===");
  console.log(`Total API         : ${totalAPI}`);
  console.log(`Descartados       :`);
  console.log(`  - Sin precio    : ${rejectedNoPrice}`);
  console.log(`  - Por ciudad    : ${rejectedCity}`);
  console.log(`  - Por precio    : ${rejectedPrice}`);
  console.log(`  - Por metros    : ${rejectedMeters}`);
  console.log(`Pasaron filtros   : ${passed}`);
  console.log("================\n");
}

main().catch((err) => {
  console.error("[debug] Error fatal:", err.message ?? err);
  process.exit(1);
});
