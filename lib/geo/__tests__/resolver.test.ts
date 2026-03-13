import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveGeoPolygon, resolveGeoFields, emptyGeoFields } from "../resolver";

vi.mock("../nominatim", () => ({
  geocodeWithNominatim: vi.fn(),
}));

import { geocodeWithNominatim } from "../nominatim";

const mockGeocode = vi.mocked(geocodeWithNominatim);

beforeEach(() => {
  mockGeocode.mockReset();
});

describe("resolveGeoPolygon", () => {
  it("resuelve una ciudad predefinida sin llamar a Nominatim", async () => {
    const result = await resolveGeoPolygon({ zoneText: "córdoba" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("predefined");
    expect(result!.polygon.vertices.length).toBeGreaterThan(0);
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it("resuelve una zona predefinida", async () => {
    const result = await resolveGeoPolygon({ zoneText: "triana" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("predefined");
  });

  it("llama a Nominatim si no hay predefinido", async () => {
    mockGeocode.mockResolvedValueOnce({
      vertices: [
        { lat: 37.5, lng: -4.9 },
        { lat: 37.6, lng: -4.9 },
        { lat: 37.6, lng: -4.8 },
        { lat: 37.5, lng: -4.8 },
      ],
      center: { lat: 37.55, lng: -4.85 },
      zoom: 14,
    });

    const result = await resolveGeoPolygon({ zoneText: "alcolea", city: "Córdoba" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("nominatim");
    expect(mockGeocode).toHaveBeenCalled();
  });

  it("usa fallback a la ciudad si Nominatim falla y hay ciudad predefinida", async () => {
    mockGeocode.mockResolvedValue(null);

    const result = await resolveGeoPolygon({
      zoneText: "zona-inexistente-xyz",
      city: "Málaga",
    });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("fallback-bbox");
    expect(result!.label).toBe("málaga");
  });

  it("devuelve null si nada funciona", async () => {
    mockGeocode.mockResolvedValue(null);

    const result = await resolveGeoPolygon({
      zoneText: "pueblo-inexistente-xyz",
      city: "ciudad-inexistente",
    });
    expect(result).toBeNull();
  });

  it("en modo offlineOnly no llama a Nominatim", async () => {
    const result = await resolveGeoPolygon({
      zoneText: "villarrubia",
      offlineOnly: true,
    });
    expect(result).toBeNull();
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it("en modo offlineOnly sí resuelve predefinidos", async () => {
    const result = await resolveGeoPolygon({
      zoneText: "sevilla centro",
      offlineOnly: true,
    });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("predefined");
  });

  it("resuelve por ciudad sola sin zoneText", async () => {
    const result = await resolveGeoPolygon({ city: "Sevilla" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("predefined");
  });
});

describe("resolveGeoFields", () => {
  it("genera campos Inmovilla con polígono predefinido", async () => {
    const result = await resolveGeoFields({ zoneText: "córdoba centro" });
    expect(result).not.toBeNull();
    expect(result!.fields["selpoli-selpoli"]).toContain(";");
    expect(result!.fields.poli).toBe(result!.fields["selpoli-selpoli"]);
    expect(result!.fields["demandas-porarea"]).toBe("1");
  });
});

describe("emptyGeoFields", () => {
  it("devuelve campos vacíos con valores por defecto", () => {
    const fields = emptyGeoFields();
    expect(fields["selpoli-selpoli"]).toBe("");
    expect(fields.poli).toBe("");
    expect(fields["demandas-porarea"]).toBe("1");
    expect(fields["demandas-zoom"]).toBeTruthy();
  });
});
