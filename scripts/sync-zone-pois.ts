import { prisma } from "@/lib/prisma";

type PoiKind = "transport" | "school";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [key, value] = token.replace(/^--/, "").split("=");
    args.set(key, value ?? "true");
  }
  return {
    city: args.get("city") ?? "Cordoba",
    limit: Number(args.get("limit") ?? "20"),
    radiusMeters: Number(args.get("radius") ?? "1500"),
    dryRun: args.get("dry-run") === "true",
    source: args.get("source") ?? "google_places",
  };
}

function getMapsApiKey(): string | null {
  const serverKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (serverKey) return serverKey;
  const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim();
  return publicKey || null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

interface NearbySearchResponse {
  status: string;
  error_message?: string;
  results?: Array<{
    place_id: string;
    name: string;
    vicinity?: string;
    rating?: number;
    geometry?: {
      location?: { lat?: number; lng?: number };
    };
  }>;
}

async function fetchNearbyPois(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  kind: PoiKind;
  apiKey: string;
}): Promise<NearbySearchResponse["results"]> {
  const location = `${params.lat},${params.lng}`;
  const type = params.kind === "transport" ? "transit_station" : "school";
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", location);
  url.searchParams.set("radius", String(params.radiusMeters));
  url.searchParams.set("type", type);
  url.searchParams.set("language", "es");
  url.searchParams.set("key", params.apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`google_places_http_${response.status}`);
  const body = (await response.json()) as NearbySearchResponse;
  if (body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    throw new Error(`google_places_status_${body.status}${body.error_message ? `:${body.error_message}` : ""}`);
  }
  return body.results ?? [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY (o NEXT_PUBLIC_GOOGLE_MAPS_KEY) no configurada");
  }

  const listings = await prisma.marketListing.findMany({
    where: {
      city: args.city,
      status: "active",
      lat: { not: null },
      lng: { not: null },
      zone: { not: null },
    },
    select: {
      zone: true,
      lat: true,
      lng: true,
    },
    orderBy: { updatedAt: "desc" },
    take: Math.max(args.limit * 40, 200),
  });

  const zoneCoords = new Map<string, { lat: number[]; lng: number[] }>();
  for (const row of listings) {
    if (!row.zone || row.lat == null || row.lng == null) continue;
    if (!zoneCoords.has(row.zone)) {
      zoneCoords.set(row.zone, { lat: [], lng: [] });
    }
    const bucket = zoneCoords.get(row.zone)!;
    bucket.lat.push(row.lat);
    bucket.lng.push(row.lng);
  }

  const zoneProfiles = await prisma.marketZoneProfile.findMany({
    select: { suggestedZoneCode: true, zoneNameCanonical: true },
  });
  const zoneCodeByName = new Map(
    zoneProfiles.map((row) => [row.zoneNameCanonical.trim().toLowerCase(), row.suggestedZoneCode]),
  );

  const zones = Array.from(zoneCoords.entries())
    .slice(0, args.limit)
    .map(([zoneName, coords]) => ({
      zoneName,
      zoneCode: zoneCodeByName.get(zoneName.trim().toLowerCase()) ?? null,
      lat: avg(coords.lat),
      lng: avg(coords.lng),
    }))
    .filter((item): item is { zoneName: string; zoneCode: string | null; lat: number; lng: number } =>
      typeof item.lat === "number" && typeof item.lng === "number",
    );

  console.log(
    `[zone-poi-sync] city=${args.city} zones=${zones.length} dryRun=${args.dryRun} radius=${args.radiusMeters}`,
  );

  let upserts = 0;
  for (const zone of zones) {
    const [transport, schools] = await Promise.all([
      fetchNearbyPois({
        lat: zone.lat,
        lng: zone.lng,
        radiusMeters: args.radiusMeters,
        kind: "transport",
        apiKey,
      }),
      fetchNearbyPois({
        lat: zone.lat,
        lng: zone.lng,
        radiusMeters: args.radiusMeters,
        kind: "school",
        apiKey,
      }),
    ]);

    const ingest = async (kind: PoiKind, results: NearbySearchResponse["results"]) => {
      for (const poi of results ?? []) {
        const lat = poi.geometry?.location?.lat;
        const lng = poi.geometry?.location?.lng;
        if (lat == null || lng == null) continue;
        if (args.dryRun) {
          upserts += 1;
          continue;
        }
        await prisma.zonePoiIndex.upsert({
          where: {
            source_externalId: {
              source: args.source,
              externalId: poi.place_id,
            },
          },
          create: {
            city: args.city,
            zoneCode: zone.zoneCode,
            poiType: kind,
            districtCode: null,
            name: poi.name,
            lat,
            lng,
            rating: poi.rating ?? null,
            address: poi.vicinity ?? null,
            source: args.source,
            externalId: poi.place_id,
            fetchedAt: new Date(),
          },
          update: {
            city: args.city,
            zoneCode: zone.zoneCode,
            poiType: kind,
            name: poi.name,
            lat,
            lng,
            rating: poi.rating ?? null,
            address: poi.vicinity ?? null,
            fetchedAt: new Date(),
          },
        });
        upserts += 1;
      }
    };

    await ingest("transport", transport);
    await ingest("school", schools);
    console.log(`[zone-poi-sync] zone=${zone.zoneName} transport=${transport?.length ?? 0} schools=${schools?.length ?? 0}`);
  }

  console.log(`[zone-poi-sync] done upserts=${upserts}`);
}

main()
  .catch((error) => {
    console.error("[zone-poi-sync] error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
