/**
 * Helper compartido para extraer y parsear `window.__INITIAL_PROPS__` de
 * páginas de Fotocasa (listing y detalle).
 *
 * Fotocasa serializa el estado SSR completo en una asignación inline:
 *
 *   window.__INITIAL_PROPS__ = JSON.parse('{"...":"..."}')
 *
 * El JSON va dentro de un literal JavaScript single-quoted, con escapes
 * de comilla simple (`\\'`) y de backslash (`\\\\`). Esa doble capa
 * (literal JS + JSON) requiere des-escapar antes de parsear.
 *
 * Verificado contra HTML real capturado el 7/05/2026 via Bright Data
 * Web Unlocker (zona web_unlocker1 con header x-unblock-expect):
 *  - Listing: `data/captures/fotocasa/20260507-114344/listing-cordoba-pag1.html`
 *  - Detalle: `data/captures/fotocasa/20260507-114344/detail-188063260.html`
 *
 * Estructura observada:
 *
 *  Detalle:
 *    realEstateAdDetailEntityV2: {
 *      id: "1_188063260",
 *      address: { coordinates, locality, province, zipCode, ... },
 *      description: "...",
 *      multimedias: [{ position, type:"image"|"plan"|"video", url }],
 *      publisher: {
 *        alias, id, logo, name, phone: "+34957488346",
 *        publisherId, reference: "01-MU024X", type: "professional",
 *        url, wasId
 *      },
 *      features: [{ type:"TYPOLOGY", value:"FLAT" }, ...],
 *      price: { amount, amountDrop, periodicity },
 *      ...
 *    }
 *
 *  Listing:
 *    initialSearch: {
 *      result: {
 *        realEstates: [
 *          {
 *            id: 188063260,
 *            realEstateAdId: "uuid-...",
 *            address: {...}, coordinates: { latitude, longitude },
 *            description: "...",
 *            phone: "+34957488346",  // ← teléfono incluido en el listing
 *            rawPrice: 297000, price: "297.000 €",
 *            multimedia: [{ type:"image", src:"..."}],
 *            clientType: "professional"|"private"|"particular",
 *            clientAlias, clientId, publisherId, clientUrl,
 *            detail: { "es-ES":"/es/comprar/vivienda/.../d", ... },
 *            features: [{key:"air_conditioner", value:1}, ...],
 *            buildingType:"Flat", buildingSubtype:"Flat",
 *            transactionTypeId:1, typeId:2, subtypeId:1,
 *            ...
 *          }
 *        ]
 *      }
 *    }
 *
 * Esta clave NO siempre está presente: si Fotocasa cambia su build pipeline
 * o sirve una versión light (mobile crawl, página de error) el script no
 * existe. Por eso los parsers que lo consumen tratan el resultado como
 * opcional y mantienen fallback DOM.
 */

const INITIAL_PROPS_RE =
  /window\.__INITIAL_PROPS__\s*=\s*JSON\.parse\(\s*'((?:\\'|[^'])*)'\s*\)/;

/**
 * Extrae el JSON crudo (string) embebido en `window.__INITIAL_PROPS__ = JSON.parse('...')`.
 *
 * NO parsea — solo des-escapa las comillas simples y backslashes para que
 * el resultado sea un string JSON válido. Devuelve `null` si no encuentra
 * la asignación.
 */
export function extractFotocasaInitialPropsRaw(html: string): string | null {
  const m = html.match(INITIAL_PROPS_RE);
  if (!m?.[1]) return null;
  return m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

/**
 * Extrae y parsea `window.__INITIAL_PROPS__` como objeto JS. Devuelve
 * `null` si no encuentra el script o si el JSON está corrupto.
 *
 * Tolera fallos silenciosamente: el caller debe validar la estructura
 * que espera (ej. `realEstateAdDetailEntityV2` en detalle).
 */
export function parseFotocasaInitialProps(html: string): Record<string, unknown> | null {
  const raw = extractFotocasaInitialPropsRaw(html);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
