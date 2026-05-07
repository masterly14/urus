import { normalizePhone, type MarketSource } from "@/lib/market";
import { parseFotocasaInitialProps } from "./fotocasa-initial-props";

export interface ParsedDetail {
  phones: string[];
  advertiserName: string | null;
  advertiserType: "particular" | "agency" | null;
  description: string | null;
  imageUrls: string[];
  listingReference: string | null;
  cadastralRef: string | null;
  idealistaAdId?: string | null;
  idealistaPhonesPath?: string | null;
}

/**
 * Referencia catastral espanola: 20 caracteres alfanumericos en formato
 *   7 digitos + 4 alfanumericos + 4 digitos + 4 alfanumericos
 * (ej. "1234567VK1234S0001AB"). Aparece a veces en la descripcion del
 * anuncio cuando el anunciante la incluye explicitamente.
 */
const CADASTRAL_REF_REGEX = /\b([0-9]{7}[A-Z]{2}[0-9]{4}[A-Z][0-9]{4}[A-Z]{2})\b/i;

const PHONE_REGEX = /(?:\+34|0034|34)?[\s().-]*[6789](?:[\s().-]*\d){8}\b/g;
const TEL_LINK_REGEX = /tel:\s*([+\d][\d().\s/-]{6,})/gi;

export function parseDetailBySource(source: MarketSource, html: string): ParsedDetail {
  if (source === "source_d") return parseIdealistaDetail(html);
  if (source === "source_a") return parseFotocasaDetail(html);
  if (source === "source_b") return parsePisoscomDetail(html);
  return parseGenericDetail(html);
}

export function parseGenericDetail(html: string): ParsedDetail {
  const description = extractMetaDescription(html);
  return {
    phones: extractPhones(html),
    advertiserName: null,
    advertiserType: inferAdvertiserType(html),
    description,
    imageUrls: extractImageUrlsGeneric(html),
    listingReference: null,
    cadastralRef: extractCadastralRef(description),
  };
}

// =====================================================================
// IDEALISTA
// =====================================================================

/**
 * Parser del detalle de Idealista (verificado contra HTML real capturado
 * via Bright Data Web Unlocker, fixture
 * `idealista/__tests__/fixtures/detail/detail-agency-inmolike-111192450.html`).
 *
 * Fuentes principales:
 *  - `adId` y `urlAdContactPhones`: bloque JS inline `idForm: { adId: N }`
 *    y `urlAdContactPhones: '/...'`.
 *  - `adCommercialName` / `adProfessionalName`: nombre del anunciante.
 *  - `adExternalReference`: codigo interno del anunciante (ej. "KSV-AS-041").
 *  - Descripcion completa: `<div class="comment"><div class="adCommentsLanguage..."><p>...</p></div></div>`.
 *  - Imagenes: JSON inline `multimediaCarrousel: { multimedias: [{content:[{src:...}]}]}`.
 *  - Telefono: solo aparece tras click "Ver telefono" o via AJAX
 *    `/es/ajax/ads/{adId}/contact-phones`.
 *
 * El parser es DOM-only (regex sobre HTML); no requiere DOMParser.
 */
