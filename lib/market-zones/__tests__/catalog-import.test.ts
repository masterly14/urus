import { describe, expect, it } from "vitest";
import { buildCatalogFromCsv } from "@/lib/market-zones/catalog-import";

const HEADERS = [
  "priority_rank",
  "validation_priority",
  "key_loca",
  "key_zona",
  "zona_inmovilla",
  "suggested_zone_code",
  "coverage_status",
  "pricing_profile_status",
  "zone_name_canonical",
  "macro_area",
  "market_segment",
  "quality_profile",
  "demand_level",
  "liquidity_level",
  "price_band_m2_min",
  "price_band_m2_max",
  "dominant_housing_types_json",
  "building_age_profile",
  "amenities_profile_json",
  "comparable_radius_mode",
  "comparable_with_zone_codes_json",
  "not_comparable_with_zone_codes_json",
  "source_quality",
  "owner_team",
  "validated_by",
  "validated_at",
  "is_active",
  "redirect_to_zone_code",
  "inventory_count_active",
  "inventory_count_historical",
  "avg_price_m2_active",
  "median_price_m2_active",
  "avg_price_m2_historical",
  "median_price_m2_historical",
  "unit_size_min_active",
  "unit_size_max_active",
  "dominant_tipos_detected_json",
  "sample_active_property_codes_json",
  "sample_historical_property_codes_json",
  "raw_zone_variants_json",
  "notes",
] as const;

type RowInput = Partial<Record<(typeof HEADERS)[number], string>>;

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

function makeRow(input: RowInput): string {
  const defaults: Record<(typeof HEADERS)[number], string> = {
    priority_rank: "1",
    validation_priority: "P1_active_inventory",
    key_loca: "224499",
    key_zona: "1901000",
    zona_inmovilla: "Zona A",
    suggested_zone_code: "COR-IMV-1901000",
    coverage_status: "validated",
    pricing_profile_status: "ready",
    zone_name_canonical: "Zona A",
    macro_area: "Centro",
    market_segment: "medio",
    quality_profile: "medio",
    demand_level: "media",
    liquidity_level: "media",
    price_band_m2_min: "1000",
    price_band_m2_max: "1500",
    dominant_housing_types_json: "[\"Piso\"]",
    building_age_profile: "mixto",
    amenities_profile_json: "[]",
    comparable_radius_mode: "zone_plus_mirrors",
    comparable_with_zone_codes_json: "[]",
    not_comparable_with_zone_codes_json: "[]",
    source_quality: "baja",
    owner_team: "comercial_cordoba",
    validated_by: "comercial_cordoba",
    validated_at: "2026-05-21",
    is_active: "true",
    redirect_to_zone_code: "",
    inventory_count_active: "1",
    inventory_count_historical: "1",
    avg_price_m2_active: "1200",
    median_price_m2_active: "1200",
    avg_price_m2_historical: "1200",
    median_price_m2_historical: "1200",
    unit_size_min_active: "70",
    unit_size_max_active: "80",
    dominant_tipos_detected_json: "[\"Piso\"]",
    sample_active_property_codes_json: "[\"P-1\"]",
    sample_historical_property_codes_json: "[\"P-1\"]",
    raw_zone_variants_json: "[\"Zona A\"]",
    notes: "",
  };

  const merged = { ...defaults, ...input };
  return HEADERS.map((header) => csvEscape(merged[header])).join(",");
}

function makeCsv(rows: string[]): string {
  return `${HEADERS.join(",")}\n${rows.join("\n")}\n`;
}

describe("buildCatalogFromCsv", () => {
  it("normaliza relaciones y aliases para dataset válido", () => {
    const csv = makeCsv([
      makeRow({
        priority_rank: "1",
        key_zona: "1901000",
        suggested_zone_code: "COR-IMV-1901000",
        zone_name_canonical: "Zona A",
        comparable_with_zone_codes_json: "[\"COR-IMV-1901001\"]",
      }),
      makeRow({
        priority_rank: "2",
        key_zona: "1901001",
        suggested_zone_code: "COR-IMV-1901001",
        zone_name_canonical: "Zona B",
      }),
    ]);

    const result = buildCatalogFromCsv(csv);
    const errors = result.issues.filter((issue) => issue.severity === "error");
    expect(errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.relations).toHaveLength(1);
    expect(result.aliases.length).toBeGreaterThanOrEqual(2);
  });

  it("falla si redirected no trae redirect_to_zone_code", () => {
    const csv = makeCsv([
      makeRow({
        key_zona: "1901000",
        suggested_zone_code: "COR-IMV-1901000",
        coverage_status: "redirected",
        pricing_profile_status: "redirected",
        is_active: "false",
        redirect_to_zone_code: "",
      }),
      makeRow({
        key_zona: "1901001",
        suggested_zone_code: "COR-IMV-1901001",
      }),
    ]);

    const result = buildCatalogFromCsv(csv);
    const errors = result.issues.filter((issue) => issue.severity === "error");
    expect(errors.some((issue) => issue.message.includes("redirect_to_zone_code obligatorio"))).toBe(true);
  });

  it("resuelve conflicto intra-fila comparable/not_comparable priorizando exclusión", () => {
    const csv = makeCsv([
      makeRow({
        key_zona: "1901000",
        suggested_zone_code: "COR-IMV-1901000",
        comparable_with_zone_codes_json: "[\"COR-IMV-1901001\"]",
        not_comparable_with_zone_codes_json: "[\"COR-IMV-1901001\"]",
      }),
      makeRow({
        key_zona: "1901001",
        suggested_zone_code: "COR-IMV-1901001",
      }),
    ]);

    const result = buildCatalogFromCsv(csv);
    const relationTypes = result.relations.map((relation) => relation.relationType);
    expect(relationTypes).toContain("not_comparable");
    expect(relationTypes).not.toContain("comparable");
    expect(result.issues.some((issue) => issue.severity === "warning")).toBe(true);
  });

  it("aplica prevalencia inter-zona: not_comparable gana a comparable inverso", () => {
    const csv = makeCsv([
      makeRow({
        key_zona: "1901000",
        suggested_zone_code: "COR-IMV-1901000",
        comparable_with_zone_codes_json: "[\"COR-IMV-1901001\"]",
      }),
      makeRow({
        key_zona: "1901001",
        suggested_zone_code: "COR-IMV-1901001",
        not_comparable_with_zone_codes_json: "[\"COR-IMV-1901000\"]",
      }),
    ]);

    const result = buildCatalogFromCsv(csv);
    expect(
      result.relations.some(
        (relation) =>
          relation.fromZoneCode === "COR-IMV-1901000" &&
          relation.toZoneCode === "COR-IMV-1901001" &&
          relation.relationType === "comparable",
      ),
    ).toBe(false);
    expect(
      result.relations.some(
        (relation) =>
          relation.fromZoneCode === "COR-IMV-1901001" &&
          relation.toZoneCode === "COR-IMV-1901000" &&
          relation.relationType === "not_comparable",
      ),
    ).toBe(true);
  });
});
