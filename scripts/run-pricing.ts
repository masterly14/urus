/**
 * Script de integración para el Motor de Pricing v1 (M7).
 *
 * Ejecuta el análisis de pricing completo contra Neon y Statefox /snapshot,
 * con recomendación IA opcional (LangGraph).
 *
 * Uso: npx tsx scripts/run-pricing.ts --property <codigo> [--max-pages 30] [--no-recommendation]
 *
 * Requiere: DATABASE_URL, STATEFOX_BEARER_TOKEN en .env
 * Recomendación IA requiere: OPENAI_API_KEY en .env
 */

import "dotenv/config";
import { runPricingAnalysis, PricingDataIncompleteError } from "../lib/pricing";

function parseArgs(): { propertyCode: string; maxPages?: number; noRecommendation: boolean } {
  const args = process.argv.slice(2);
  let propertyCode = "";
  let maxPages: number | undefined;
  let noRecommendation = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--property" && args[i + 1]) {
      propertyCode = args[++i];
    } else if (args[i] === "--max-pages" && args[i + 1]) {
      maxPages = Number(args[++i]);
    } else if (args[i] === "--no-recommendation") {
      noRecommendation = true;
    }
  }

  if (!propertyCode) {
    console.error("Uso: npx tsx scripts/run-pricing.ts --property <codigo> [--max-pages 30] [--no-recommendation]");
    process.exit(1);
  }

  return { propertyCode, maxPages, noRecommendation };
}

