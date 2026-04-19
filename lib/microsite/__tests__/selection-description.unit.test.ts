import { describe, expect, it } from "vitest";
import { applyDescriptionUpdates, coerceMicrositeCuratedProperties } from "../selection";

const minimalProp = (id: string, title: string, description: string | null) => ({
  propertyId: id,
  title,
  description,
  link: null,
  price: 100_000,
  pricePerMeter: null,
  metersBuilt: 80,
  metersUsable: null,
  metersPlot: null,
  metersTerrace: null,
  rooms: 3,
  baths: 2,
  floor: null,
  orientation: null,
  address: null,
  city: "Madrid",
  zone: "Centro",
  housing: "Piso",
  latitude: null,
  longitude: null,
  images: ["https://example.com/a.jpg"],
  extras: [],
  energyCertRating: null,
  energyCertValue: null,
  yearBuilt: null,
  condition: null,
  advertiserType: null as const,
  advertiserName: null,
});

describe("applyDescriptionUpdates", () => {
  it("actualiza la descripción de una propiedad", () => {
    const raw = [minimalProp("p1", "Piso", "Texto original")];
    const result = applyDescriptionUpdates(raw, [
      { propertyId: "p1", description: "Editado por comercial" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.properties[0]?.description).toBe("Editado por comercial");
    expect(result.properties[0]?.title).toBe("Piso");
  });

  it("actualiza varias propiedades en un solo batch", () => {
    const raw = [minimalProp("a", "A", "d1"), minimalProp("b", "B", "d2")];
    const result = applyDescriptionUpdates(raw, [
      { propertyId: "a", description: "n1" },
      { propertyId: "b", description: "n2" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.properties.map((p) => p.description)).toEqual(["n1", "n2"]);
  });

  it("normaliza cadena vacía y null a description null", () => {
    const raw = [minimalProp("p1", "Piso", "algo")];
    const empty = applyDescriptionUpdates(raw, [{ propertyId: "p1", description: "" }]);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.properties[0]?.description).toBeNull();

    const nulled = applyDescriptionUpdates(raw, [{ propertyId: "p1", description: null }]);
    expect(nulled.ok).toBe(true);
    if (!nulled.ok) return;
    expect(nulled.properties[0]?.description).toBeNull();
  });

  it("falla si updates está vacío", () => {
    const raw = [minimalProp("p1", "Piso", "x")];
    const result = applyDescriptionUpdates(raw, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/vacío/i);
  });

  it("falla si propertyId no existe en la selección", () => {
    const raw = [minimalProp("p1", "Piso", "x")];
    const result = applyDescriptionUpdates(raw, [{ propertyId: "no-existe", description: "y" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/desconocido/);
  });

  it("falla si properties no es un array curable", () => {
    const result = applyDescriptionUpdates({}, [{ propertyId: "p1", description: "y" }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/válidas|vacías/);
  });

  it("el resultado es coherente con coerceMicrositeCuratedProperties al serializar", () => {
    const raw = [minimalProp("p1", "Piso", "origen")];
    const result = applyDescriptionUpdates(raw, [{ propertyId: "p1", description: "nuevo" }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const roundTrip = coerceMicrositeCuratedProperties(
      JSON.parse(JSON.stringify(result.properties)) as unknown,
    );
    expect(roundTrip[0]?.description).toBe("nuevo");
  });
});
