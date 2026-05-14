import { describe, expect, it } from "vitest";
import {
  buildCloudinaryPublicId,
  buildStatefoxImageImportIdempotencyKey,
  detectPortalSource,
  normalizePortalUrl,
} from "../portal";

describe("detectPortalSource", () => {
  it("detecta hosts conocidos por dominio", () => {
    expect(detectPortalSource("https://www.idealista.com/inmueble/12345/")).toBe("idealista");
    expect(detectPortalSource("https://www.fotocasa.es/abc")).toBe("fotocasa");
    expect(detectPortalSource("https://www.pisos.com/x/")).toBe("pisoscom");
    expect(detectPortalSource("https://www.habitaclia.com/x")).toBe("habitaclia");
  });

  it("devuelve unknown ante URLs vacías o no soportadas", () => {
    expect(detectPortalSource("")).toBe("unknown");
    expect(detectPortalSource(null)).toBe("unknown");
    expect(detectPortalSource("https://example.com/inmueble")).toBe("unknown");
    expect(detectPortalSource("not-a-url")).toBe("unknown");
  });
});

describe("normalizePortalUrl", () => {
  it("elimina hash y devuelve URL absoluta", () => {
    expect(normalizePortalUrl("https://www.idealista.com/inmueble/12345/#galeria")).toBe(
      "https://www.idealista.com/inmueble/12345/",
    );
  });

  it("rechaza URLs no http(s)", () => {
    expect(normalizePortalUrl("ftp://example.com")).toBeNull();
    expect(normalizePortalUrl("javascript:alert(1)")).toBeNull();
  });

  it("devuelve null si la URL no parsea", () => {
    expect(normalizePortalUrl("idealista.com/inmueble")).toBeNull();
  });
});

describe("buildStatefoxImageImportIdempotencyKey", () => {
  it("genera clave determinista por source y statefoxId", () => {
    expect(
      buildStatefoxImageImportIdempotencyKey({
        source: "idealista",
        statefoxId: "id.es.r.110283328",
      }),
    ).toBe("statefox-image-import:idealista:id.es.r.110283328");
  });
});

describe("buildCloudinaryPublicId", () => {
  it("normaliza statefoxId y respeta orden de carpeta", () => {
    expect(
      buildCloudinaryPublicId({
        source: "idealista",
        statefoxId: "id.es.r.110283328",
        imageIndex: 3,
      }),
    ).toBe("statefox/idealista/id_es_r_110283328/3");
  });

  it("evita caracteres no seguros para Cloudinary", () => {
    expect(
      buildCloudinaryPublicId({
        source: "fotocasa",
        statefoxId: "id with spaces!",
        imageIndex: 0,
      }),
    ).toBe("statefox/fotocasa/id_with_spaces_/0");
  });
});