export function parseIdealistaDetail(html: string): ParsedDetail {
  const adId =
    matchFirst(html, /idForm:\s*\{[^}]*adId:\s*(\d{6,})/i) ??
    matchFirst(html, /\badId:\s*(\d{6,})/i) ??
    matchFirst(html, /name=["']adId["']\s+value=["'](\d{6,})["']/i);

  const phonesPath = matchFirst(html, /urlAdContactPhones:\s*['"]([^'"]+)['"]/i);

  const advertiserName =
    matchFirst(html, /adCommercialName:\s*["']([^"']+)["']/) ??
    matchFirst(html, /adProfessionalName:\s*["']([^"']+)["']/) ??
    matchFirst(html, /adFirstName:\s*["']([^"']+)["']/) ??
    matchFirst(
      html,
      /<div[^>]*\bclass=["']advertiser-name[^"']*["'][^>]*>([\s\S]{0,200}?)<\/div>/i,
      stripHtmlTags,
    );

  const hasProfessional =
    /adProfessionalName:\s*["'][^"']+["']/.test(html) ||
    /<div[^>]*\bclass=["']professional-name["']/.test(html) ||
    /<input[^>]*name=["']professional["']/.test(html);
  const advertiserType: ParsedDetail["advertiserType"] = hasProfessional
    ? "agency"
    : inferAdvertiserType(html);

  const description =
    extractIdealistaCommentText(html) ??
    matchFirst(html, /"description"\s*:\s*"((?:[^"\\]|\\.)+)"/, decodeJsonString) ??
    extractMetaDescription(html);

  const listingReference =
    matchFirst(html, /adExternalReference:\s*["']([^"']{1,60})["']/) ??
    matchFirst(
      html,
      /<p[^>]*\bclass=["']txt-ref["'][^>]*>([\s\S]{1,100}?)<\/p>/i,
      (s) => stripHtmlTags(s).trim(),
    ) ??
    matchFirst(html, /"reference"\s*:\s*"([^"]{3,40})"/);

  const phones = extractIdealistaPhones(html);
  const imageUrls = extractIdealistaDetailImages(html);

  return {
    phones,
    advertiserName: cleanShort(advertiserName),
    advertiserType,
    description: cleanWhitespace(description),
    imageUrls,
    listingReference: cleanShort(listingReference),
    cadastralRef: extractCadastralRef(description ?? html),
    idealistaAdId: adId ?? null,
    idealistaPhonesPath: phonesPath ?? null,
  };
}

/**
 * Idealista expone los telefonos del ANUNCIANTE solo tras click "Ver
 * telefono" o via AJAX `urlAdContactPhones`. En el HTML pre-click hay
 * `<a class="phone" href="tel://...">` pero esos son numeros
 * INSTITUCIONALES de Idealista (atencion al cliente: 900 423 525,
 * verificacion: 917 014 030). NUNCA extraer esos como telefono del
 * anunciante.
 *
 * Selectores validos (todos exclusivos del anunciante):
 *   1. `<a class="phone-number ..." href="tel:NNNNNNNNN">` (post-click).
 *   2. `<a class="...item-clickable-phone..." href="tel:...">` (post-click).
 *   3. `<a class="...hidden-contact-phones_formatted-phone..." href="tel:NNNNNN">`
 *      con valor real (no `{{=phoneNumber}}` template).
 *   4. JSON inline `phones: [{ formattedPhoneNumber: "..." }]` (post-click).
 *   5. `<span class="hidden-contact-phones_text">600 111 222</span>` (post-click).
 *
 * Si nada de eso aparece, devolver `[]` y delegar al fallback AJAX en
 * runtime. NUNCA usar el regex generico aqui.
 */
function extractIdealistaPhones(html: string): string[] {
  const candidates: string[] = [];

  const advertiserPhoneClassRegex =
    /<a[^>]+\bclass=["'][^"']*\b(?:phone-number|item-clickable-phone|hidden-contact-phones_formatted-phone)\b[^"']*["'][^>]*\bhref=["']tel:\/{0,2}([0-9+][0-9 .()-]{6,30})["']/gi;
  for (const m of html.matchAll(advertiserPhoneClassRegex)) {
    if (m[1] && !m[1].includes("{{")) candidates.push(m[1]);
  }

  for (const m of html.matchAll(/"formattedPhoneNumber"\s*:\s*"([^"{}]+)"/g)) {
    if (m[1]) candidates.push(m[1]);
  }
  for (const m of html.matchAll(/"phoneNumber"\s*:\s*"([^"{}]+)"/g)) {
    if (m[1]) candidates.push(m[1]);
  }
  for (const m of html.matchAll(
    /<span[^>]+\bclass=["'][^"']*\bhidden-contact-phones_text\b[^"']*["'][^>]*>([\s\S]{0,40}?)<\/span>/gi,
  )) {
    if (m[1]) {
      const text = stripHtmlTags(m[1]).trim();
      if (text && !text.includes("{{")) candidates.push(text);
    }
  }

  return normalizeUniquePhones(candidates);
}

function extractIdealistaCommentText(html: string): string | null {
  const m = html.match(
    /<div[^>]*\bclass=["']comment["'][^>]*>[\s\S]*?<div[^>]*\bclass=["'][^"']*adCommentsLanguage[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  if (!m?.[1]) return null;
  const text = stripHtmlTags(m[1]);
  return text.length >= 30 ? text : null;
}

/**
 * Idealista: extrae todas las URLs de fotos del JSON inline
 * `multimediaCarrousel`. Si el HTML fue capturado tras click en alguna foto
 * del carrusel, tambien hay <img> directos que actuan como fallback.
 *
 * Filtra las URLs `WEB_DETAIL_TOP-L-L` (variante thumbnail) en favor de
 * `WEB_DETAIL-M-L` (resolucion de detalle). Si solo existe la primera,
 * la conserva.
 */
function extractIdealistaDetailImages(html: string): string[] {
  const candidates: string[] = [];

  for (const m of html.matchAll(
    /"(?:src|srcWebp|imageUrl|url)"\s*:\s*"(https?:\/\/img\d*\.idealista\.com\/[^"\\]+)"/gi,
  )) {
    if (m[1]) candidates.push(m[1].replace(/\\\//g, "/"));
  }

  for (const m of html.matchAll(
    /<img[^>]+\bsrc=["'](https?:\/\/img\d*\.idealista\.com\/[^"']+)["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }

  for (const m of html.matchAll(
    /\bdata-(?:src|ondemand-img)=["'](https?:\/\/img\d*\.idealista\.com\/[^"']+)["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }

  const all = dedupeUrls(candidates).filter(
    (u) =>
      /\.(?:jpe?g|png|webp|avif)/i.test(u) &&
      !/sprite|icon|placeholder|loading|favicon|logo|map|maps\.google/i.test(u),
  );

  return preferDetailVariant(all);
}

function preferDetailVariant(urls: string[]): string[] {
  // Cuando una misma foto aparece en varias resoluciones (TOP-L-L, M-L,
  // SMALL...), preferimos la version M-L (detalle). Identidad por path
  // residual desde "/id.pro" hasta el nombre del archivo.
  const byKey = new Map<string, { url: string; rank: number }>();
  for (const u of urls) {
    const key = u.split("/").slice(-3).join("/");
    const rank = u.includes("WEB_DETAIL-M-L")
      ? 0
      : u.includes("WEB_DETAIL_TOP")
        ? 2
        : u.includes("WEB_DETAIL")
          ? 1
          : 3;
    const existing = byKey.get(key);
    if (!existing || rank < existing.rank) byKey.set(key, { url: u, rank });
  }
  return [...byKey.values()].map((v) => v.url);
}

// =====================================================================
// FOTOCASA
// =====================================================================

/**
 * Parser del detalle de Fotocasa.
 *
 * Fotocasa expone el estado SSR completo del anuncio en una asignación
 * inline `window.__INITIAL_PROPS__ = JSON.parse('...')` con el objeto
 * `realEstateAdDetailEntityV2`. Esa es la fuente PREFERIDA y trae:
 *
 *   - `description` (texto plano completo, sin truncar)
 *   - `publisher.phone` (teléfono del anunciante; **no requiere click**
 *     en "Ver teléfono", está siempre presente en el HTML estático)
 *   - `publisher.name` / `publisher.alias` (nombre/marca del anunciante)
 *   - `publisher.type` ("professional" → agency, "private"/"particular" →
 *     particular)
 *   - `publisher.reference` (código interno del anunciante, no catastral)
 *   - `multimedias[]` con todas las URLs de fotos
 *
 * Verificado contra HTML real capturado el 7/05/2026 via Bright Data Web
 * Unlocker (zona web_unlocker1 + header
 * `x-unblock-expect={"element":"body"}`). Fixtures reales en
 * `workers/market-worker/src/portals/fotocasa/__tests__/fixtures/detail/`.
 *
 * El parser opera en tres modos:
 *
 *  1. **HTML bloqueado** (`isFotocasaBlocked(html) === true`): devuelve
 *     estructura vacía. El handler distingue "ficha bloqueada" de "ficha
 *     sin datos extraíbles".
 *  2. **HTML con `__INITIAL_PROPS__`** (caso normal con Web Unlocker):
 *     extrae todos los campos directamente del JSON.
 *  3. **Fallback DOM** (HTML legacy `__NEXT_DATA__` o response degradada):
 *     intenta selectores `re-Detail*`, `__NEXT_DATA__` y meta tags. Solo
 *     útil si Fotocasa cambia su SSR.
 *
 * IMPORTANTE: Fotocasa NO expone referencia catastral en sus detalles
 * (verificado en el dump de keys de `realEstateAdDetailEntityV2`). El
 * campo `publisher.reference` es la referencia INTERNA del anunciante
 * (ej. "01-MU024X"), NO la catastral.
 */
export function parseFotocasaDetail(html: string): ParsedDetail {
  if (isFotocasaBlocked(html)) {
    return emptyDetail();
  }

  // 1) Vía preferida: __INITIAL_PROPS__ (HTML real de Bright Data).
  const initialProps = parseFotocasaInitialPropsAd(html);
  if (initialProps) {
    return initialProps;
  }

  // 2) Fallback: __NEXT_DATA__ + DOM (legacy / mobile / variantes).
  const nextData = parseFotocasaNextData(html);

  const description =
    (nextData?.description as string | undefined) ??
    extractFirstBlockText(
      html,
      /<(?:p|div)[^>]*\bclass=["'][^"']*\bre-DetailDescription\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i,
    ) ??
    extractFirstBlockText(
      html,
      /<div[^>]*\b(?:class|data-test)=["'][^"']*\b(?:re-Description|description-text|fc-DetailDescription)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ) ??
    matchFirst(html, /"description"\s*:\s*"((?:[^"\\]|\\.)+)"/, decodeJsonString) ??
    extractMetaDescription(html);

  const advertiserName =
    (nextData?.advertiserName as string | undefined) ??
    matchFirst(html, /"branding"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/) ??
    matchFirst(html, /"clientName"\s*:\s*"([^"]+)"/) ??
    matchFirst(html, /"agencyName"\s*:\s*"([^"]+)"/) ??
    matchFirst(
      html,
      /<[^>]+\bdata-test=["']advertiser-name["'][^>]*>([\s\S]{1,200}?)<\/[^>]+>/i,
      (s) => stripHtmlTags(s).trim(),
    ) ??
    matchFirst(
      html,
      /<a[^>]*\bclass=["'][^"']*\bre-ContactDetail-?(?:agencyName|clientName|name)\b[^"']*["'][^>]*>([\s\S]{1,200}?)<\/a>/i,
      (s) => stripHtmlTags(s).trim(),
    );

  const advertiserType: ParsedDetail["advertiserType"] =
    (nextData?.advertiserType as ParsedDetail["advertiserType"] | undefined) ??
    inferFotocasaAdvertiserType(html);

  const listingReference =
    (nextData?.listingReference as string | undefined) ??
    matchFirst(html, /"adReference"\s*:\s*"([A-Z0-9._/\\-]{3,40})"/) ??
    matchFirst(html, /"reference"\s*:\s*"([A-Z0-9._/\\-]{3,40})"/) ??
    matchFirst(html, /"clientCode"\s*:\s*"([A-Z0-9._/\\-]{3,40})"/) ??
    matchFirst(
      html,
      /<ul[^>]*\bclass=["'][^"']*\bre-FormContactDetail-referenceAlias\b[^"']*["'][^>]*>\s*<li[^>]*>(?:Referencia[^A-Z0-9]*)([A-Z0-9][A-Z0-9._/\\-]{1,40})\s*<\/li>/i,
    ) ??
    matchFirst(
      html,
      /<[^>]*\bdata-test=["'](?:advert-)?reference["'][^>]*>([\s\S]{1,80}?)<\/[^>]+>/i,
      (s) => stripHtmlTags(s).trim(),
    ) ??
    // Patron textual "Referencia del anuncio: XYZ" en el bloque de
    // caracteristicas. La regex es restrictiva para evitar matchear
    // cualquier cosa.
    matchFirst(
      html,
      /Referencia(?:\s+del\s+anuncio)?[^<:]{0,40}[:>]\s*([A-Z0-9][A-Z0-9._/\\-]{2,40})/,
    );

  const phonesFromNext = (nextData?.phones as string[] | undefined) ?? [];
  const phones = normalizeUniquePhones([...phonesFromNext, ...extractFotocasaPhones(html)]);

  const imageUrls = (nextData?.imageUrls as string[] | undefined) && (nextData!.imageUrls as string[]).length > 0
    ? (nextData!.imageUrls as string[])
    : extractFotocasaDetailImages(html);

  return {
    phones,
    advertiserName: cleanShort(advertiserName),
    advertiserType,
    description: cleanWhitespace(description),
    imageUrls,
    listingReference: cleanShort(listingReference),
    cadastralRef: extractCadastralRef(description ?? html),
  };
}

/**
 * Extrae los datos del detalle desde
 * `window.__INITIAL_PROPS__.realEstateAdDetailEntityV2`. Esta es la
 * fuente CANÓNICA en HTML real servido por Fotocasa: contiene el
 * teléfono del anunciante sin necesidad de simular click "Ver teléfono".
 *
 * Devuelve `null` si no encuentra `__INITIAL_PROPS__` o si la entidad
 * `realEstateAdDetailEntityV2` no está. El caller cae al modo legacy
 * (`__NEXT_DATA__` + DOM) en ese caso.
 *
 * Mapeo de tipos publisher → advertiserType:
 *   - "professional"  → "agency"
 *   - "private"       → "particular"
 *   - "particular"    → "particular"
 *   - "user"          → "particular"
 *   - cualquier otro  → null (delegar a inferencia DOM)
 */
function parseFotocasaInitialPropsAd(html: string): ParsedDetail | null {
  const props = parseFotocasaInitialProps(html);
  if (!props) return null;
  const ad = props.realEstateAdDetailEntityV2 as Record<string, unknown> | undefined;
  if (!ad || typeof ad !== "object") return null;

  const publisher = (ad.publisher as Record<string, unknown> | undefined) ?? {};

  const description = typeof ad.description === "string" ? ad.description : null;

  const phoneRaw = typeof publisher.phone === "string" ? publisher.phone : null;
  const phones = normalizeUniquePhones(phoneRaw ? [phoneRaw] : []);

  const advertiserName =
    (typeof publisher.alias === "string" && publisher.alias.trim()) ||
    (typeof publisher.name === "string" && publisher.name.trim()) ||
    null;

  const publisherType = typeof publisher.type === "string" ? publisher.type.toLowerCase() : null;
  const advertiserType: ParsedDetail["advertiserType"] =
    publisherType === "professional"
      ? "agency"
      : publisherType === "private" ||
        publisherType === "particular" ||
        publisherType === "user"
        ? "particular"
        : null;

  const listingReference =
    (typeof publisher.reference === "string" && publisher.reference.trim()) || null;

  const imageUrls = extractFotocasaInitialPropsImages(ad.multimedias);

  return {
    phones,
    advertiserName: cleanShort(advertiserName),
    advertiserType,
    description: cleanWhitespace(description),
    imageUrls,
    listingReference: cleanShort(listingReference),
    // Fotocasa NO expone referencia catastral en sus detalles. Solo se
    // intenta extraer del texto de la descripción si el anunciante la
    // incluye (raro).
    cadastralRef: extractCadastralRef(description ?? null),
  };
}

/**
 * `multimedias` de Fotocasa puede tener entradas tipo:
 *   - `{ position, type:"image", url:"https://static.fotocasa.es/images/ads/<uuid>?rule=original" }`
 *   - `{ type:"plan", url }` (planos)
 *   - `{ type:"video", url }` (videos del tour, no útiles para imágenes)
 *
 * Filtramos solo `type === "image"` y devolvemos URLs absolutas
 * deduplicadas en orden de aparición.
 */
function extractFotocasaInitialPropsImages(multimedias: unknown): string[] {
  if (!Array.isArray(multimedias)) return [];
  const out: string[] = [];
  for (const m of multimedias) {
    if (!m || typeof m !== "object") continue;
    const item = m as Record<string, unknown>;
    if (typeof item.type === "string" && item.type !== "image") continue;
    const url = item.url ?? item.src;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      out.push(url);
    }
  }
  return dedupeUrls(out);
}

/**
 * Extrae los datos del detalle desde `<script id="__NEXT_DATA__" type="application/json">`.
 * Fotocasa (Next.js) embebe el SSR completo en ese script. Devuelve `null` si
 * el script no existe o el JSON esta corrupto.
 *
 * Estructura esperada (verificada parcialmente contra Fotocasa public
 * pages, schema documentado en Adevinta react-cms):
 *
 *   props.pageProps.initialProps.realEstate.{
 *     description, contactInfo: { phone, advertiserName, isAgency },
 *     reference, multimedias: [{url, ...}], ...
 *   }
 *
 * Como la profundidad puede variar entre versiones, el parser hace una
 * busqueda recursiva por las claves de interes (resiliente a cambios de
 * shape). Si no encuentra alguna clave, devuelve undefined en ese campo.
 */
interface FotocasaNextDataExtract {
  description?: string;
  phones?: string[];
  advertiserName?: string;
  advertiserType?: ParsedDetail["advertiserType"];
  listingReference?: string;
  imageUrls?: string[];
}
function parseFotocasaNextData(html: string): FotocasaNextDataExtract | null {
  const m = html.match(
    /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m?.[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1]);
  } catch {
    return null;
  }

  const out: FotocasaNextDataExtract = {};
  // Busqueda recursiva por claves conocidas. Se queda con la PRIMERA
  // ocurrencia de cada clave (la mas alta en el arbol normalmente es la
  // canonica del realEstate principal).
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      // Description
      if (out.description == null && key === "description" && typeof value === "string" && value.length > 30) {
        out.description = value;
      }
      // Phones (puede venir como string, array o dentro de contactInfo).
      if (key === "phone" || key === "phoneNumber" || key === "formattedPhoneNumber") {
        if (typeof value === "string" && /\d{6,}/.test(value)) {
          (out.phones ??= []).push(value);
        }
      }
      if (key === "phones" && Array.isArray(value)) {
        for (const p of value) {
          if (typeof p === "string") (out.phones ??= []).push(p);
          else if (p && typeof p === "object") {
            const pp = p as Record<string, unknown>;
            const v = pp.formattedPhoneNumber ?? pp.phoneNumber ?? pp.phone;
            if (typeof v === "string") (out.phones ??= []).push(v);
          }
        }
      }
      // Advertiser
      if (out.advertiserName == null && (key === "agencyName" || key === "clientName" || key === "advertiserName")) {
        if (typeof value === "string" && value.trim()) out.advertiserName = value.trim();
      }
      if (out.advertiserType == null && (key === "isAgency" || key === "isProfessional")) {
        if (value === true) out.advertiserType = "agency";
        if (value === false) out.advertiserType = "particular";
      }
      if (out.advertiserType == null && key === "clientTypeId") {
        if (value === 2 || value === "2") out.advertiserType = "agency";
        else if (value === 1 || value === "1") out.advertiserType = "particular";
      }
      // Reference
      if (out.listingReference == null && (key === "clientCode" || key === "reference" || key === "adReference")) {
        if (typeof value === "string" && value.trim().length >= 2) out.listingReference = value.trim();
      }
      // Images
      if (key === "multimedias" && Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            const url = (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).src;
            if (typeof url === "string" && /^https?:\/\//i.test(url)) {
              (out.imageUrls ??= []).push(url);
            }
          }
        }
      }
      visit(value, depth + 1);
    }
  };
  visit(parsed, 0);

  if (out.imageUrls) {
    out.imageUrls = dedupeUrls(out.imageUrls).filter(
      (u) => /\.(?:jpe?g|png|webp|avif)/i.test(u) && !/sprite|logo|placeholder/i.test(u),
    );
  }
  return out;
}

function extractFotocasaPhones(html: string): string[] {
  const candidates: string[] = [];

  // tel: links solo dentro de bloques de contacto del anunciante (no del
  // footer de Fotocasa). Aproximacion: buscar tel: cerca de clases conocidas.
  for (const m of html.matchAll(
    /<a[^>]+\bclass=["'][^"']*\bre-ContactDetail-?(?:phone|telephone|callButton)[^"']*["'][^>]*\bhref=["']tel:\/{0,2}([0-9+][0-9 .()-]{6,30})["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }
  for (const m of html.matchAll(
    /<a[^>]+\bdata-(?:testid|test)=["'][^"']*\bphone[^"']*["'][^>]*\bhref=["']tel:\/{0,2}([0-9+][0-9 .()-]{6,30})["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }
  // JSON inline tras click "Ver telefono".
  for (const m of html.matchAll(/"formattedPhoneNumber"\s*:\s*"([^"{}]+)"/g)) {
    if (m[1]) candidates.push(m[1]);
  }
  for (const m of html.matchAll(/"phoneNumber"\s*:\s*"([^"{}]+)"/g)) {
    if (m[1]) candidates.push(m[1]);
  }

  return normalizeUniquePhones(candidates);
}

function inferFotocasaAdvertiserType(html: string): ParsedDetail["advertiserType"] {
  const snippet = html.slice(0, 80_000);
  if (/"isAgency"\s*:\s*true|"isProfessional"\s*:\s*true|\bclientTypeId\s*:\s*2\b/i.test(snippet)) {
    return "agency";
  }
  if (/"isAgency"\s*:\s*false|"isProfessional"\s*:\s*false|\bclientTypeId\s*:\s*1\b/i.test(snippet)) {
    return "particular";
  }
  if (/\bprofesional\b/i.test(snippet) || /agencia/i.test(snippet)) return "agency";
  if (/\bparticular\b/i.test(snippet)) return "particular";
  return null;
}

/**
 * Heuristica: el bloqueo PerimeterX/HUMAN devuelve HTML <30 KB con
 * `SENTIMOS LA INTERRUPCION` en el title. Tambien cubre `Pardon Our Interruption`.
 */
export function isFotocasaBlocked(html: string): boolean {
  if (html.length > 60_000) return false;
  return (
    /SENTIMOS LA INTERRUPCI/i.test(html) ||
    /Pardon Our Interruption/i.test(html) ||
    /<title>\s*SENTIMOS LA INTERRUPCI/i.test(html)
  );
}

function extractFotocasaDetailImages(html: string): string[] {
  const candidates: string[] = [];
  // Hosts conocidos de imagenes de Fotocasa: img.fotocasa.es, img4.fotocasa.es,
  // fotos.imghs.net (CDN compartido con Pisos.com), st1.idealista.com (no, ese
  // es Idealista). Filtramos por hosts autorizados.
  const hostRegex = /(?:fotocasa|imghs|adevinta|fcassets)\.[a-z]{2,5}/i;

  for (const m of html.matchAll(
    /"(?:src|url|imageUrl|srcWebp|original|large|big)"\s*:\s*"(https?:\/\/[^"\\]+)"/gi,
  )) {
    if (m[1] && hostRegex.test(m[1])) candidates.push(m[1].replace(/\\\//g, "/"));
  }
  for (const m of html.matchAll(
    /<img[^>]+\bsrc=["'](https?:\/\/[^"']+)["']/gi,
  )) {
    if (m[1] && hostRegex.test(m[1])) candidates.push(m[1]);
  }
  for (const m of html.matchAll(
    /<img[^>]+\bdata-src=["'](https?:\/\/[^"']+)["']/gi,
  )) {
    if (m[1] && hostRegex.test(m[1])) candidates.push(m[1]);
  }
  for (const m of html.matchAll(
    /<link[^>]+\brel=["']preload["'][^>]+\bas=["']image["'][^>]+\bhref=["'](https?:\/\/[^"']+)["']/gi,
  )) {
    if (m[1] && hostRegex.test(m[1])) candidates.push(m[1]);
  }

  return dedupeUrls(candidates).filter(
    (u) => /\.(?:jpe?g|png|webp|avif)/i.test(u) && !/sprite|logo|placeholder|favicon|icons?\//i.test(u),
  );
}

// =====================================================================
// PISOS.COM
// =====================================================================

/**
 * Parser del detalle de Pisos.com (verificado contra HTML real capturado
 * 7/05/2026, fixture
 * `pisoscom/__tests__/fixtures/detail/detail-agency-durna-63364247450.html`).
 *
 * Selectores y fuentes (en orden de preferencia):
 *
 * - **Telefono**: `<span id="vtmExtraVars" data-var='{"telefono":"NNNNNNNN",...}'>`.
 *   Es el numero REAL del anunciante. NUNCA usar `data-number` de los
 *   botones `.callBtn`: cuando `data-is-incotel="True"`, ese numero es
 *   un proxy de Incotel (anti-bot), no el del anunciante.
 *
 * - **Descripcion**: `<div class="description__content">...</div>`. Contiene
 *   `<br>` que hay que respetar como saltos de linea. La descripcion del
 *   meta tag (`<meta name="description">`) es solo un resumen truncado.
 *
 * - **Anunciante**: `<p class="owner-info__name"><a>NOMBRE</a></p>`.
 *
 * - **Tipo de anunciante**: `vtmVars.tipoVendedor` ("profesional" => agency,
 *   "particular" => particular).
 *
 * - **Referencia del anuncio**: bloque `features__feature` con icono
 *   `icon-reference`: `<span class="features__label">Referencia: </span>
 *   <span class="features__value">DN02713/2799</span>`.
 *
 * - **Imagenes**: combinacion de `<link rel="preload" as="image">` (head,
 *   primeras 5 fotos) + `<img src="https://fotos.imghs.net/...">` y
 *   `data-bg="..."` del carrusel `.carousel__main-photo`. La pagina muestra
 *   un contador `<span class="media-types-menu__number">50</span>` con el
 *   total. Las URLs siguen el patron
 *   `https://fotos.imghs.net/<size>-wp/<advertiser-id>/<id>/<id>_<id>_<n>_<timestamp>.jpg`.
 */
export function parsePisoscomDetail(html: string): ParsedDetail {
  const vtmExtra = parseVtmDataVar(html, /id=["']vtmExtraVars["']\s+data-var=["']([^"']+)["']/);
  const vtm = parseVtmDataVar(html, /id=["']vtmVars["']\s+data-var=["']([^"']+)["']/);

  // Telefono REAL del anunciante (no el proxy Incotel de los botones .callBtn).
  const phoneRaw = vtmExtra?.telefono ? String(vtmExtra.telefono) : null;
  const phones = normalizeUniquePhones(phoneRaw ? [phoneRaw] : []);

  const description =
    extractFirstBlockText(
      html,
      /<div[^>]*\bclass=["'][^"']*\bdescription__content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ) ??
    extractFirstBlockText(
      html,
      /<div[^>]*\bclass=["'][^"']*\bdescription\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ) ??
    matchFirst(html, /"description"\s*:\s*"((?:[^"\\]|\\.)+)"/, decodeJsonString) ??
    extractMetaDescription(html);

  const advertiserName =
    matchFirst(
      html,
      /<p[^>]*\bclass=["']owner-info__name["'][^>]*>([\s\S]{1,300}?)<\/p>/i,
      (s) => stripHtmlTags(s).trim(),
    ) ??
    matchFirst(html, /<img[^>]+\bclass=["'][^"']*owner-info__logo[^"']*["'][^>]+\balt=["']([^"']+)["']/i) ??
    (vtm && typeof vtm.marca === "string" ? null : null);

  const tipoVendedor = vtm && typeof vtm.tipoVendedor === "string" ? vtm.tipoVendedor : null;
  const advertiserType: ParsedDetail["advertiserType"] = tipoVendedor
    ? tipoVendedor === "particular"
      ? "particular"
      : "agency"
    : inferAdvertiserType(html);

  const listingReference = extractPisoscomListingReference(html);

  return {
    phones,
    advertiserName: cleanShort(advertiserName),
    advertiserType,
    description: cleanWhitespace(description),
    imageUrls: extractPisoscomDetailImages(html),
    listingReference: cleanShort(listingReference),
    cadastralRef: extractCadastralRef(description ?? html),
  };
}

/**
 * Pisos.com expone la "Referencia" del anuncio en un bloque
 * `features__feature` con icono `icon-reference`. Estructura:
 *   <span class="features__icon icon-reference"></span>
 *   <span class="features__label">Referencia: </span>
 *   <span class="features__value">DN02713/2799</span>
 */
function extractPisoscomListingReference(html: string): string | null {
  const m = html.match(
    /<span[^>]*\bclass=["'][^"']*\bicon-reference\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*\bclass=["'][^"']*\bfeatures__value\b[^"']*["'][^>]*>([\s\S]{1,80}?)<\/span>/i,
  );
  if (m?.[1]) {
    const cleaned = stripHtmlTags(m[1]).trim();
    if (cleaned.length >= 2) return cleaned;
  }
  // Fallback: label "Referencia" cualquier formato.
  const fallback = html.match(
    /<span[^>]*\bclass=["'][^"']*\bfeatures__label\b[^"']*["'][^>]*>\s*Referencia\b[^<]*<\/span>\s*<span[^>]*\bclass=["'][^"']*\bfeatures__value\b[^"']*["'][^>]*>([\s\S]{1,80}?)<\/span>/i,
  );
  if (fallback?.[1]) return stripHtmlTags(fallback[1]).trim();
  return null;
}

/**
 * Imagenes del detalle de Pisos.com.
 *
 * Fuentes en orden de calidad:
 *  1. `<link rel="preload" as="image" href="https://fotos.imghs.net/...">` —
 *     primeras N fotos en alta resolucion (variantes `apps-wp/`, `fch-wp/`,
 *     `fchm-wp/`).
 *  2. `<img src="https://fotos.imghs.net/...">` dentro del carrusel.
 *  3. `data-bg="https://fotos.imghs.net/..."` (lazy backgrounds).
 *  4. `og:image` como fallback.
 *
 * Se deduplica preferiendo variantes de mayor resolucion: `xl-wp` > `apps-wp`
 * > `appswm-wp` > `fch-wp` > `fchm-wp`. Identidad por nombre de archivo.
 */
function extractPisoscomDetailImages(html: string): string[] {
  const candidates: string[] = [];

  for (const m of html.matchAll(
    /<link[^>]+\brel=["']preload["'][^>]+\bas=["']image["'][^>]+\bhref=["'](https?:\/\/[^"']*\.imghs\.net\/[^"']+)["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }

  for (const m of html.matchAll(
    /<img[^>]+\bsrc=["'](https?:\/\/[^"']*\.imghs\.net\/[^"']+)["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }

  for (const m of html.matchAll(
    /\bdata-bg=["'](https?:\/\/[^"']*\.imghs\.net\/[^"']+)["']/gi,
  )) {
    if (m[1]) candidates.push(m[1]);
  }

  const og = matchFirst(html, /<meta[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']+)["']/i);
  if (og) candidates.unshift(og);

  const filtered = dedupeUrls(candidates).filter(
    (u) =>
      /\.(?:jpe?g|png|webp|avif)/i.test(u) &&
      !/Logo_|logos\/|sprite|placeholder|favicon|prof-wp\/logos/i.test(u),
  );

  return preferPisoscomVariant(filtered);
}

function preferPisoscomVariant(urls: string[]): string[] {
  // Identidad por nombre de archivo (.../<filename>.jpg).
  // Preferencia: xl-wp > apps-wp > appswm-wp > fch-wp > fchm-wp.
  const variantRank = (u: string): number => {
    if (u.includes("/xl-wp/")) return 0;
    if (u.includes("/apps-wp/")) return 1;
    if (u.includes("/appswm-wp/")) return 2;
    if (u.includes("/fch-wp/")) return 3;
    if (u.includes("/fchm-wp/")) return 4;
    return 5;
  };
  const byKey = new Map<string, { url: string; rank: number }>();
  for (const u of urls) {
    const key = u.split("/").pop() ?? u;
    const rank = variantRank(u);
    const existing = byKey.get(key);
    if (!existing || rank < existing.rank) byKey.set(key, { url: u, rank });
  }
  return [...byKey.values()].map((v) => v.url);
}

/**
 * Pisos.com expone metadata como JSON dentro de `data-var="..."` con
 * entidades HTML escapadas (`&quot;` etc.). Decodifica y parsea con
 * tolerancia: si el JSON esta corrupto devuelve null en lugar de tirar.
 */
function parseVtmDataVar(html: string, regex: RegExp): Record<string, unknown> | null {
  const m = html.match(regex);
  if (!m?.[1]) return null;
  const decoded = decodeHtmlEntities(m[1]);
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// =====================================================================
// SHARED HELPERS
// =====================================================================

export function parsePhonesFromIdealistaPhonesPayload(body: string): string[] {
  const candidates: string[] = [];
  for (const m of body.matchAll(/"formattedPhoneNumber"\s*:\s*"([^"]+)"/g)) {
    if (m[1]) candidates.push(m[1]);
  }
  for (const m of body.matchAll(/"phoneNumber"\s*:\s*"([^"]+)"/g)) {
    if (m[1]) candidates.push(m[1]);
  }
  if (candidates.length === 0) {
    return extractPhones(body);
  }
  return normalizeUniquePhones(candidates);
}

function inferAdvertiserType(html: string): "particular" | "agency" | null {
  const snippet = html.slice(0, 80_000).toLowerCase();
  if (/profesional|agencia|inmobiliaria/.test(snippet)) return "agency";
  if (/particular/.test(snippet)) return "particular";
  return null;
}

/**
 * Extraccion permisiva de telefonos via regex generico. Usar con cuidado:
 * en algunos portales (Pisos.com, Idealista) este regex captura numeros
 * proxy / administrativos que no son del anunciante. Preferir extractores
 * especificos por portal.
 */
function extractPhones(html: string): string[] {
  const rawCandidates: string[] = [];
  for (const match of html.matchAll(PHONE_REGEX)) rawCandidates.push(match[0]);
  for (const match of html.matchAll(TEL_LINK_REGEX)) {
    if (match[1]) rawCandidates.push(match[1]);
  }
  return normalizeUniquePhones(rawCandidates);
}

function extractPhonesFromTelLinks(html: string): string[] {
  const rawCandidates: string[] = [];
  for (const match of html.matchAll(TEL_LINK_REGEX)) {
    if (match[1]) rawCandidates.push(match[1]);
  }
  for (const m of html.matchAll(/"formattedPhoneNumber"\s*:\s*"([^"]+)"/g)) {
    if (m[1]) rawCandidates.push(m[1]);
  }
  return normalizeUniquePhones(rawCandidates);
}

function normalizeUniquePhones(raws: string[]): string[] {
  const out = new Set<string>();
  for (const raw of raws) {
    const phone = normalizePhone(raw);
    if (phone) out.add(phone);
  }
  return [...out];
}

function extractCadastralRef(input: string | null): string | null {
  if (!input) return null;
  const match = input.match(CADASTRAL_REF_REGEX);
  return match?.[1] ? match[1].toUpperCase() : null;
}

function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]*\bname=["']description["'][^>]*\bcontent=["']([\s\S]*?)["']/i) ??
    html.match(/<meta[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["']([\s\S]*?)["']/i);
  return m?.[1] ? cleanWhitespace(decodeHtmlEntities(m[1])) : null;
}

function extractFirstBlockText(html: string, regex: RegExp): string | null {
  const m = html.match(regex);
  if (!m?.[1]) return null;
  const text = stripHtmlTags(m[1]);
  return text.length >= 30 ? text : null;
}

function stripHtmlTags(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function cleanWhitespace(input: string | null): string | null {
  if (input == null) return null;
  const cleaned = decodeHtmlEntities(input).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanShort(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#xF3;/g, "ó")
    .replace(/&#xE1;/g, "á")
    .replace(/&#xE9;/g, "é")
    .replace(/&#xED;/g, "í")
    .replace(/&#xFA;/g, "ú")
    .replace(/&#xF1;/g, "ñ")
    .replace(/&#xC1;/g, "Á")
    .replace(/&#xC9;/g, "É")
    .replace(/&#xCD;/g, "Í")
    .replace(/&#xD3;/g, "Ó")
    .replace(/&#xDA;/g, "Ú")
    .replace(/&#xD1;/g, "Ñ")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"');
}

function decodeJsonString(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\\//g, "/")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

function dedupeUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const cleaned = raw.trim();
    if (!cleaned) continue;
    if (!/^https?:\/\//i.test(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function extractImageUrlsGeneric(html: string): string[] {
  const candidates: string[] = [];
  for (const match of html.matchAll(/<img[^>]+\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    if (match[1]) candidates.push(match[1]);
  }
  const og = matchFirst(html, /<meta[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']+)["']/i);
  if (og) candidates.unshift(og);
  return dedupeUrls(candidates).filter(
    (u) => /\.(?:jpe?g|png|webp|avif)/i.test(u) && !/sprite|icon|logo|placeholder/i.test(u),
  );
}

function emptyDetail(): ParsedDetail {
  return {
    phones: [],
    advertiserName: null,
    advertiserType: null,
    description: null,
    imageUrls: [],
    listingReference: null,
    cadastralRef: null,
  };
}

function matchFirst(
  html: string,
  regex: RegExp,
  transform: (s: string) => string = (s) => s,
): string | null {
  const m = html.match(regex);
  if (!m?.[1]) return null;
  const value = transform(m[1]);
  return value && value.length > 0 ? value : null;
}
