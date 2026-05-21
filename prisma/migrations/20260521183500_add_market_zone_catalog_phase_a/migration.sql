-- Fase A: catálogo de zonas de mercado (Córdoba, key_loca Inmovilla).
-- Incluye perfiles, relaciones normalizadas y aliases para resolución canónica.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneValidationPriority') THEN
    CREATE TYPE "MarketZoneValidationPriority" AS ENUM ('P1_active_inventory', 'P2_historical_inventory', 'P3_no_stock');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneCoverageStatus') THEN
    CREATE TYPE "MarketZoneCoverageStatus" AS ENUM ('validated', 'known_unprofiled', 'redirected', 'out_of_scope', 'deprecated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZonePricingProfileStatus') THEN
    CREATE TYPE "MarketZonePricingProfileStatus" AS ENUM ('ready', 'heuristic', 'not_ready', 'redirected', 'not_applicable', 'deprecated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneMacroArea') THEN
    CREATE TYPE "MarketZoneMacroArea" AS ENUM ('Centro', 'Norte', 'Sur', 'Este', 'Oeste', 'Sierra', 'Periurbano');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneMarketSegment') THEN
    CREATE TYPE "MarketZoneMarketSegment" AS ENUM ('popular', 'medio', 'medio_alto', 'premium');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneQualityProfile') THEN
    CREATE TYPE "MarketZoneQualityProfile" AS ENUM ('basico', 'medio', 'alto');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneDemandLevel') THEN
    CREATE TYPE "MarketZoneDemandLevel" AS ENUM ('baja', 'media', 'alta');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneLiquidityLevel') THEN
    CREATE TYPE "MarketZoneLiquidityLevel" AS ENUM ('lenta', 'media', 'rapida');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneBuildingAgeProfile') THEN
    CREATE TYPE "MarketZoneBuildingAgeProfile" AS ENUM ('nuevo', 'mixto', 'antiguo');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneComparableRadiusMode') THEN
    CREATE TYPE "MarketZoneComparableRadiusMode" AS ENUM ('intra_zone_only', 'zone_plus_mirrors', 'dynamic');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneSourceQuality') THEN
    CREATE TYPE "MarketZoneSourceQuality" AS ENUM ('alta', 'media', 'baja');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneRelationType') THEN
    CREATE TYPE "MarketZoneRelationType" AS ENUM ('comparable', 'not_comparable');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneRelationStrength') THEN
    CREATE TYPE "MarketZoneRelationStrength" AS ENUM ('strong', 'medium', 'weak');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MarketZoneAliasType') THEN
    CREATE TYPE "MarketZoneAliasType" AS ENUM ('canonical', 'inmovilla_name', 'raw_variant', 'redirect_legacy');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "market_zone_profiles" (
  "id" TEXT NOT NULL,
  "catalogVersion" TEXT NOT NULL DEFAULT 'v1.1',
  "priorityRank" INTEGER NOT NULL,
  "validationPriority" "MarketZoneValidationPriority" NOT NULL,
  "keyLoca" INTEGER NOT NULL,
  "keyZona" INTEGER NOT NULL,
  "zonaInmovilla" TEXT NOT NULL,
  "suggestedZoneCode" TEXT NOT NULL,
  "coverageStatus" "MarketZoneCoverageStatus" NOT NULL,
  "pricingProfileStatus" "MarketZonePricingProfileStatus" NOT NULL,
  "zoneNameCanonical" TEXT NOT NULL,
  "macroArea" "MarketZoneMacroArea",
  "marketSegment" "MarketZoneMarketSegment",
  "qualityProfile" "MarketZoneQualityProfile",
  "demandLevel" "MarketZoneDemandLevel",
  "liquidityLevel" "MarketZoneLiquidityLevel",
  "priceBandM2Min" DOUBLE PRECISION,
  "priceBandM2Max" DOUBLE PRECISION,
  "dominantHousingTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "buildingAgeProfile" "MarketZoneBuildingAgeProfile",
  "amenitiesProfile" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "comparableRadiusMode" "MarketZoneComparableRadiusMode",
  "comparableWithZoneCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notComparableWithZoneCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceQuality" "MarketZoneSourceQuality",
  "ownerTeam" TEXT NOT NULL DEFAULT '',
  "validatedBy" TEXT,
  "validatedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "redirectToZoneCode" TEXT,
  "inventoryCountActive" INTEGER NOT NULL DEFAULT 0,
  "inventoryCountHistorical" INTEGER NOT NULL DEFAULT 0,
  "avgPriceM2Active" DOUBLE PRECISION,
  "medianPriceM2Active" DOUBLE PRECISION,
  "avgPriceM2Historical" DOUBLE PRECISION,
  "medianPriceM2Historical" DOUBLE PRECISION,
  "unitSizeMinActive" DOUBLE PRECISION,
  "unitSizeMaxActive" DOUBLE PRECISION,
  "dominantTiposDetected" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sampleActivePropertyCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sampleHistoricalPropertyCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rawZoneVariants" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT NOT NULL DEFAULT '',
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_zone_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "market_zone_relations" (
  "id" TEXT NOT NULL,
  "catalogVersion" TEXT NOT NULL DEFAULT 'v1.1',
  "fromZoneCode" TEXT NOT NULL,
  "toZoneCode" TEXT NOT NULL,
  "relationType" "MarketZoneRelationType" NOT NULL,
  "strength" "MarketZoneRelationStrength" NOT NULL DEFAULT 'medium',
  "reason" TEXT,
  "isSymmetric" BOOLEAN NOT NULL DEFAULT false,
  "asymmetryReason" TEXT,
  "conflictResolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_zone_relations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "market_zone_aliases" (
  "id" TEXT NOT NULL,
  "keyLoca" INTEGER NOT NULL,
  "keyZona" INTEGER NOT NULL,
  "zoneCode" TEXT NOT NULL,
  "aliasRaw" TEXT NOT NULL,
  "aliasNormalized" TEXT NOT NULL,
  "aliasType" "MarketZoneAliasType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "market_zone_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "market_zone_profiles_keyZona_key" ON "market_zone_profiles" ("keyZona");
CREATE UNIQUE INDEX IF NOT EXISTS "market_zone_profiles_suggestedZoneCode_key" ON "market_zone_profiles" ("suggestedZoneCode");
CREATE INDEX IF NOT EXISTS "market_zone_profiles_catalogVersion_keyLoca_idx" ON "market_zone_profiles" ("catalogVersion", "keyLoca");
CREATE INDEX IF NOT EXISTS "market_zone_profiles_coverageStatus_pricingProfileStatus_idx" ON "market_zone_profiles" ("coverageStatus", "pricingProfileStatus");
CREATE INDEX IF NOT EXISTS "market_zone_profiles_isActive_pricingProfileStatus_idx" ON "market_zone_profiles" ("isActive", "pricingProfileStatus");
CREATE INDEX IF NOT EXISTS "market_zone_profiles_validationPriority_priorityRank_idx" ON "market_zone_profiles" ("validationPriority", "priorityRank");
CREATE INDEX IF NOT EXISTS "market_zone_profiles_zoneNameCanonical_idx" ON "market_zone_profiles" ("zoneNameCanonical");

CREATE UNIQUE INDEX IF NOT EXISTS "market_zone_relations_fromZoneCode_toZoneCode_relationType_key"
  ON "market_zone_relations" ("fromZoneCode", "toZoneCode", "relationType");
CREATE INDEX IF NOT EXISTS "market_zone_relations_fromZoneCode_relationType_idx" ON "market_zone_relations" ("fromZoneCode", "relationType");
CREATE INDEX IF NOT EXISTS "market_zone_relations_toZoneCode_relationType_idx" ON "market_zone_relations" ("toZoneCode", "relationType");
CREATE INDEX IF NOT EXISTS "market_zone_relations_catalogVersion_idx" ON "market_zone_relations" ("catalogVersion");

CREATE UNIQUE INDEX IF NOT EXISTS "market_zone_aliases_zoneCode_aliasNormalized_aliasType_key"
  ON "market_zone_aliases" ("zoneCode", "aliasNormalized", "aliasType");
CREATE INDEX IF NOT EXISTS "market_zone_aliases_keyLoca_keyZona_idx" ON "market_zone_aliases" ("keyLoca", "keyZona");
CREATE INDEX IF NOT EXISTS "market_zone_aliases_aliasNormalized_idx" ON "market_zone_aliases" ("aliasNormalized");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'market_zone_relations_fromZoneCode_fkey'
      AND table_name = 'market_zone_relations'
  ) THEN
    ALTER TABLE "market_zone_relations"
      ADD CONSTRAINT "market_zone_relations_fromZoneCode_fkey"
      FOREIGN KEY ("fromZoneCode") REFERENCES "market_zone_profiles"("suggestedZoneCode")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'market_zone_relations_toZoneCode_fkey'
      AND table_name = 'market_zone_relations'
  ) THEN
    ALTER TABLE "market_zone_relations"
      ADD CONSTRAINT "market_zone_relations_toZoneCode_fkey"
      FOREIGN KEY ("toZoneCode") REFERENCES "market_zone_profiles"("suggestedZoneCode")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'market_zone_aliases_zoneCode_fkey'
      AND table_name = 'market_zone_aliases'
  ) THEN
    ALTER TABLE "market_zone_aliases"
      ADD CONSTRAINT "market_zone_aliases_zoneCode_fkey"
      FOREIGN KEY ("zoneCode") REFERENCES "market_zone_profiles"("suggestedZoneCode")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
