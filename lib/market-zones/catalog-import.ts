import type { PrismaClient } from "@prisma/client";

export type ImportSeverity = "error" | "warning";

export interface ImportIssue {
  severity: ImportSeverity;
  rowNumber: number;
  zoneCode?: string;
  message: string;
}

export interface MarketZoneCsvRow {
  rowNumber: number;
  priorityRank: number;
  validationPriority: "P1_active_inventory" | "P2_historical_inventory" | "P3_no_stock";
  keyLoca: number;
  keyZona: number;
  zonaInmovilla: string;
  suggestedZoneCode: string;
  coverageStatus: "validated" | "known_unprofiled" | "redirected" | "out_of_scope" | "deprecated";
  pricingProfileStatus: "ready" | "heuristic" | "not_ready" | "redirected" | "not_applicable" | "deprecated";
  zoneNameCanonical: string;
  macroArea: string | null;
  marketSegment: string | null;
  qualityProfile: string | null;
  demandLevel: string | null;
  liquidityLevel: string | null;
  priceBandM2Min: number | null;
  priceBandM2Max: number | null;
  dominantHousingTypes: string[];
  buildingAgeProfile: string | null;
  amenitiesProfile: string[];
  comparableRadiusMode: string | null;
  comparableWithZoneCodes: string[];
  notComparableWithZoneCodes: string[];
  sourceQuality: string | null;
  ownerTeam: string;
  validatedBy: string | null;
  validatedAt: Date | null;
  isActive: boolean;
  redirectToZoneCode: string | null;
  inventoryCountActive: number;
  inventoryCountHistorical: number;
  avgPriceM2Active: number | null;
  medianPriceM2Active: number | null;
  avgPriceM2Historical: number | null;
  medianPriceM2Historical: number | null;
  unitSizeMinActive: number | null;
  unitSizeMaxActive: number | null;
  dominantTiposDetected: string[];
  sampleActivePropertyCodes: string[];
  sampleHistoricalPropertyCodes: string[];
  rawZoneVariants: string[];
  notes: string;
}

export interface NormalizedRelation {
  fromZoneCode: string;
  toZoneCode: string;
  relationType: "comparable" | "not_comparable";
  reason: string | null;
  isSymmetric: boolean;
  asymmetryReason: string | null;
  conflictResolvedBy: string | null;
}

export interface NormalizedAlias {
  keyLoca: number;
  keyZona: number;
  zoneCode: string;
  aliasRaw: string;
  aliasNormalized: string;
  aliasType: "canonical" | "inmovilla_name" | "raw_variant" | "redirect_legacy";
}

export interface BuildResult {
  rows: MarketZoneCsvRow[];
  issues: ImportIssue[];
  relations: NormalizedRelation[];
  aliases: NormalizedAlias[];
  summary: {
    totalRows: number;
    activeRows: number;
    readyRows: number;
    heuristicRows: number;
  };
}

const REQUIRED_HEADERS = [
  "priority_rank",
  "validation_priority",
  "key_loca",
  "key_zona",
  "zona_inmovilla",
  "suggested_zone_code",
  "coverage_status",
  "pricing_profile_status",
  "zone_name_canonical",
  "comparable_with_zone_codes_json",
  "not_comparable_with_zone_codes_json",
  "is_active",
] as const;

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current);
      current = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value: string): number | null {
  const parsed = toNumber(value);
  if (parsed == null) return null;
  return Math.trunc(parsed);
}

function toDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toBool(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function parseJsonArray(value: string, field: string, rowNumber: number, issues: ImportIssue[]): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      issues.push({
        severity: "error",
        rowNumber,
        message: `Campo ${field} no es JSON array`,
      });
      return [];
    }
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    issues.push({
      severity: "error",
      rowNumber,
      message: `Campo ${field} contiene JSON inválido`,
    });
    return [];
  }
}

function normalizeAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ");
}

