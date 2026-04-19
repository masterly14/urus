import { describe, it, expect } from "vitest";
import {
  parseDemandasFieldsFromFichaCliente,
  parseSelpoliAreas,
  buildZonasFromAreas,
} from "../ficha-demanda";

describe("parseDemandasFieldsFromFichaCliente", () => {
  it("extrae pares demandas.campo / valor", () => {
    const raw =
      "arrficha[\"fichacliente\"][\"39059502\"]= new Array ('-.TABLA.-','demandas.','cod_dem','39059502','-.TABLA.-','demandas.','consultada','Ref. URUS103VMA');";
    const m = parseDemandasFieldsFromFichaCliente(raw);
    expect(m.cod_dem).toBe("39059502");
    expect(m.consultada).toBe("Ref. URUS103VMA");
  });

  it("devuelve objeto vacío si no hay sección demandas.", () => {
    expect(parseDemandasFieldsFromFichaCliente("var x=1;")).toEqual({});
  });
});

describe("parseSelpoliAreas", () => {
  const brillanteJson = JSON.stringify({
    id: 12524,
    nombre: "Brillante",
    nombrePadre: "Córdoba",
    plataforma: "idealista",
    latitud: 37.9,
    longitud: -4.78,
    zoom: 14,
  });
  const brillanteB64 = Buffer.from(brillanteJson).toString("base64");

  const patriarcaJson = JSON.stringify({
    id: 8647,
    nombre: "Santa Rosa - San José",
    nombrePadre: "",
    plataforma: "idealista",
  });
  const patriarcaB64 = Buffer.from(patriarcaJson).toString("base64");

  it("extracts single area from selpoli with {pol_data}", () => {
    const text = `'selpoli','37.9 -4.78,37.91 -4.77{pol_data}${brillanteB64}'`;
    const areas = parseSelpoliAreas(text);
    expect(areas).toHaveLength(1);
    expect(areas[0].nombre).toBe("Brillante");
    expect(areas[0].nombrePadre).toBe("Córdoba");
    expect(areas[0].plataforma).toBe("idealista");
    expect(areas[0].latitud).toBe(37.9);
  });

  it("extracts multiple areas from selpoli", () => {
    const text = `'selpoli',';coords1{pol_data}${brillanteB64}coords2{pol_data}${patriarcaB64}'`;
    const areas = parseSelpoliAreas(text);
    expect(areas).toHaveLength(2);
    expect(areas[0].nombre).toBe("Brillante");
    expect(areas[1].nombre).toBe("Santa Rosa - San José");
  });

  it("returns empty array when no selpoli section", () => {
    expect(parseSelpoliAreas("var x=1;")).toEqual([]);
  });

  it("returns empty array when selpoli has no {pol_data}", () => {
    const text = "'selpoli','37.9 -4.78,37.91 -4.77'";
    expect(parseSelpoliAreas(text)).toEqual([]);
  });

  it("skips malformed base64", () => {
    const text = "'selpoli','coords{pol_data}notvalidbase64!!!'";
    expect(parseSelpoliAreas(text)).toEqual([]);
  });

  it("skips areas with empty nombre", () => {
    const emptyJson = JSON.stringify({ id: 1, nombre: "", plataforma: "x" });
    const b64 = Buffer.from(emptyJson).toString("base64");
    const text = `'selpoli','coords{pol_data}${b64}'`;
    expect(parseSelpoliAreas(text)).toEqual([]);
  });
});

describe("buildZonasFromAreas", () => {
  it("joins area names with commas", () => {
    const areas = [
      { nombre: "Brillante", nombrePadre: "Córdoba" },
      { nombre: "El Patriarca" },
    ];
    expect(buildZonasFromAreas(areas)).toBe("Brillante, El Patriarca");
  });

  it("deduplicates by name (case-insensitive)", () => {
    const areas = [
      { nombre: "Brillante" },
      { nombre: "brillante" },
      { nombre: "Centro" },
    ];
    expect(buildZonasFromAreas(areas)).toBe("Brillante, Centro");
  });

  it("returns empty string for no areas", () => {
    expect(buildZonasFromAreas([])).toBe("");
  });
});
