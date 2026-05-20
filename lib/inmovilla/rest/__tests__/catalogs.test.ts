import { describe, expect, it } from "vitest";
import {
  normalizeCityForCatalog,
  getKeyLocaByCiudad,
  getKeyZonaByZonaAndKeyLoca,
} from "../catalogs";

describe("normalizeCityForCatalog", () => {
  it("normaliza slugs de Pisos.com con sufijo _capital", () => {
    expect(normalizeCityForCatalog("cordoba_capital")).toBe("cordoba");
    expect(normalizeCityForCatalog("madrid_capital")).toBe("madrid");
    expect(normalizeCityForCatalog("sevilla_capital")).toBe("sevilla");
  });

  it("normaliza slugs con sufijo _provincia y _municipio", () => {
    expect(normalizeCityForCatalog("cordoba_provincia")).toBe("cordoba");
    expect(normalizeCityForCatalog("alicante_municipio")).toBe("alicante");
  });

  it("colapsa separadores y elimina acentos", () => {
    expect(normalizeCityForCatalog("Córdoba")).toBe("cordoba");
    expect(normalizeCityForCatalog("palma-de-mallorca")).toBe(
      "palma de mallorca",
    );
    expect(normalizeCityForCatalog("Sant Cugat del Vallès")).toBe(
      "sant cugat del valles",
    );
  });

  it("respeta la palabra 'capital' embebida en medio del nombre", () => {
    // Sólo se eliminan los sufijos como segmentos completos.
    expect(normalizeCityForCatalog("capital_federal")).toBe("federal");
    expect(normalizeCityForCatalog("alcala_de_henares")).toBe(
      "alcala de henares",
    );
  });

  it("devuelve vacío para entrada vacía o nula", () => {
    expect(normalizeCityForCatalog("")).toBe("");
    expect(normalizeCityForCatalog("   ")).toBe("");
    // @ts-expect-error — comprobamos robustez frente a null.
    expect(normalizeCityForCatalog(null)).toBe("");
  });
});

// Mock mínimo de PrismaClient cubriendo solo los métodos que catalogs.ts usa.
type FakeRow = { key_loca: number; ciudad: string };
type FakeZonaRow = { key_zona: number; zona: string };

function makeFakePrisma(opts: {
  ciudades: FakeRow[];
  zonas: Record<number, FakeZonaRow[]>;
}) {
  return {
    inmovillaEnumCiudad: {
      findFirst: async ({
        where,
      }: {
        where: { ciudad: { equals: string; mode: string } };
      }) => {
        const expected = where.ciudad.equals.toLowerCase();
        return (
          opts.ciudades.find((c) => c.ciudad.toLowerCase() === expected) ??
          null
        );
      },
      findMany: async () => opts.ciudades.map((c) => ({ ...c })),
    },
    inmovillaEnumZona: {
      findFirst: async ({
        where,
      }: {
        where: { key_loca: number; zona: { equals: string; mode: string } };
      }) => {
        const zonas = opts.zonas[where.key_loca] ?? [];
        const expected = where.zona.equals.toLowerCase();
        return zonas.find((z) => z.zona.toLowerCase() === expected) ?? null;
      },
      findMany: async ({ where }: { where: { key_loca: number } }) =>
        (opts.zonas[where.key_loca] ?? []).map((z) => ({ ...z })),
    },
    // El cliente real expone más métodos; sólo se usan los anteriores aquí.
  } as unknown as Parameters<typeof getKeyLocaByCiudad>[0];
}

describe("getKeyLocaByCiudad (tolerante a slugs de portales)", () => {
  const prisma = makeFakePrisma({
    ciudades: [
      { key_loca: 14021, ciudad: "Córdoba" },
      { key_loca: 28079, ciudad: "Madrid" },
      { key_loca: 7040, ciudad: "Palma de Mallorca" },
    ],
    zonas: {},
  });

  it("resuelve `cordoba_capital` (slug Pisos.com) a la ciudad Córdoba", async () => {
    const keyLoca = await getKeyLocaByCiudad(prisma, {
      ciudadNombre: "cordoba_capital",
    });
    expect(keyLoca).toBe(14021);
  });

  it("resuelve `madrid-capital` (variante con guión)", async () => {
    const keyLoca = await getKeyLocaByCiudad(prisma, {
      ciudadNombre: "madrid-capital",
    });
    expect(keyLoca).toBe(28079);
  });

  it("resuelve `Córdoba` directamente (match exacto)", async () => {
    const keyLoca = await getKeyLocaByCiudad(prisma, {
      ciudadNombre: "Córdoba",
    });
    expect(keyLoca).toBe(14021);
  });

  it("resuelve `palma-de-mallorca` (guiones internos)", async () => {
    const keyLoca = await getKeyLocaByCiudad(prisma, {
      ciudadNombre: "palma-de-mallorca",
    });
    expect(keyLoca).toBe(7040);
  });

  it("resuelve `cordoba` (sin acento) por fallback acento-insensible", async () => {
    const keyLoca = await getKeyLocaByCiudad(prisma, {
      ciudadNombre: "cordoba",
    });
    expect(keyLoca).toBe(14021);
  });

  it("devuelve null si la ciudad no existe en el catálogo", async () => {
    const keyLoca = await getKeyLocaByCiudad(prisma, {
      ciudadNombre: "ciudad-inexistente",
    });
    expect(keyLoca).toBeNull();
  });

  it("devuelve null si el input está vacío", async () => {
    expect(await getKeyLocaByCiudad(prisma, { ciudadNombre: "" })).toBeNull();
    expect(
      await getKeyLocaByCiudad(prisma, { ciudadNombre: "   " }),
    ).toBeNull();
  });
});

describe("getKeyZonaByZonaAndKeyLoca (tolerante a acentos y prefijos)", () => {
  const prisma = makeFakePrisma({
    ciudades: [],
    zonas: {
      14021: [
        { key_zona: 1402101, zona: "Centro" },
        { key_zona: 1402102, zona: "Levante" },
        { key_zona: 1402103, zona: "Casco Histórico - Centro" },
      ],
    },
  });

  it("resuelve `centro` con acento variando", async () => {
    const keyZona = await getKeyZonaByZonaAndKeyLoca(prisma, "Centro", 14021);
    expect(keyZona).toBe(1402101);
  });

  it("resuelve por substring si no hay match exacto", async () => {
    // El portal podría devolver "Casco Histórico" y el catálogo
    // tener "Casco Histórico - Centro".
    const keyZona = await getKeyZonaByZonaAndKeyLoca(
      prisma,
      "Casco Histórico",
      14021,
    );
    expect(keyZona).toBe(1402103);
  });

  it("devuelve null si la zona no existe", async () => {
    const keyZona = await getKeyZonaByZonaAndKeyLoca(
      prisma,
      "zona-inexistente",
      14021,
    );
    expect(keyZona).toBeNull();
  });
});
