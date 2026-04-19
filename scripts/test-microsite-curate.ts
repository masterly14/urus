/**
 * Script de test cercano a produccion para el pipeline de curacion del microsite.
 *
 * Flujo: conecta a Statefox con token real, descarga propiedades, ejecuta el
 * pipeline completo de curacion (filtro + scoring + curate) y valida que los
 * campos nuevos (description, floor, lat/lng, energyCert, etc.) se extraen.
 *
 * USO: npx tsx scripts/test-microsite-curate.ts [--demand DEM-xxx]
 *
 * Requiere: STATEFOX_BEARER_TOKEN en .env
 */

import "dotenv/config";
import {
  createStatefoxClient,
  getProperties,
  buildStatefoxQuery,
  filterStatefoxResults,
  type DemandFilterInput,
  type StatefoxProperty,
} from "../lib/statefox";
import {
  coerceMicrositeCuratedProperties,
  type MicrositeCuratedProperty,
} from "../lib/microsite/selection";

const token = process.env.STATEFOX_BEARER_TOKEN;
if (!token) {
  console.error("[test-microsite-curate] Falta STATEFOX_BEARER_TOKEN");
  process.exit(1);
}

const defaultDemand: DemandFilterInput = {
  tipos: "flat",
  zonas: "",
  presupuestoMin: 100_000,
  presupuestoMax: 600_000,
  habitacionesMin: 2,
};

function extractImages(p: StatefoxProperty): string[] {
  const urls: string[] = [];
  if (p.propertyMainImage && typeof p.propertyMainImage === "string") urls.push(p.propertyMainImage);
  const imgs = p.pImages;
  if (imgs && typeof imgs === "object") {
    for (const item of Object.values(imgs)) {
      const src = item?.src;
      if (src && typeof src === "string") urls.push(src);
    }
  }
  return Array.from(new Set(urls)).slice(0, 30);
}

function curate(propertyId: string, p: StatefoxProperty): MicrositeCuratedProperty {
  const extras = p.pExtras ?? {};
  const meters = p.pMeters ?? {};
  const point = p.pPoint ?? {};

  const labels: string[] = [];
  if (extras.terrace) labels.push("Terraza");
  if (extras.lift) labels.push("Ascensor");
  if (extras.pool) labels.push("Piscina");
  if (extras.garden) labels.push("Jardín");
  if (extras.garage) labels.push("Garaje");

  return {
    propertyId,
    title: [p.pHousing, p.pZone?.name, p.pCity?.cityName].filter(Boolean).join(" · ") || "Propiedad",
    description: typeof p.pDesc === "string" && p.pDesc.trim() ? p.pDesc.trim() : null,
    link: typeof p.pLink === "string" ? p.pLink : null,
    price: typeof p.pPrice === "number" ? p.pPrice : null,
    pricePerMeter: typeof p.pPricePerMeter === "number" ? p.pPricePerMeter : null,
    metersBuilt: typeof meters.built === "number" ? meters.built : null,
    metersUsable: typeof meters.usable === "number" ? meters.usable : null,
    metersPlot: typeof meters.plot === "number" ? meters.plot : null,
    metersTerrace: typeof meters.terrace === "number" ? meters.terrace : null,
    rooms: typeof p.pRooms === "number" ? p.pRooms : null,
    baths: typeof p.pBaths === "number" ? p.pBaths : null,
    floor: typeof p.pFloor === "string" ? p.pFloor : null,
    orientation: typeof p.pOrientation === "string" ? p.pOrientation : null,
    address: typeof p.pAddress === "string" ? p.pAddress : null,
    city: typeof p.pCity?.cityName === "string" ? p.pCity.cityName : null,
    zone: typeof p.pZone?.name === "string" ? p.pZone.name : null,
    housing: typeof p.pHousing === "string" ? p.pHousing : null,
    latitude: typeof point.latitude === "number" ? point.latitude : null,
    longitude: typeof point.longitude === "number" ? point.longitude : null,
    images: extractImages(p),
    extras: labels,
    energyCertRating: typeof extras.certenerat === "string" ? extras.certenerat : null,
    energyCertValue: typeof extras.certeneval === "string" ? extras.certeneval : null,
    yearBuilt: typeof extras.year === "string" ? extras.year : null,
    condition: typeof extras.condition === "string" ? extras.condition : null,
    advertiserType: p.pAdvert?.type === "private" || p.pAdvert?.type === "professional" ? p.pAdvert.type : null,
    advertiserName: typeof p.pAdvert?.name === "string" ? p.pAdvert.name : null,
  };
}