async function main() {
  const { propertyCode, maxPages, noRecommendation } = parseArgs();

  console.log(`\n[run-pricing] Analizando inmueble: ${propertyCode}`);
  console.log(`[run-pricing] Endpoint: /snapshot (inventario completo)`);
  if (maxPages) console.log(`[run-pricing] Max páginas: ${maxPages}`);
  console.log(`[run-pricing] Recomendación IA: ${noRecommendation ? "desactivada" : "activada"}`);
  console.log("");

  const result = await runPricingAnalysis(propertyCode, {
    maxPages,
    generateRecommendation: !noRecommendation,
    sourceTrigger: "cli_manual",
  });

  console.log("=== Resultado del Análisis de Pricing ===\n");

  console.log("--- Input del inmueble ---");
  console.log(`  Código           : ${result.input.propertyCode}`);
  console.log(`  Precio           : ${result.input.precio.toLocaleString("es-ES")} €`);
  console.log(`  Precio/m²        : ${result.input.precioM2.toLocaleString("es-ES")} €/m²`);
  console.log(`  Metros           : ${result.input.metrosConstruidos} m²`);
  console.log(`  Habitaciones     : ${result.input.habitaciones}`);
  console.log(`  Ciudad           : ${result.input.ciudad}`);
  console.log(`  Zona             : ${result.input.zona}`);
  console.log(`  Tipología        : ${result.input.tipologiaNombre || "(no resuelta)"}`);
  console.log(`  Tipo operación   : ${result.input.tipoOperacion}`);
  console.log(`  Estado           : ${result.input.estado}`);

  console.log("\n--- Query Statefox ---");
  console.log(`  Endpoint         : /snapshot`);
  console.log(`  Housing          : ${result.queryMeta.housing}`);
  console.log(`  Type             : ${result.queryMeta.type}`);
  console.log(`  Páginas escaneadas: ${result.queryMeta.pagesScanned}`);
  console.log(`  Total API        : ${result.queryMeta.totalResultsFromAPI}`);
  console.log(`  Filtrados        : ${result.queryMeta.filteredResults}`);

  console.log("\n--- Estadísticas del Cluster ---");
  console.log(`  Comparables      : ${result.stats.totalComparables}`);

  if (result.stats.semaforo === "sin_datos") {
    console.log("\n  ⚠ SIN DATOS: No se encontraron comparables en Statefox para esta ciudad/tipología.");
    console.log("  El sistema no puede emitir diagnóstico sin información de mercado.");
    console.log("  Posibles causas: Statefox no rastrea esta ciudad con el token actual.");
  } else {
    console.log(`  Precio medio/m²  : ${result.stats.precioMedioM2.toLocaleString("es-ES")} €/m²`);
    console.log(`  Mediana/m²       : ${result.stats.precioMedianaM2.toLocaleString("es-ES")} €/m²`);
    console.log(`  Min/m²           : ${result.stats.precioMinM2.toLocaleString("es-ES")} €/m²`);
    console.log(`  Max/m²           : ${result.stats.precioMaxM2.toLocaleString("es-ES")} €/m²`);
    console.log(`  Desviación       : ${result.stats.desviacionEstandar}`);
    console.log(`  Particular avg   : ${result.stats.precioMedioM2Particular?.toLocaleString("es-ES") ?? "N/A"} €/m²`);
    console.log(`  Profesional avg  : ${result.stats.precioMedioM2Profesional?.toLocaleString("es-ES") ?? "N/A"} €/m²`);

    console.log("\n--- Diagnóstico ---");
    console.log(`  Gap precio       : ${result.stats.gapPorcentaje > 0 ? "+" : ""}${result.stats.gapPorcentaje}%`);
    console.log(`  Semáforo         : ${result.stats.semaforo.toUpperCase()}`);
  }

  if (result.comparables.length > 0) {
    console.log("\n--- Top 5 Comparables ---");
    const top5 = result.comparables.slice(0, 5);
    for (const c of top5) {
      console.log(
        `  ${c.statefoxId} | ${c.precio.toLocaleString("es-ES")} € | ${c.precioM2} €/m² | ${c.metrosConstruidos}m² | ${c.advertiserType} | ${c.ciudad} ${c.zona}`,
      );
    }
  }

  // Recomendación IA (LangGraph)
  if (result.recommendation) {
    const rec = result.recommendation;
    console.log("\n--- Recomendación IA (LangGraph) ---");
    console.log(`  Acción           : ${rec.accion.toUpperCase()}`);
    console.log(`  Confianza        : ${(rec.confidence * 100).toFixed(0)}%`);
    console.log(`\n  Diagnóstico:`);
    console.log(`    ${rec.diagnostico}`);

    if (rec.precioSugeridoMin != null || rec.precioSugeridoMax != null) {
      console.log(`\n  Precio sugerido  : ${rec.precioSugeridoMin?.toLocaleString("es-ES") ?? "—"} € – ${rec.precioSugeridoMax?.toLocaleString("es-ES") ?? "—"} €`);
    }

    if (rec.recomendaciones.length > 0) {
      console.log(`\n  Recomendaciones:`);
      rec.recomendaciones.forEach((r, i) => console.log(`    ${i + 1}. ${r}`));
    }

    if (rec.argumentosComerciales.length > 0) {
      console.log(`\n  Argumentos comerciales:`);
      rec.argumentosComerciales.forEach((a) => console.log(`    + ${a}`));
    }

    if (rec.riesgos.length > 0) {
      console.log(`\n  Riesgos:`);
      rec.riesgos.forEach((r) => console.log(`    ! ${r}`));
    }
  } else if (result.recommendationError) {
    console.log("\n--- Recomendación IA ---");
    console.log(`  Error: ${result.recommendationError}`);
  } else if (noRecommendation) {
    console.log("\n--- Recomendación IA: omitida (--no-recommendation) ---");
  }

  console.log(`\n  Analizado a las  : ${result.analyzedAt}`);
  console.log("\n==========================================\n");
}

main().catch((err) => {
  if (err instanceof PricingDataIncompleteError) {
    console.error(`\n[run-pricing] Datos incompletos: ${err.message}`);
    console.error(`  Campos faltantes: ${err.missingFields.join(", ")}`);
    process.exit(1);
  }
  console.error("[run-pricing] Error fatal:", err.message ?? err);
  process.exit(1);
});