function parseRows(content: string): { rows: MarketZoneCsvRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const table = parseCsv(content);
  if (table.length === 0) {
    return {
      rows: [],
      issues: [{ severity: "error", rowNumber: 0, message: "CSV vacío" }],
    };
  }

  const headers = table[0];
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      issues.push({
        severity: "error",
        rowNumber: 1,
        message: `Header requerido ausente: ${required}`,
      });
    }
  }
  if (issues.some((issue) => issue.severity === "error")) return { rows: [], issues };

  const index = new Map(headers.map((header, idx) => [header, idx]));
  const read = (line: string[], column: string): string => line[index.get(column) ?? -1] ?? "";

  const rows: MarketZoneCsvRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    const rowNumber = i + 1;

    const priorityRank = toInt(read(line, "priority_rank"));
    const keyLoca = toInt(read(line, "key_loca"));
    const keyZona = toInt(read(line, "key_zona"));

    if (priorityRank == null || keyLoca == null || keyZona == null) {
      issues.push({
        severity: "error",
        rowNumber,
        message: "priority_rank/key_loca/key_zona inválidos",
      });
      continue;
    }

    rows.push({
      rowNumber,
      priorityRank,
      validationPriority: read(line, "validation_priority").trim() as MarketZoneCsvRow["validationPriority"],
      keyLoca,
      keyZona,
      zonaInmovilla: read(line, "zona_inmovilla").trim(),
      suggestedZoneCode: read(line, "suggested_zone_code").trim(),
      coverageStatus: read(line, "coverage_status").trim() as MarketZoneCsvRow["coverageStatus"],
      pricingProfileStatus: read(line, "pricing_profile_status").trim() as MarketZoneCsvRow["pricingProfileStatus"],
      zoneNameCanonical: read(line, "zone_name_canonical").trim(),
      macroArea: read(line, "macro_area").trim() || null,
      marketSegment: read(line, "market_segment").trim() || null,
      qualityProfile: read(line, "quality_profile").trim() || null,
      demandLevel: read(line, "demand_level").trim() || null,
      liquidityLevel: read(line, "liquidity_level").trim() || null,
      priceBandM2Min: toNumber(read(line, "price_band_m2_min")),
      priceBandM2Max: toNumber(read(line, "price_band_m2_max")),
      dominantHousingTypes: parseJsonArray(read(line, "dominant_housing_types_json"), "dominant_housing_types_json", rowNumber, issues),
      buildingAgeProfile: read(line, "building_age_profile").trim() || null,
      amenitiesProfile: parseJsonArray(read(line, "amenities_profile_json"), "amenities_profile_json", rowNumber, issues),
      comparableRadiusMode: read(line, "comparable_radius_mode").trim() || null,
      comparableWithZoneCodes: parseJsonArray(read(line, "comparable_with_zone_codes_json"), "comparable_with_zone_codes_json", rowNumber, issues),
      notComparableWithZoneCodes: parseJsonArray(read(line, "not_comparable_with_zone_codes_json"), "not_comparable_with_zone_codes_json", rowNumber, issues),
      sourceQuality: read(line, "source_quality").trim() || null,
      ownerTeam: read(line, "owner_team").trim(),
      validatedBy: read(line, "validated_by").trim() || null,
      validatedAt: toDate(read(line, "validated_at")),
      isActive: toBool(read(line, "is_active")),
      redirectToZoneCode: read(line, "redirect_to_zone_code").trim() || null,
      inventoryCountActive: toInt(read(line, "inventory_count_active")) ?? 0,
      inventoryCountHistorical: toInt(read(line, "inventory_count_historical")) ?? 0,
      avgPriceM2Active: toNumber(read(line, "avg_price_m2_active")),
      medianPriceM2Active: toNumber(read(line, "median_price_m2_active")),
      avgPriceM2Historical: toNumber(read(line, "avg_price_m2_historical")),
      medianPriceM2Historical: toNumber(read(line, "median_price_m2_historical")),
      unitSizeMinActive: toNumber(read(line, "unit_size_min_active")),
      unitSizeMaxActive: toNumber(read(line, "unit_size_max_active")),
      dominantTiposDetected: parseJsonArray(read(line, "dominant_tipos_detected_json"), "dominant_tipos_detected_json", rowNumber, issues),
      sampleActivePropertyCodes: parseJsonArray(read(line, "sample_active_property_codes_json"), "sample_active_property_codes_json", rowNumber, issues),
      sampleHistoricalPropertyCodes: parseJsonArray(read(line, "sample_historical_property_codes_json"), "sample_historical_property_codes_json", rowNumber, issues),
      rawZoneVariants: parseJsonArray(read(line, "raw_zone_variants_json"), "raw_zone_variants_json", rowNumber, issues),
      notes: read(line, "notes").trim(),
    });
  }

  return { rows, issues };
}

