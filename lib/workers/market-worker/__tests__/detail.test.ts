import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isFotocasaBlocked,
  parseDetailBySource,
  parseFotocasaDetail,
  parseIdealistaDetail,
  parsePhonesFromIdealistaPhonesPayload,
  parsePisoscomDetail,
} from "../detail";

const FIXTURE_ROOT = join(
  process.cwd(),
  "workers",
  "market-worker",
  "src",
  "portals",
);

function loadFixture(portal: string, name: string): string {
  return readFileSync(
    join(FIXTURE_ROOT, portal, "__tests__", "fixtures", "detail", name),
    "utf-8",
  );
}

describe("detail parsers (smoke)", () => {
  it("dispatcher por source delega al parser correcto", () => {
    const idealista = parseDetailBySource(
      "source_d",
      `<script>idForm:{adId:111192450}</script><script>urlAdContactPhones:'/es/ajax/ads/{adId}/contact-phones'</script>`,
    );
    expect(idealista.idealistaAdId).toBe("111192450");
    expect(idealista.idealistaPhonesPath).toBe("/es/ajax/ads/{adId}/contact-phones");
  });

  it("normaliza telefonos desde payload AJAX de idealista", () => {
    const payload = `{"phones":[{"formattedPhoneNumber":"600 111 222"},{"formattedPhoneNumber":"+34 611 22 33 44"}]}`;
    const phones = parsePhonesFromIdealistaPhonesPayload(payload);
    expect(phones).toContain("+34600111222");
    expect(phones).toContain("+34611223344");
  });

  it("payload sin formattedPhoneNumber cae al regex generico", () => {
    const phones = parsePhonesFromIdealistaPhonesPayload("Llama al 600 333 444 ahora");
    expect(phones).toContain("+34600333444");
  });
});

