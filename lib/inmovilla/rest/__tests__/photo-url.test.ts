import { describe, it, expect } from "vitest";
import {
  buildInmovillaPhotoUrl,
  buildMainPhotoUrlFromRaw,
} from "../photo-url";

describe("buildInmovillaPhotoUrl", () => {
  it("construye URL thumbnail por defecto con sufijo 's'", () => {
    expect(
      buildInmovillaPhotoUrl({
        numagencia: 11636,
        codOfer: 26178808,
        fotoletra: "2",
      }),
    ).toBe("https://fotos15.apinmo.com/11636/26178808/2-1s.jpg");
  });

  it("construye URL full-size sin sufijo 's'", () => {
    expect(
      buildInmovillaPhotoUrl({
        numagencia: 11636,
        codOfer: 26178808,
        fotoletra: 2,
        size: "full",
      }),
    ).toBe("https://fotos15.apinmo.com/11636/26178808/2-1.jpg");
  });

  it("acepta índice distinto a 1 para fotos adicionales", () => {
    expect(
      buildInmovillaPhotoUrl({
        numagencia: 11636,
        codOfer: 26178808,
        fotoletra: "2",
        index: 5,
      }),
    ).toBe("https://fotos15.apinmo.com/11636/26178808/2-5s.jpg");
  });

  it("devuelve null si falta numagencia, fotoletra o cod_ofer", () => {
    expect(
      buildInmovillaPhotoUrl({ codOfer: 1, fotoletra: "2" }),
    ).toBeNull();
    expect(
      buildInmovillaPhotoUrl({ numagencia: 1, codOfer: 1 }),
    ).toBeNull();
    expect(
      buildInmovillaPhotoUrl({ numagencia: 1, fotoletra: "2", codOfer: "" }),
    ).toBeNull();
  });

  it("acepta host custom", () => {
    expect(
      buildInmovillaPhotoUrl({
        numagencia: 11636,
        codOfer: 26178808,
        fotoletra: "2",
        host: "fotos15.inmovilla.com",
      }),
    ).toBe("https://fotos15.inmovilla.com/11636/26178808/2-1s.jpg");
  });
});

describe("buildMainPhotoUrlFromRaw", () => {
  it("devuelve URL válida si raw tiene numfotos > 0 y los 3 parámetros", () => {
    const url = buildMainPhotoUrlFromRaw({
      numagencia: "11636",
      cod_ofer: 26178808,
      fotoletra: "2",
      numfotos: "32",
    });
    expect(url).toBe("https://fotos15.apinmo.com/11636/26178808/2-1s.jpg");
  });

  it("devuelve null si numfotos es 0", () => {
    expect(
      buildMainPhotoUrlFromRaw({
        numagencia: "11636",
        cod_ofer: 26178808,
        fotoletra: "2",
        numfotos: 0,
      }),
    ).toBeNull();
  });

  it("devuelve null si falta fotoletra", () => {
    expect(
      buildMainPhotoUrlFromRaw({
        numagencia: "11636",
        cod_ofer: 26178808,
        numfotos: 10,
      }),
    ).toBeNull();
  });
});