export function buildCatalogFromCsv(content: string): BuildResult {
  const { rows, issues } = parseRows(content);
  const codeMap = new Map(rows.map((row) => [row.suggestedZoneCode, row]));
  const activeCodes = new Set(rows.filter((row) => row.isActive).map((row) => row.suggestedZoneCode));

  for (const row of rows) {
    const code = row.suggestedZoneCode;
    if (!code) {
      issues.push({ severity: "error", rowNumber: row.rowNumber, message: "suggested_zone_code vacío" });
      continue;
    }

    if (row.coverageStatus === "redirected" || row.coverageStatus === "deprecated") {
      if (!row.redirectToZoneCode) {
        issues.push({
          severity: "error",
          rowNumber: row.rowNumber,
          zoneCode: code,
          message: "redirect_to_zone_code obligatorio para redirected/deprecated",
        });
      } else if (!activeCodes.has(row.redirectToZoneCode)) {
        issues.push({
          severity: "error",
          rowNumber: row.rowNumber,
          zoneCode: code,
          message: `redirect_to_zone_code apunta a zona no activa: ${row.redirectToZoneCode}`,
        });
      }
    }

    if (row.coverageStatus === "out_of_scope" && row.redirectToZoneCode) {
      issues.push({
        severity: "warning",
        rowNumber: row.rowNumber,
        zoneCode: code,
        message: "out_of_scope debería tener redirect_to_zone_code vacío",
      });
    }

    if (row.isActive && (row.pricingProfileStatus === "ready" || row.pricingProfileStatus === "heuristic")) {
      const required = [
        row.marketSegment,
        row.qualityProfile,
        row.demandLevel,
        row.liquidityLevel,
      ];
      if (required.some((value) => !value)) {
        issues.push({
          severity: "error",
          rowNumber: row.rowNumber,
          zoneCode: code,
          message: "Perfil comercial incompleto para zona activa ready/heuristic",
        });
      }

      if (row.priceBandM2Min == null || row.priceBandM2Max == null) {
        issues.push({
          severity: "error",
          rowNumber: row.rowNumber,
          zoneCode: code,
          message: "price_band_m2_min/max requeridos para zona activa ready/heuristic",
        });
      } else if (row.priceBandM2Min <= 0 || row.priceBandM2Max < row.priceBandM2Min) {
        issues.push({
          severity: "error",
          rowNumber: row.rowNumber,
          zoneCode: code,
          message: "Banda de precio inválida",
        });
      }
    }

    const overlap = row.comparableWithZoneCodes.filter((value) => row.notComparableWithZoneCodes.includes(value));
    if (overlap.length > 0) {
      issues.push({
        severity: "warning",
        rowNumber: row.rowNumber,
        zoneCode: code,
        message: `Conflicto intra-fila comparable/not_comparable: ${overlap.join(", ")}`,
      });
    }

    for (const target of [...row.comparableWithZoneCodes, ...row.notComparableWithZoneCodes]) {
      if (!activeCodes.has(target)) {
        issues.push({
          severity: "error",
          rowNumber: row.rowNumber,
          zoneCode: code,
          message: `Referencia a zona no activa o inexistente: ${target}`,
        });
      }
    }
  }

  const relationMap = new Map<string, NormalizedRelation>();
  const relationKey = (from: string, to: string, relationType: "comparable" | "not_comparable"): string =>
    `${from}::${to}::${relationType}`;

  for (const row of rows.filter((item) => item.isActive)) {
    const comparableSet = new Set(row.comparableWithZoneCodes);
    const notComparableSet = new Set(row.notComparableWithZoneCodes);

    for (const target of notComparableSet) {
      comparableSet.delete(target);
    }

    for (const target of comparableSet) {
      if (target === row.suggestedZoneCode) continue;
      relationMap.set(relationKey(row.suggestedZoneCode, target, "comparable"), {
        fromZoneCode: row.suggestedZoneCode,
        toZoneCode: target,
        relationType: "comparable",
        reason: row.notes || null,
        isSymmetric: false,
        asymmetryReason: null,
        conflictResolvedBy: null,
      });
    }

    for (const target of notComparableSet) {
      if (target === row.suggestedZoneCode) continue;
      relationMap.set(relationKey(row.suggestedZoneCode, target, "not_comparable"), {
        fromZoneCode: row.suggestedZoneCode,
        toZoneCode: target,
        relationType: "not_comparable",
        reason: row.notes || null,
        isSymmetric: false,
        asymmetryReason: null,
        conflictResolvedBy: null,
      });
    }
  }

  // Conflicto inter-zona: si A->B comparable y B->A not_comparable, prevalece not_comparable.
  const comparableKeys = [...relationMap.values()].filter((row) => row.relationType === "comparable");
  for (const relation of comparableKeys) {
    const oppositeNotComparable = relationMap.get(
      relationKey(relation.toZoneCode, relation.fromZoneCode, "not_comparable"),
    );
    if (oppositeNotComparable) {
      relationMap.delete(relationKey(relation.fromZoneCode, relation.toZoneCode, "comparable"));
      issues.push({
        severity: "warning",
        rowNumber: codeMap.get(relation.fromZoneCode)?.rowNumber ?? 0,
        zoneCode: relation.fromZoneCode,
        message: `Prevalece not_comparable sobre comparable para ${relation.fromZoneCode} ↔ ${relation.toZoneCode}`,
      });
    }
  }

  const aliasesByKey = new Map<string, NormalizedAlias>();
  const pushAlias = (alias: Omit<NormalizedAlias, "aliasNormalized">): void => {
    const normalized = normalizeAlias(alias.aliasRaw);
    if (!normalized) return;
    const key = `${alias.zoneCode}::${alias.aliasType}::${normalized}`;
    if (!aliasesByKey.has(key)) {
      aliasesByKey.set(key, { ...alias, aliasNormalized: normalized });
    }
  };

  for (const row of rows) {
    pushAlias({
      keyLoca: row.keyLoca,
      keyZona: row.keyZona,
      zoneCode: row.suggestedZoneCode,
      aliasRaw: row.zoneNameCanonical,
      aliasType: "canonical",
    });
    pushAlias({
      keyLoca: row.keyLoca,
      keyZona: row.keyZona,
      zoneCode: row.suggestedZoneCode,
      aliasRaw: row.zonaInmovilla,
      aliasType: "inmovilla_name",
    });
    for (const variant of row.rawZoneVariants) {
      pushAlias({
        keyLoca: row.keyLoca,
        keyZona: row.keyZona,
        zoneCode: row.suggestedZoneCode,
        aliasRaw: variant,
        aliasType: "raw_variant",
      });
    }
  }

  for (const row of rows) {
    if ((row.coverageStatus === "redirected" || row.coverageStatus === "deprecated") && row.redirectToZoneCode) {
      const target = codeMap.get(row.redirectToZoneCode);
      if (!target) continue;
      const legacyAliases = [row.zonaInmovilla, row.zoneNameCanonical, ...row.rawZoneVariants].filter(Boolean);
      for (const aliasRaw of legacyAliases) {
        pushAlias({
          keyLoca: target.keyLoca,
          keyZona: target.keyZona,
          zoneCode: target.suggestedZoneCode,
          aliasRaw,
          aliasType: "redirect_legacy",
        });
      }
    }
  }

  return {
    rows,
    issues,
    relations: [...relationMap.values()],
    aliases: [...aliasesByKey.values()],
    summary: {
      totalRows: rows.length,
      activeRows: rows.filter((row) => row.isActive).length,
      readyRows: rows.filter((row) => row.isActive && row.pricingProfileStatus === "ready").length,
      heuristicRows: rows.filter((row) => row.isActive && row.pricingProfileStatus === "heuristic").length,
    },
  };
}