describe("parsePisoscomDetail (HTML real)", () => {
  const html1 = loadFixture("pisoscom", "detail-agency-durna-63364247450.html");
  const html2 = loadFixture("pisoscom", "detail-agency-durna-63407055252.html");

  it("extrae el telefono REAL de vtmExtraVars (no el proxy Incotel de .callBtn)", () => {
    const parsed = parsePisoscomDetail(html1);
    // vtmExtraVars.telefono = "957043876" => +34957043876
    expect(parsed.phones).toEqual(["+34957043876"]);
    // El proxy Incotel "857681132" NO debe aparecer.
    expect(parsed.phones).not.toContain("+34857681132");
  });

  it("extrae descripcion completa del bloque .description__content (no la del meta truncada)", () => {
    const parsed = parsePisoscomDetail(html1);
    expect(parsed.description).toBeTruthy();
    expect(parsed.description!.length).toBeGreaterThan(800);
    expect(parsed.description).toMatch(/Descubre tu nuevo hogar/i);
    // El meta description termina con "...".
    expect(parsed.description).not.toMatch(/\.\.\.$/);
  });

  it("extrae el nombre del anunciante desde owner-info__name", () => {
    const parsed = parsePisoscomDetail(html1);
    expect(parsed.advertiserName).toBe("DURNA INMOBILIARIA");
  });

  it("infiere advertiserType=agency desde vtmVars.tipoVendedor=profesional", () => {
    const parsed = parsePisoscomDetail(html1);
    expect(parsed.advertiserType).toBe("agency");
  });

  it("extrae listingReference del bloque features__feature icon-reference", () => {
    expect(parsePisoscomDetail(html1).listingReference).toBe("DN02713/2799");
    expect(parsePisoscomDetail(html2).listingReference).toBe("DN02722/2799");
  });

  it("extrae la galeria completa de fotos desde links de preload + carrusel", () => {
    const parsed = parsePisoscomDetail(html1);
    expect(parsed.imageUrls.length).toBeGreaterThanOrEqual(5);
    for (const url of parsed.imageUrls) {
      expect(url).toMatch(/^https:\/\/fotos\.imghs\.net\//);
      expect(url).toMatch(/\.jpg$/i);
      // El logo de la inmobiliaria NO debe aparecer en la galeria.
      expect(url).not.toMatch(/Logo_|\/logos\//);
    }
  });

  it("dedupea variantes de la misma foto y prefiere alta resolucion", () => {
    const parsed = parsePisoscomDetail(html1);
    const filenames = parsed.imageUrls.map((u) => u.split("/").pop());
    const uniqueFilenames = new Set(filenames);
    expect(filenames.length).toBe(uniqueFilenames.size);
  });

  it("segundo fixture (otra ficha de la misma agencia) tiene los mismos invariantes", () => {
    const parsed = parsePisoscomDetail(html2);
    expect(parsed.phones).toEqual(["+34957043876"]);
    expect(parsed.advertiserName).toBe("DURNA INMOBILIARIA");
    expect(parsed.advertiserType).toBe("agency");
    expect(parsed.description!.length).toBeGreaterThan(100);
    expect(parsed.imageUrls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("parseIdealistaDetail (HTML real)", () => {
  const html = loadFixture(
    "idealista",
    "detail-agency-inmolike-111192450.html",
  );

  it("extrae adId y urlAdContactPhones para fallback AJAX", () => {
    const parsed = parseIdealistaDetail(html);
    expect(parsed.idealistaAdId).toBe("111192450");
    expect(parsed.idealistaPhonesPath).toBe("/es/ajax/ads/{adId}/contact-phones");
  });

  it("extrae el nombre del anunciante (Inmolike) y lo marca como agencia", () => {
    const parsed = parseIdealistaDetail(html);
    expect(parsed.advertiserName).toBe("Inmolike");
    expect(parsed.advertiserType).toBe("agency");
  });

  it("extrae adExternalReference como listingReference (KSV-AS-041)", () => {
    const parsed = parseIdealistaDetail(html);
    expect(parsed.listingReference).toBe("KSV-AS-041");
  });

  it("extrae descripcion completa del bloque .comment > .adCommentsLanguage > p", () => {
    const parsed = parseIdealistaDetail(html);
    expect(parsed.description).toBeTruthy();
    expect(parsed.description!.length).toBeGreaterThan(800);
    expect(parsed.description).toMatch(/Almog[aá]vares/);
    expect(parsed.description).toMatch(/Cocina amueblada/i);
  });

  it("extrae imagenes del multimediaCarrousel JSON inline", () => {
    const parsed = parseIdealistaDetail(html);
    expect(parsed.imageUrls.length).toBeGreaterThanOrEqual(3);
    for (const url of parsed.imageUrls) {
      expect(url).toMatch(/^https:\/\/img\d*\.idealista\.com\//);
    }
  });

  it("phones esta vacio en HTML pre-click (Idealista oculta el telefono hasta interaccion)", () => {
    const parsed = parseIdealistaDetail(html);
    expect(parsed.phones).toEqual([]);
  });

  it("captura bytes razonables (sanity check del fixture)", () => {
    expect(html.length).toBeGreaterThan(150_000);
  });
});

describe("parseFotocasaDetail (HTML bloqueado por PerimeterX)", () => {
  const html = loadFixture("fotocasa", "detail-blocked-perimeterx.html");

  it("isFotocasaBlocked detecta el HTML de bloqueo correctamente", () => {
    expect(isFotocasaBlocked(html)).toBe(true);
  });

  it("isFotocasaBlocked NO marca como bloqueo HTML normal grande", () => {
    expect(isFotocasaBlocked("<html>".padEnd(100_000, "x") + "</html>")).toBe(false);
  });

  it("parser devuelve detail vacio cuando el HTML esta bloqueado", () => {
    const parsed = parseFotocasaDetail(html);
    expect(parsed.phones).toEqual([]);
    expect(parsed.description).toBeNull();
    expect(parsed.imageUrls).toEqual([]);
    expect(parsed.advertiserName).toBeNull();
    expect(parsed.listingReference).toBeNull();
  });
});

/**
 * Fixtures REALES (capturados 7/05/2026 vía Bright Data Web Unlocker
 * con header `x-unblock-expect: {"element":"body"}` sobre la zona
 * `web_unlocker1`). Reducidos a ~50KB con `scripts/fotocasa-fixture-shrink.ts`
 * conservando `__INITIAL_PROPS__` íntegro + selectores DOM clave.
 *
 * Datos públicos: anuncios visibles en fotocasa.es a esa fecha. La fixture
 * conserva los teléfonos del anunciante porque (a) son públicos y (b) son
 * la prueba de regresión clave del parser.
 */
describe("parseFotocasaDetail (HTML real con __INITIAL_PROPS__)", () => {
  const htmlBarin1 = loadFixture("fotocasa", "detail-agency-real-188063260.html");
  const htmlBarin2 = loadFixture("fotocasa", "detail-agency-real-187412200.html");

  it("extrae el teléfono del anunciante desde publisher.phone (sin click 'Ver teléfono')", () => {
    expect(parseFotocasaDetail(htmlBarin1).phones).toEqual(["+34957488346"]);
    expect(parseFotocasaDetail(htmlBarin2).phones).toEqual(["+34957403535"]);
  });

  it("extrae descripción completa desde realEstateAdDetailEntityV2.description (no el meta truncado)", () => {
    const parsed = parseFotocasaDetail(htmlBarin1);
    expect(parsed.description).toBeTruthy();
    expect(parsed.description!.length).toBeGreaterThan(800);
    expect(parsed.description).toMatch(/Espl[eé]ndida vivienda para reformar/i);
    expect(parsed.description).toMatch(/Calle Cruz Conde/);
    // Meta descriptions truncan con "...". La descripción canónica no.
    expect(parsed.description).not.toMatch(/\.\.\.$/);
  });

  it("extrae advertiserName preferentemente desde publisher.alias (marca comercial)", () => {
    // Ambos detalles son de la misma agencia (alias "Inmobiliaria Barin",
    // razón social "Barin Mediación Inmobiliaria SLU"); usamos alias.
    expect(parseFotocasaDetail(htmlBarin1).advertiserName).toBe("Inmobiliaria Barin");
    expect(parseFotocasaDetail(htmlBarin2).advertiserName).toBe("Inmobiliaria Barin");
  });

  it("mapea publisher.type='professional' a advertiserType='agency'", () => {
    expect(parseFotocasaDetail(htmlBarin1).advertiserType).toBe("agency");
    expect(parseFotocasaDetail(htmlBarin2).advertiserType).toBe("agency");
  });

  it("extrae listingReference desde publisher.reference (NO catastral, código interno del anunciante)", () => {
    expect(parseFotocasaDetail(htmlBarin1).listingReference).toBe("01-MU024X");
    expect(parseFotocasaDetail(htmlBarin2).listingReference).toBe("03-VG012X");
  });

  it("Fotocasa NO expone referencia catastral en el detail (campo siempre null)", () => {
    expect(parseFotocasaDetail(htmlBarin1).cadastralRef).toBeNull();
    expect(parseFotocasaDetail(htmlBarin2).cadastralRef).toBeNull();
  });

  it("extrae galería completa desde realEstateAdDetailEntityV2.multimedias (>= 5 fotos)", () => {
    const parsed = parseFotocasaDetail(htmlBarin1);
    expect(parsed.imageUrls.length).toBeGreaterThanOrEqual(5);
    for (const url of parsed.imageUrls) {
      expect(url).toMatch(/^https:\/\/static\.fotocasa\.es\/images\/ads\//);
    }
  });

  it("filtra multimedias de tipo no-imagen (planos/videos no van en imageUrls del listing)", () => {
    // Aunque el HTML real de este anuncio solo tiene imágenes, el parser
    // debe respetar el filtro `type === "image"`. Test sintético:
    const synthHtml = `<script>window.__INITIAL_PROPS__ = JSON.parse('${JSON.stringify({
      realEstateAdDetailEntityV2: {
        id: "1_999",
        publisher: { type: "private", phone: "+34666111222" },
        description: "x".repeat(40),
        multimedias: [
          { position: 1, type: "image", url: "https://static.fotocasa.es/images/ads/aaa?rule=original" },
          { position: 2, type: "video", url: "https://static.fotocasa.es/videos/bbb.mp4" },
          { position: 3, type: "plan", url: "https://static.fotocasa.es/images/plans/ccc.jpg" },
          { position: 4, type: "image", url: "https://static.fotocasa.es/images/ads/ddd?rule=original" },
        ],
      },
    }).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}');</script>`;
    const parsed = parseFotocasaDetail(synthHtml);
    expect(parsed.imageUrls).toEqual([
      "https://static.fotocasa.es/images/ads/aaa?rule=original",
      "https://static.fotocasa.es/images/ads/ddd?rule=original",
    ]);
  });

  it("captura bytes razonables (sanity check de los fixtures)", () => {
    expect(htmlBarin1.length).toBeGreaterThan(20_000);
    expect(htmlBarin2.length).toBeGreaterThan(20_000);
  });
});

describe("parseFotocasaDetail (mapeo de advertiserType desde publisher.type)", () => {
  const buildHtml = (publisherType: string): string => {
    const json = {
      realEstateAdDetailEntityV2: {
        id: "1_X",
        publisher: { type: publisherType, phone: "+34666111222", alias: "X", reference: "REF1" },
        description: "x".repeat(40),
        multimedias: [],
      },
    };
    const escaped = JSON.stringify(json).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `<html><body><script>window.__INITIAL_PROPS__ = JSON.parse('${escaped}');</script></body></html>`;
  };
  it("'professional' → agency", () => {
    expect(parseFotocasaDetail(buildHtml("professional")).advertiserType).toBe("agency");
  });
  it("'private' → particular", () => {
    expect(parseFotocasaDetail(buildHtml("private")).advertiserType).toBe("particular");
  });
  it("'particular' → particular", () => {
    expect(parseFotocasaDetail(buildHtml("particular")).advertiserType).toBe("particular");
  });
  it("'user' → particular", () => {
    expect(parseFotocasaDetail(buildHtml("user")).advertiserType).toBe("particular");
  });
});