async function main() {
  console.log("=== Test: Pipeline de curacion del microsite ===\n");

  const client = createStatefoxClient();
  const { queryParams, resultFilters } = buildStatefoxQuery(defaultDemand, {
    type: "sale",
    source: "idealista",
    items: 50,
  });

  console.log("Query Statefox:", JSON.stringify(queryParams, null, 2));
  console.log("Filtros en memoria:", JSON.stringify(resultFilters, null, 2));

  const response = await getProperties(client, {
    source: queryParams.source,
    type: queryParams.type,
    items: queryParams.items,
    housing: queryParams.housing,
  });

  const all = Object.entries(response.properties);
  console.log(`\nPropiedades recibidas de Statefox: ${all.length}`);

  const matching = filterStatefoxResults(
    all.map(([, p]) => p),
    resultFilters,
  );
  console.log(`Propiedades tras filtro: ${matching.length}`);

  const matchingIds = new Set(
    all.filter(([, p]) => matching.includes(p)).map(([id]) => id),
  );

  const filtered = all.filter(([id]) => matchingIds.has(id));

  const curated = filtered.slice(0, 12).map(([id, p]) => curate(id, p));

  console.log(`\nPropiedades curadas: ${curated.length}`);
  console.log("---");

  const stats = {
    withDescription: 0,
    withFloor: 0,
    withOrientation: 0,
    withLatLng: 0,
    withPricePerMeter: 0,
    withEnergyCert: 0,
    withYearBuilt: 0,
    totalImages: 0,
    totalExtras: 0,
  };

  for (const p of curated) {
    if (p.description) stats.withDescription++;
    if (p.floor) stats.withFloor++;
    if (p.orientation) stats.withOrientation++;
    if (p.latitude && p.longitude) stats.withLatLng++;
    if (p.pricePerMeter) stats.withPricePerMeter++;
    if (p.energyCertRating) stats.withEnergyCert++;
    if (p.yearBuilt) stats.withYearBuilt++;
    stats.totalImages += p.images.length;
    stats.totalExtras += p.extras.length;
  }

  console.log("\n=== Cobertura de campos nuevos ===");
  console.log(`  Descripcion: ${stats.withDescription}/${curated.length}`);
  console.log(`  Planta: ${stats.withFloor}/${curated.length}`);
  console.log(`  Orientacion: ${stats.withOrientation}/${curated.length}`);
  console.log(`  Lat/Lng: ${stats.withLatLng}/${curated.length}`);
  console.log(`  Precio/m2: ${stats.withPricePerMeter}/${curated.length}`);
  console.log(`  Cert. energetico: ${stats.withEnergyCert}/${curated.length}`);
  console.log(`  Ano construccion: ${stats.withYearBuilt}/${curated.length}`);
  console.log(`  Total imagenes: ${stats.totalImages} (media: ${(stats.totalImages / Math.max(1, curated.length)).toFixed(1)}/propiedad)`);
  console.log(`  Total extras: ${stats.totalExtras} (media: ${(stats.totalExtras / Math.max(1, curated.length)).toFixed(1)}/propiedad)`);

  const roundTripped = coerceMicrositeCuratedProperties(curated);
  console.log(`\n=== Validacion coerce (roundtrip JSON) ===`);
  console.log(`  Input: ${curated.length} propiedades`);
  console.log(`  Output: ${roundTripped.length} propiedades`);

  if (roundTripped.length !== curated.length) {
    console.error("  ERROR: coerce descarto propiedades!");
    process.exit(1);
  }

  for (let i = 0; i < curated.length; i++) {
    const orig = curated[i];
    const rt = roundTripped[i];
    if (orig.propertyId !== rt.propertyId || orig.description !== rt.description || orig.latitude !== rt.latitude) {
      console.error(`  ERROR en propiedad ${orig.propertyId}: campos no coinciden tras roundtrip`);
      process.exit(1);
    }
  }
  console.log("  OK: roundtrip correcto");

  if (curated.length > 0) {
    console.log("\n=== Ejemplo de ficha curada (primera propiedad) ===");
    const sample = curated[0];
    console.log(JSON.stringify({
      ...sample,
      description: sample.description ? `${sample.description.slice(0, 100)}...` : null,
      images: `[${sample.images.length} URLs]`,
    }, null, 2));
  }

  console.log("\n=== TEST COMPLETADO ===");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
