-- M7+: base de estudio de mercado (densidad INE, POIs, tiempos de viaje)
-- y extensión de pricing_reports con bloques zoneStudy + optimalPricing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DemographicDensityBucket') THEN
    CREATE TYPE "DemographicDensityBucket" AS ENUM ('baja', 'media', 'alta', 'muy_alta');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ZonePoiType') THEN
    CREATE TYPE "ZonePoiType" AS ENUM ('transport', 'school', 'health', 'retail', 'green');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ZoneTravelMode') THEN
    CREATE TYPE "ZoneTravelMode" AS ENUM ('driving', 'transit', 'walking');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ZoneTravelDestinationType') THEN
    CREATE TYPE "ZoneTravelDestinationType" AS ENUM ('city_center', 'transport', 'school', 'health', 'retail', 'green');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "demographic_zone_index" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "districtCode" TEXT NOT NULL,
  "districtName" TEXT NOT NULL,
  "zoneCode" TEXT,
  "zoneName" TEXT,
  "population" INTEGER NOT NULL,
  "surfaceKm2" DOUBLE PRECISION NOT NULL,
  "densityPerKm2" DOUBLE PRECISION NOT NULL,
  "densityBucket" "DemographicDensityBucket" NOT NULL,
  "year" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "geometryRef" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "demographic_zone_index_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "zone_poi_index" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "zoneCode" TEXT,
  "districtCode" TEXT,
  "poiType" "ZonePoiType" NOT NULL,
  "name" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "rating" DOUBLE PRECISION,
  "address" TEXT,
  "source" TEXT NOT NULL,
  "externalId" TEXT,
  "fetchedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zone_poi_index_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "zone_travel_time_index" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "originZoneCode" TEXT NOT NULL,
  "originZoneName" TEXT NOT NULL,
  "destinationType" "ZoneTravelDestinationType" NOT NULL,
  "destinationName" TEXT NOT NULL,
  "mode" "ZoneTravelMode" NOT NULL,
  "minutesP50" DOUBLE PRECISION NOT NULL,
  "minutesP90" DOUBLE PRECISION NOT NULL,
  "distanceKmP50" DOUBLE PRECISION,
  "sampleSize" INTEGER NOT NULL DEFAULT 1,
  "source" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zone_travel_time_index_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "demographic_zone_index_city_districtCode_year_key"
  ON "demographic_zone_index" ("city", "districtCode", "year");
CREATE INDEX IF NOT EXISTS "demographic_zone_index_city_year_idx"
  ON "demographic_zone_index" ("city", "year");
CREATE INDEX IF NOT EXISTS "demographic_zone_index_city_zoneCode_idx"
  ON "demographic_zone_index" ("city", "zoneCode");
CREATE INDEX IF NOT EXISTS "demographic_zone_index_city_densityBucket_idx"
  ON "demographic_zone_index" ("city", "densityBucket");

CREATE UNIQUE INDEX IF NOT EXISTS "zone_poi_index_source_externalId_key"
  ON "zone_poi_index" ("source", "externalId");
CREATE INDEX IF NOT EXISTS "zone_poi_index_city_zoneCode_poiType_idx"
  ON "zone_poi_index" ("city", "zoneCode", "poiType");
CREATE INDEX IF NOT EXISTS "zone_poi_index_city_districtCode_poiType_idx"
  ON "zone_poi_index" ("city", "districtCode", "poiType");
CREATE INDEX IF NOT EXISTS "zone_poi_index_city_poiType_rating_idx"
  ON "zone_poi_index" ("city", "poiType", "rating");

CREATE UNIQUE INDEX IF NOT EXISTS "zone_travel_time_index_city_originZoneCode_destinationType_destinationName_mode_key"
  ON "zone_travel_time_index" ("city", "originZoneCode", "destinationType", "destinationName", "mode");
CREATE INDEX IF NOT EXISTS "zone_travel_time_index_city_originZoneCode_mode_idx"
  ON "zone_travel_time_index" ("city", "originZoneCode", "mode");
CREATE INDEX IF NOT EXISTS "zone_travel_time_index_city_destinationType_mode_idx"
  ON "zone_travel_time_index" ("city", "destinationType", "mode");

ALTER TABLE "pricing_reports"
  ADD COLUMN IF NOT EXISTS "zoneStudy" JSONB,
  ADD COLUMN IF NOT EXISTS "optimalPricing" JSONB;