export async function importCatalogToDatabase(args: {
  prisma: PrismaClient;
  catalogVersion: string;
  rows: MarketZoneCsvRow[];
  relations: NormalizedRelation[];
  aliases: NormalizedAlias[];
  dryRun: boolean;
}): Promise<{ upsertedProfiles: number; writtenRelations: number; writtenAliases: number }> {
  const { prisma, catalogVersion, rows, relations, aliases, dryRun } = args;
  if (dryRun) {
    return {
      upsertedProfiles: rows.length,
      writtenRelations: relations.length,
      writtenAliases: aliases.length,
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.marketZoneProfile.upsert({
        where: { keyZona: row.keyZona },
        create: {
          catalogVersion,
          priorityRank: row.priorityRank,
          validationPriority: row.validationPriority,
          keyLoca: row.keyLoca,
          keyZona: row.keyZona,
          zonaInmovilla: row.zonaInmovilla,
          suggestedZoneCode: row.suggestedZoneCode,
          coverageStatus: row.coverageStatus,
          pricingProfileStatus: row.pricingProfileStatus,
          zoneNameCanonical: row.zoneNameCanonical,
          macroArea: row.macroArea as never,
          marketSegment: row.marketSegment as never,
          qualityProfile: row.qualityProfile as never,
          demandLevel: row.demandLevel as never,
          liquidityLevel: row.liquidityLevel as never,
          priceBandM2Min: row.priceBandM2Min,
          priceBandM2Max: row.priceBandM2Max,
          dominantHousingTypes: row.dominantHousingTypes,
          buildingAgeProfile: row.buildingAgeProfile as never,
          amenitiesProfile: row.amenitiesProfile,
          comparableRadiusMode: row.comparableRadiusMode as never,
          comparableWithZoneCodes: row.comparableWithZoneCodes,
          notComparableWithZoneCodes: row.notComparableWithZoneCodes,
          sourceQuality: row.sourceQuality as never,
          ownerTeam: row.ownerTeam,
          validatedBy: row.validatedBy,
          validatedAt: row.validatedAt,
          isActive: row.isActive,
          redirectToZoneCode: row.redirectToZoneCode,
          inventoryCountActive: row.inventoryCountActive,
          inventoryCountHistorical: row.inventoryCountHistorical,
          avgPriceM2Active: row.avgPriceM2Active,
          medianPriceM2Active: row.medianPriceM2Active,
          avgPriceM2Historical: row.avgPriceM2Historical,
          medianPriceM2Historical: row.medianPriceM2Historical,
          unitSizeMinActive: row.unitSizeMinActive,
          unitSizeMaxActive: row.unitSizeMaxActive,
          dominantTiposDetected: row.dominantTiposDetected,
          sampleActivePropertyCodes: row.sampleActivePropertyCodes,
          sampleHistoricalPropertyCodes: row.sampleHistoricalPropertyCodes,
          rawZoneVariants: row.rawZoneVariants,
          notes: row.notes,
          importedAt: new Date(),
        },
        update: {
          catalogVersion,
          priorityRank: row.priorityRank,
          validationPriority: row.validationPriority,
          keyLoca: row.keyLoca,
          zonaInmovilla: row.zonaInmovilla,
          suggestedZoneCode: row.suggestedZoneCode,
          coverageStatus: row.coverageStatus,
          pricingProfileStatus: row.pricingProfileStatus,
          zoneNameCanonical: row.zoneNameCanonical,
          macroArea: row.macroArea as never,
          marketSegment: row.marketSegment as never,
          qualityProfile: row.qualityProfile as never,
          demandLevel: row.demandLevel as never,
          liquidityLevel: row.liquidityLevel as never,
          priceBandM2Min: row.priceBandM2Min,
          priceBandM2Max: row.priceBandM2Max,
          dominantHousingTypes: row.dominantHousingTypes,
          buildingAgeProfile: row.buildingAgeProfile as never,
          amenitiesProfile: row.amenitiesProfile,
          comparableRadiusMode: row.comparableRadiusMode as never,
          comparableWithZoneCodes: row.comparableWithZoneCodes,
          notComparableWithZoneCodes: row.notComparableWithZoneCodes,
          sourceQuality: row.sourceQuality as never,
          ownerTeam: row.ownerTeam,
          validatedBy: row.validatedBy,
          validatedAt: row.validatedAt,
          isActive: row.isActive,
          redirectToZoneCode: row.redirectToZoneCode,
          inventoryCountActive: row.inventoryCountActive,
          inventoryCountHistorical: row.inventoryCountHistorical,
          avgPriceM2Active: row.avgPriceM2Active,
          medianPriceM2Active: row.medianPriceM2Active,
          avgPriceM2Historical: row.avgPriceM2Historical,
          medianPriceM2Historical: row.medianPriceM2Historical,
          unitSizeMinActive: row.unitSizeMinActive,
          unitSizeMaxActive: row.unitSizeMaxActive,
          dominantTiposDetected: row.dominantTiposDetected,
          sampleActivePropertyCodes: row.sampleActivePropertyCodes,
          sampleHistoricalPropertyCodes: row.sampleHistoricalPropertyCodes,
          rawZoneVariants: row.rawZoneVariants,
          notes: row.notes,
          importedAt: new Date(),
        },
      });
    }

    const zoneCodes = rows.map((row) => row.suggestedZoneCode);

    await tx.marketZoneRelation.deleteMany({
      where: {
        OR: [
          { fromZoneCode: { in: zoneCodes } },
          { toZoneCode: { in: zoneCodes } },
        ],
      },
    });
    if (relations.length > 0) {
      await tx.marketZoneRelation.createMany({
        data: relations.map((relation) => ({
          catalogVersion,
          fromZoneCode: relation.fromZoneCode,
          toZoneCode: relation.toZoneCode,
          relationType: relation.relationType,
          strength: "medium",
          reason: relation.reason,
          isSymmetric: relation.isSymmetric,
          asymmetryReason: relation.asymmetryReason,
          conflictResolvedBy: relation.conflictResolvedBy,
        })),
        skipDuplicates: true,
      });
    }

    await tx.marketZoneAlias.deleteMany({
      where: { zoneCode: { in: zoneCodes } },
    });
    if (aliases.length > 0) {
      await tx.marketZoneAlias.createMany({
        data: aliases.map((alias) => ({
          keyLoca: alias.keyLoca,
          keyZona: alias.keyZona,
          zoneCode: alias.zoneCode,
          aliasRaw: alias.aliasRaw,
          aliasNormalized: alias.aliasNormalized,
          aliasType: alias.aliasType,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }
  }, {
    maxWait: 20_000,
    timeout: 180_000,
  });

  return {
    upsertedProfiles: rows.length,
    writtenRelations: relations.length,
    writtenAliases: aliases.length,
  };
}
