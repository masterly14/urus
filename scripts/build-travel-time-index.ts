import { prisma } from "@/lib/prisma";

type TravelMode = "driving" | "transit" | "walking";

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
    dryRun: args.get("dry-run") === "true",
    source: args.get("source") ?? "google_distance_matrix",
    cityCenter: args.get("city-center") ?? process.env.MARKET_CITY_CENTER_COORDS ?? "37.8882,-4.7794",
  };
}

function getMapsApiKey(): string | null {
  const serverKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (serverKey) return serverKey;
  const publicKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim();
  return publicKey || null;
}

function parseCoords(value: string): { lat: number; lng: number } {
  const [latRaw, lngRaw] = value.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Coordenadas inválidas: ${value}`);
  }
  return { lat, lng };
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

interface DistanceMatrixResponse {
  status: string;
  error_message?: string;
  destination_addresses: string[];
  rows: Array<{
    elements: Array<{
      status: string;
      duration?: { value: number };
      distance?: { value: number };
    }>;
  }>;
}

async function fetchDistanceMatrix(params: {
  origin: { lat: number; lng: number };
  destinations: Array<{ name: string; lat: number; lng: number }>;
  mode: TravelMode;
  apiKey: string;
}): Promise<DistanceMatrixResponse> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${params.origin.lat},${params.origin.lng}`);
  url.searchParams.set(
    "destinations",
    params.destinations.map((item) => `${item.lat},${item.lng}`).join("|"),
  );
  url.searchParams.set("mode", params.mode);
  url.searchParams.set("language", "es");
  url.searchParams.set("key", params.apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) throw new Error(`distance_matrix_http_${response.status}`);
  const body = (await response.json()) as DistanceMatrixResponse;
  if (body.status !== "OK") {
    throw new Error(`distance_matrix_status_${body.status}${body.error_message ? `:${body.error_message}` : ""}`);
  }
  return body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = getMapsApiKey();
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY (o NEXT_PUBLIC_GOOGLE_MAPS_KEY) no configurada");
  }

  const cityCenter = parseCoords(args.cityCenter);
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

  const poiDestinations = await prisma.zonePoiIndex.findMany({
    where: {
      city: args.city,
      poiType: { in: ["transport", "school"] },
    },
    orderBy: [{ rating: "desc" }, { updatedAt: "desc" }],
    take: 6,
    select: {
      name: true,
      lat: true,
      lng: true,
      poiType: true,
    },
  });

  const destinations = [
    { name: "Centro ciudad", lat: cityCenter.lat, lng: cityCenter.lng, type: "city_center" as const },
    ...poiDestinations.map((poi) => ({
      name: poi.name,
      lat: poi.lat,
      lng: poi.lng,
      type: poi.poiType === "transport" ? "transport" as const : "school" as const,
    })),
  ];

  const origins = Array.from(zoneCoords.entries())
    .slice(0, args.limit)
    .map(([zoneName, coords]) => ({
      zoneName,
      zoneCode: zoneCodeByName.get(zoneName.trim().toLowerCase()) ?? zoneName.toUpperCase().replace(/\s+/g, "_"),
      lat: avg(coords.lat),
      lng: avg(coords.lng),
    }))
    .filter((item): item is { zoneName: string; zoneCode: string; lat: number; lng: number } =>
      typeof item.lat === "number" && typeof item.lng === "number",
    );

  console.log(
    `[travel-index] city=${args.city} origins=${origins.length} destinations=${destinations.length} dryRun=${args.dryRun}`,
  );

  let upserts = 0;
  for (const origin of origins) {
    for (const mode of ["driving", "transit", "walking"] as const) {
      const matrix = await fetchDistanceMatrix({
        origin: { lat: origin.lat, lng: origin.lng },
        destinations,
        mode,
        apiKey,
      });
      const elements = matrix.rows[0]?.elements ?? [];
      for (let i = 0; i < elements.length; i += 1) {
        const destination = destinations[i];
        const element = elements[i];
        if (!destination || !element || element.status !== "OK") continue;

        const minutes = Math.round((element.duration?.value ?? 0) / 60);
        const distanceKm = (element.distance?.value ?? 0) / 1000;
        if (args.dryRun) {
          upserts += 1;
          continue;
        }

        await prisma.zoneTravelTimeIndex.upsert({
          where: {
            city_originZoneCode_destinationType_destinationName_mode: {
              city: args.city,
              originZoneCode: origin.zoneCode,
              destinationType: destination.type,
              destinationName: destination.name,
              mode,
            },
          },
          create: {
            city: args.city,
            originZoneCode: origin.zoneCode,
            originZoneName: origin.zoneName,
            destinationType: destination.type,
            destinationName: destination.name,
            mode,
            minutesP50: minutes,
            minutesP90: Math.round(minutes * 1.25),
            distanceKmP50: Math.round(distanceKm * 100) / 100,
            sampleSize: 1,
            source: args.source,
          },
          update: {
            originZoneName: origin.zoneName,
            minutesP50: minutes,
            minutesP90: Math.round(minutes * 1.25),
            distanceKmP50: Math.round(distanceKm * 100) / 100,
            sampleSize: 1,
            source: args.source,
            computedAt: new Date(),
          },
        });
        upserts += 1;
      }
    }
    console.log(`[travel-index] origin=${origin.zoneName} updated`);
  }

  console.log(`[travel-index] done upserts=${upserts}`);
}

main()
  .catch((error) => {
    console.error("[travel-index] error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
