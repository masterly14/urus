# Análisis HTML real por portal

> **Fecha de captura:** 6 de mayo de 2026
> **Contexto:** capturas obtenidas con `scripts/capture-portal-html.ts` desde el entorno de desarrollo (Playwright Chromium, sin Bright Data) para calibrar los parsers V1 del Core de Inteligencia de Mercado.
> **Ciudad de muestra:** Córdoba capital, operación venta.

Este documento es el **contrato observado** sobre el que se construyen los parsers en `workers/market-worker/src/portals/<portal>/parser.ts`. Si un portal cambia su HTML, hay que recapturar y actualizar este doc primero, los parsers después.

---

## Fotocasa

### Estado de captura

| Modo | Cobertura | Notas |
|------|-----------|-------|
| **`direct-browser` (Playwright local, headed o headless)** | Solo listado página 1 (~2.24 MB tras `scrollToBottom`). Pag.2+ y todos los detalles → HTTP 403. | Modo legacy. Sirve para extraer ~25 cards de pag.1 con regex DOM. NO accede al detail. |
| **Bright Data Web Unlocker (`zone=web_unlocker1` + `x-unblock-expect: {"element":"body"}`)** | Listado pag.1–pag.5 y detalle: HTTP 200, ~1.5 MB listing y ~945 KB detail. | **Modo recomendado**. Activa con `MARKET_FOTOCASA_USE_BRIGHTDATA=true`. Verificado 7/05/2026 contra Fotocasa real. |

**Implicación**: V1 puede usar `direct-browser` para listings pero el detail queda imposible. Cuando se activa Bright Data Web Unlocker se reutiliza la zona de Idealista pasando un header per-request que sobreescribe el `expect_element=.re-SharedTopbar` que la zona tiene configurado para Idealista (NO existe en Fotocasa). El cambio es transparente: el server elige el fetcher en construcción.

### URL de listado

```
https://www.fotocasa.es/es/comprar/viviendas/<ciudad>-capital/todas-las-zonas/l
https://www.fotocasa.es/es/comprar/viviendas/<ciudad>-capital/todas-las-zonas/l/<N>   (paginación, hoy 403)
```

### URL de ficha

```
/es/comprar/vivienda/<ciudad>-capital/<features-slug>/<ID>/d
```

- `<ID>` son **9 dígitos** al final, antes de `/d` (ej. `188063260`).
- `<features-slug>` describe amenities (`aire-acondicionado-ascensor-...`) — útil pero no estable.

### Datos estructurados

| Fuente | Disponibilidad | Contenido |
|--------|---------------|-----------|
| `<script type="application/ld+json">` BreadcrumbList | Listing y detail | Solo navegación. **No sirve**. |
| `<script type="application/ld+json">` RealEstateListing | Solo listing (1 instancia) | Categoría agregada. **No contiene anuncios individuales**. |
| `<script id="__NEXT_DATA__">` | **NO existe** en Fotocasa actual | (Comentado por compatibilidad con builds antiguos). |
| **`window.__INITIAL_PROPS__ = JSON.parse('...')`** (inline) | **Listing y detail** (HTML real Bright Data) | **Fuente canónica**: trae 100% de los datos del SSR. |

**Conclusión**: cuando el HTML viene desbloqueado (Bright Data) usar **siempre `__INITIAL_PROPS__`**. El parser cae a regex-DOM solo si ese script no existe (versión móvil, scrape vía direct-browser sin SSR completo).

#### Estructura de `__INITIAL_PROPS__` — listing

```
initialSearch.result.realEstates: [   // 31 anuncios por página de listing
  {
    id: 188063260,                            // numérico
    realEstateAdId: "uuid-...",
    address: { country, district, neighborhood, zipCode, municipality, ... },
    coordinates: { latitude: 37.88, longitude: -4.78, accuracy: 0 },
    description: "...",                       // texto plano completo
    phone: "+34957488346",                    // teléfono del anunciante (sin click!)
    rawPrice: 297000,                          // numérico
    price: "297.000 €",                        // formateado
    multimedia: [{ type:"image", src:"https://static.fotocasa.es/..." }],
    clientType: "professional",                // o "private"/"particular"
    clientAlias: "Inmobiliaria Barin",
    clientId: 900040000042, publisherId: "uuid-...",
    detail: { "es-ES":"/es/comprar/vivienda/.../d", ... },
    features: [{ key:"air_conditioner", value:1 }, { key:"surface", value:148 }, ...],
    buildingType:"Flat", buildingSubtype:"Flat",
    transactionTypeId:1, typeId:2, subtypeId:1,
    ...
  },
  ... (30 más)
]
```

#### Estructura de `__INITIAL_PROPS__` — detail

```
realEstateAdDetailEntityV2: {
  id: "1_188063260",                           // <portalId>_<adId>
  address: { coordinates, locality, province, zipCode, ... },
  description: "...",                          // texto plano completo
  multimedias: [                               // ~62 fotos típicas
    { position:1, type:"image", url:"https://static.fotocasa.es/images/ads/<uuid>?rule=original" },
    { position:2, type:"image", ... }
  ],
  publisher: {
    alias:"Inmobiliaria Barin",                // marca comercial
    name:"Barin Mediación Inmobiliaria SLU",   // razón social
    phone:"+34957488346",                       // ← teléfono SIN click
    type:"professional",                         // o "private"/"particular"/"user"
    reference:"01-MU024X",                       // ← código INTERNO del anunciante (NO catastral)
    publisherId:"uuid-...",
    logo:"https://static.fotocasa.es/images/client/<uuid>/<ts>?rule=original",
    url:"/es/inmobiliaria-...",
    id:900040000042
  },
  features: [{ type:"TYPOLOGY", value:"FLAT" }, ...],
  price: { amount:297000, amountDrop:0, periodicity:0 },
  energyCertificate: { ... },
  uris: [{ language:"es_ES", value:"/es/comprar/vivienda/.../d" }, ...]
}
```

#### Mapeo a `ParsedDetail` / `MarketExtractorItem`

| Campo destino | Origen en `__INITIAL_PROPS__` |
|---|---|
| `phones[]` | `realEstateAdDetailEntityV2.publisher.phone` (normalizado a `+34NNNNNNNNN`) |
| `description` | `realEstateAdDetailEntityV2.description` |
| `advertiserName` | `publisher.alias` (preferido) o `publisher.name` |
| `advertiserType` | `publisher.type` mapeado: `professional → agency`, `private/particular/user → particular` |
| `listingReference` | `publisher.reference` (código interno, NO catastral) |
| `imageUrls[]` | `multimedias[].url` filtrando `type === "image"` |
| `cadastralRef` | **siempre `null`**: Fotocasa NO expone referencia catastral en sus detalles |

#### Selectores DOM (fallback)

Cuando `__INITIAL_PROPS__` no aparece:

| Selector | Datos |
|---|---|
| `<button data-testid="view-phone-button">` | Botón "Ver teléfono" (no hace falta clickear si hay `__INITIAL_PROPS__`) |
| `<ul class="re-FormContactDetail-referenceAlias"><li>Referencia: <CODE></li></ul>` | listingReference |
| `<p class="re-DetailDescription">` | descripción |
| `<img class="re-DetailMosaicPhoto" src="https://static.fotocasa.es/images/ads/<uuid>?rule=...">` | fotos |
| `<h1 class="re-DetailHeader-propertyTitle">` | título |
| `<p class="re-DetailHeader-municipalityTitle">` | municipio |
| `<p class="re-DetailHeader-price">` | precio |

#### Parsing legacy (modo regex-fallback, sin SSR)

Estrategia conservada del 06/05/2026 para HTML capturado vía `direct-browser`:

1. **URLs de ficha**: `/href="(\/es\/comprar\/vivienda\/[^"\s]+\/(\d{6,})\/d)"/g`
2. **Precio cercano al href**: `(\d{1,3}(?:\.\d{3})+)\s*€`.
3. **Área / habs**: `(\d{1,4})\s*m²` y `(\d+)\s+(?:hab|habs|dormit)`.
4. **ID estable**: numérico al final del path.

### Cookie banner

Se cierra con click en botón con texto "Aceptar" / "Acepto" (locale es-ES). El `acceptCookieBanner` actual ya cubre estos labels.

### Bloqueo

Cuando Fotocasa bloquea (HUMAN/PerimeterX), devuelve HTTP 403 con HTML de ~12 KB que contiene formularios de validación. Marcadores fiables:
- HTTP status `403`.
- `bytes < 50_000` (mientras una página normal pesa > 500 KB).
- Title `<title>SENTIMOS LA INTERRUPCIÓN</title>` o `Pardon Our Interruption`.

**Vía Bright Data Web Unlocker no se ha visto bloqueo en producción** (verificado contra ~10 capturas, success rate 100%). El header `x-unblock-expect: {"element":"body"}` es **obligatorio** cuando se reutiliza la zona de Idealista — sin él Bright Data devuelve HTTP 502 con `x-brd-error: waiting for selector ".re-SharedTopbar" failed: timeout 60000ms exceeded`.

---

## Pisos.com

### Estado de captura

- Listado página 1: HTTP 200, 515 KB.
- Listado páginas 2-3: HTTP 200 cada una (~480 KB). **Paginación sin bloqueos**.
- 2 fichas detalle: HTTP 200 (~280 KB cada una). **Sin bloqueos**.

**Implicación**: Pisos.com es laxo. V1 puede usar `direct-browser` puro y paginar tranquilamente.

### URL de listado

```
https://www.pisos.com/venta/pisos-<ciudad>_capital/
https://www.pisos.com/venta/pisos-<ciudad>_capital/<N>/   (paginación, OK)
```

> **OJO**: el patrón antiguo `/comprar/pisos-cordoba_capital-zona/` que aparecía en la primera versión del script da 404. El correcto es `/venta/pisos-cordoba_capital/`.

### URL de ficha

```
/comprar/<tipologia>-<slug>-<ID11+>_<AGENCY6+>/
```

- `<ID11+>` son **11 dígitos** del anuncio (ej. `62580960798`).
- `<AGENCY6+>` son 6 dígitos del agency/sub-tracking (ej. `100500`).
- `<tipologia>`: `piso | casa | chalet | adosado | atico | duplex | estudio | loft | garaje | local | oficina | finca | nave | terreno | trastero | edificio | casa_adosada`.

### Datos estructurados (oro)

**Pisos.com expone 33 scripts JSON-LD** con `@type=SingleFamilyResidence`, **uno por anuncio**. Shape verificado:

```json
{
  "@context": "https://schema.org/",
  "@type": "SingleFamilyResidence",
  "@id": "62580960798.100500",
  "image": "https://fotos.imghs.net/.../foto.jpg",
  "url": "/comprar/piso-la_vinuela_rescatado14007-62580960798_100500/",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "C&#xF3;rdoba Capital",
    "addressRegion": "C&#xF3;rdoba"
  },
  "geo": { "latitude": "37,8907722", "longitude": "-4,7622451" }
}
```

**Da gratis**: `externalId` (parte antes del `.`), URL canónica, imagen principal, ciudad/región (con HTML entities), latitud/longitud (con coma decimal española → hay que parsear con `replace(",", ".")`).

**No da**: precio, área, habitaciones, baños, descripción, advertiserName.

### Card en DOM (complemento)

```html
<div id="62580960798.100500" class="ad-preview ad-preview--has-desc"
     data-lnk-href="/comprar/piso-la_vinuela_rescatado14007-62580960798_100500/">
  ...precio, área, habs, etc.
</div>
```

Buscando dentro del bloque entre `<div id="<ID>.<AGENCY>"` y el siguiente `<div id="..."`:
- Precio: `170.000 €` con la regex `(\d{1,3}(?:\.\d{3})+)\s*€`.
- Área: `90 m²` con `(\d+)\s*m(?:²|2)`.
- Habs: `3 hab` con `(\d+)\s*hab`.
- Title: dentro de `<h2>` o `<h3>` (a confirmar más detalladamente al implementar).

### Parsing recomendado

**Estrategia híbrida**:
1. Iterar JSON-LD `SingleFamilyResidence` para `externalId`, `canonicalUrl`, `lat`, `lng`, `imageUrl`, `city`, `region`.
2. Para cada anuncio, localizar `<div id="<ID>.<AGENCY>" class="ad-preview"...>` en el DOM y extraer precio/área/habs del bloque.
3. Combinar y emitir `MarketExtractorItem`.

Esto es robusto porque la estructura `ad-preview` es estable (la clase tiene un nombre semántico, no es Tailwind utility).

### Cookie banner

A confirmar al primer arranque local. La página retorna 200 directamente, así que el cookie banner es opcional (se acepta si aparece, no bloquea si no).

### Bloqueo

No detectado en captura V1. Si llegara a bloquear:
- HTML probablemente con título 4xx/5xx o "verificar humano".
- Fallback: `web-unlocker` (queda fuera de V1).

---

## Idealista — **Fase 2.c**

> **Estado de captura:** **HTML real capturado el 6/05/2026** vía Bright Data Web Unlocker (zone `web_unlocker1`, country=es). 4 fixtures listado + 1 fixture de bloqueo DataDome real (capturado con `curl -A "curl/8.0"` para forzar el 403). Tamaños observados: ~370 KB por página de listado, 773 bytes para el bloqueo. Ver `workers/market-worker/src/portals/idealista/__tests__/fixtures/`.
>
> Para recapturar:
>
> ```bash
> npx tsx scripts/capture-portal-html.ts --portal idealista --city cordoba \
>   --via-web-unlocker --zone web_unlocker1 --country es \
>   --listing-pages 1 --detail-limit 0 --allow-unverified-robots \
>   --seed-url "https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/"
> ```

### Estrategia anti-bot

Decidida en `decisiones.md §11.3`. Resumen:

```
webUnlocker (zone web_unlocker_market, premium domain ON,
             custom-headers/cookies OFF, country=es)
  └─ on block (HTTP 401/403/429 o body con "uso indebido"/"datadome"/captcha)
     residentialProxy (Playwright + warm-session-cookies de Bright Data CDP)
       └─ on block
          circuit breaker → OPEN 10 min (3 fallos consecutivos)
```

> **Validación operativa (06/05/2026)**: la zone existente `web_unlocker1` (no premium dedicada todavía) atravesó DataDome con éxito en las 4 capturas de calibración. **Antes de producción** hay que crear `web_unlocker_market` con Premium Domain ON dedicada.

CDP **no** se usa como path primario contra URLs de listado — DataDome rechaza el handshake (evidencia `docs/statefox-image-cache.md` y `docs/junta-resumen-solucion-imagenes-statefox.md`). Solo se usa para calentar cookies en home antes del fallback residencial.

### URL de listado (verificado en captura real)

```
https://www.idealista.com/venta-viviendas/<ciudad>-<provincia>/                — pág. 1
https://www.idealista.com/venta-viviendas/<ciudad>-<provincia>/pagina-<N>.htm  — pág. N (N>=2)
```

Para Córdoba ciudad/provincia: `cordoba-cordoba`. Verificado: el meta description de la página 1 dice "2.126 anuncios de pisos y apartamentos en Córdoba" → ≈ 71 páginas a 30 cards/página.

Seeds confirmados:

```
https://www.idealista.com/venta-viviendas/cordoba-cordoba/                     370 KB, 30 cards
https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/           370 KB, 30 cards
https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-precio-hasta_300000/  360 KB, 30 cards
https://www.idealista.com/venta-viviendas/cordoba-cordoba/con-pisos/pagina-3.htm    361 KB, 30 cards (paginación OK)
```

### URL de ficha (verificado)

```
/inmueble/<ID>/
```

`<ID>` son **9 dígitos** (ej. `111192450`, `109756579`, observados en captura). El formato `\d{6,}` cubre IDs históricos.

### Anatomía real de una card (capturada 06/05/2026)

Cada card es un `<article class="item ...">` con `data-element-id="<ID>"` y `data-online-booking="true|false"`. El ID en el atributo coincide siempre con el ID del href de `item-link`.

```html
<article class="item   item_contains_branding ..." data-element-id="111192450" data-online-booking="false">
  <picture class="item-multimedia">
    <picture>
      <img src="https://img4.idealista.com/blur/480_360_mq/0/id.pro.es.image.master/74/01/39/1384609493.jpg"
           alt="Primera foto del inmueble">
    </picture>
  </picture>
  <div class="item-info-container">
    <picture class="logo-branding">
      <a href='/pro/idealista-inmolike-1608547856682/' title="Inmolike"><img alt="Inmolike"></a>
    </picture>
    <a href="/inmueble/111192450/" role="heading" aria-level="2" class="item-link "
       title="Piso en Avenida de los Almogávares, Valdeolleros - Zumbacón - Camping, Córdoba">
      Piso en Avenida de los Almogávares, Valdeolleros - Zumbacón - Camping, Córdoba
    </a>
    <div class="price-row">
      <span class="item-price h2-simulated">155.000<span class="txt-big">€</span></span>
    </div>
    <div class="item-detail-char ">
      <span class="item-detail">2 hab.</span>
      <span class="item-detail">71 m²</span>
      <span class="item-detail">Planta 1ª exterior sin ascensor</span>
    </div>
    <div class="item-description description">
      <p class="ellipsis">Piso en la misma avenida Almogávares...</p>
    </div>
    <div class="item-toolbar item-toolbar--with-border">…</div>
  </div>
</article>
```

### Selectores y campos extraídos (contrato observado)

| Campo            | Selector / fuente                                                        | Notas |
|------------------|--------------------------------------------------------------------------|-------|
| `externalId`     | `<article data-element-id="<ID>">`                                       | **Más estable** que el href; presente en cada card. Verificado coincide con `/inmueble/<ID>/`. |
| `canonicalUrl`   | `<a class="item-link" href="/inmueble/<ID>/">`                           | Canonicalizar con `canonicalizeIdealistaUrl` (drop `utm_*`, `ordenado-por`, `adId`). |
| `title`          | atributo `title` de `<a class="item-link">`                              | Más limpio que `textContent`. Patrón: `<tipo> en <calle>, <zona1> - <zona2>, <ciudad>`. |
| `priceRaw`       | `<span class="item-price ...">155.000<span class="txt-big">€</span></span>` | Extraer texto sin tags y matchear `(\d{1,3}(?:\.\d{3})+\|\d{4,9})\s*€`. |
| `surfaceRaw`     | spans `<span class="item-detail">XX m²</span>` dentro de `.item-detail-char` | regex `(\d{1,4})\s*m²`. |
| `roomsRaw`       | spans `<span class="item-detail">N hab.</span>`                          | regex `(\d{1,2})\s*hab\.?`. |
| `floor`          | spans `<span class="item-detail">Planta Xª ... \| Bajo \| Ático ...</span>` | Texto narrativo (planta + ascensor + orientación). |
| `bathroomsRaw`   | en algunas cards aparece como `<span class="item-detail">N baños</span>` | No siempre presente en card de listado (suele estar solo en detalle). |
| `agencyName`     | `<picture class="logo-branding"><a title="<NAME>">` o `<picture class="logo-branding"><a><img alt="<NAME>">` | Si la card no tiene `logo-branding`, es de particular. |
| `mainImageUrl`   | `<picture class="item-multimedia"> ... <img src="https://img4.idealista.com/blur/.../IMG.jpg">` | El primer img dentro de la primera picture. |
| `description`    | `<div class="item-description"><p class="ellipsis">...</p></div>`        | Truncada con `…`. Útil para `rawText`/quality. |
| `zoneRaw`        | partir el `title` por `,` y tomar el penúltimo segmento                   | Ejemplo: "Piso en Avenida X, **Zumbacón**, Córdoba" → `Zumbacón`. |

### Datos estructurados (JSON-LD)

**No hay JSON-LD por anuncio** (verificado: 0 ocurrencias de `@type` o `@context` en la página de listado real). El parser **debe** ser DOM-only.

### Marcadores de bloqueo (capturados 06/05/2026 con curl naive)

Cuando DataDome bloquea, Idealista devuelve:

- **HTTP 403** + headers `Server: DataDome` + `X-DataDome: protected` + `X-DataDome-CID: ...`
- Body de **773 bytes** (vs ≈ 370 KB de página normal) con:

```html
<html lang="es"><head><title>idealista.com</title>…</head>
<body><p id="cmsg">Please enable JS and disable any ad blocker</p>
<script data-cfasync="false">var dd={'rt':'c','cid':'AHrlqAAAA…','hsh':'AC81…','t':'bv','host':'geo.captcha-delivery.com',…}</script>
<script data-cfasync="false" src="https://ct.captcha-delivery.com/c.js"></script>
</body></html>
```

`lib/scraping/web-unlocker/client.ts` clasifica esto como `blocked=true, blockedReason="datadome"`. El chain del Worker cae al fallback residencial sin parsear el HTML.

> **Importante**: Idealista carga `dd.idealista.com/tags.js` y `window.ddjskey` en **TODA** página normal como defensa pasiva — no son señal de bloqueo. La heurística distingue:
> - **Página normal**: ≥ 200 KB con `<title>Pisos … en Córdoba</title>` y N anuncios.
> - **Página bloqueada**: < 30 KB, `<title>idealista.com</title>` plano, mensaje "Please enable JS", script `ct.captcha-delivery.com/c.js` o `geo.captcha-delivery.com/captcha/`.

### Robots.txt

Idealista publica `/robots.txt` con reglas restrictivas para `User-agent: *`. Para captura de calibración puntual, ejecutar con `--allow-unverified-robots`. **En producción**, el Worker respeta `robots.txt` salvo cuando `IDEALISTA_RESPECT_ROBOTS=false` (variable de entorno explícita). Decisión: para Fase 2.c **respetar robots por defecto**; el `--allow` solo aplica al script de captura (no al runtime).

### Coste estimado

`decisiones.md §6.1`: ~43 USD/mes para los 3 seeds × 5 páginas × cadencia 120 min, asumiendo Web Unlocker resuelve >95% de las requests (residencial es ~10x más caro). Con Premium Domain ON, ~0.001 USD por request resuelta.

**Coste real observado en calibración**: 4 capturas exitosas, ~$0.005 según dashboard Bright Data (validar al final del mes).

---

## Milanuncios — **fuera de MVP**

### Estado de captura

**Bloqueado por PerimeterX / HUMAN Security desde el entorno de desarrollo, incluso con stealth:**

- `GET /robots.txt` → HTTP 405 ("Method Not Allowed", típico de PerimeterX).
- `GET /inmuebles/comprar-casas-cordoba.htm` con `direct-browser` plano → HTTP 405 con HTML "Pardon Our Interruption" (~100 KB).
- `GET` con `--stealth` (`playwright-extra` + `puppeteer-extra-plugin-stealth`) y `--headed` → captcha PerimeterX visible y la respuesta sigue siendo HTML de bloqueo (no llega DOM real).

### Decisión: fuera del MVP

Milanuncios queda **fuera del alcance del MVP**. Para reactivarlo se requiere Bright Data Web Unlocker (o equivalente) y replantear el presupuesto V1 (`docs/core-sistema-mercado-decisiones.md` §6.1).

Implicaciones aplicadas en código:

- `lib/market/source-mapping.ts` excluye `milanuncios` de `ACTIVE_PORTALS_V1`.
- `workers/market-worker/src/server.ts` **no registra** extractor para `source_c`. Cualquier llamada al worker para Milanuncios devolverá `extractor not registered`.
- Los crons QStash del MVP **no** despachan jobs para Milanuncios.
- Se conservan: enum `MarketSource.source_c`, mapping en `source-mapping.ts`, defaults en `scripts/test-market-worker-local.ts`, y la rama de Milanuncios en `scripts/capture-portal-html.ts`, para no perder el trabajo cuando se reactive.

### Cuando vuelva a entrar en alcance

Pasos previstos (ver `docs/core-mvp-status.md` → "Roadmap post-MVP"):

1. Implementar chain `webUnlocker → residentialProxy` con Bright Data en `workers/market-worker/src/fetchers/`.
2. Capturar HTML real con `scripts/capture-portal-html.ts --portal milanuncios` ya con la chain activa.
3. Documentar en este archivo: URL real de listado/ficha, JSON-LD si existe, selectores DOM, paginación y marcadores de bloqueo.
4. Crear `workers/market-worker/src/portals/milanuncios/{parser,extractor,content-hash,pagination}.ts` con tests sobre fixture sanitizado.
5. Registrar el extractor en `server.ts` y añadir `milanuncios` a `ACTIVE_PORTALS_V1`.
6. Activar cron QStash y monitorizar circuit breaker dedicado.

### URL conocida (sin verificar)

```
https://www.milanuncios.com/inmuebles/comprar-casas-<ciudad>.htm
https://www.milanuncios.com/inmuebles/comprar-casas-<ciudad>.htm?pagina=<N>
```

---

## Resumen accionable (MVP)

| Portal      | ¿En MVP? | Captura | Estrategia                                                     | Notas |
|-------------|----------|---------|----------------------------------------------------------------|-------|
| Fotocasa    | Sí       | OK pág. 1, 25 cards | DOM scraping + `scrollToBottom` + `hydratedSelector` | Páginas 2+ y detalles requieren Web Unlocker (Roadmap). |
| Pisos.com   | Sí       | OK pág. 1-3 + detalles | JSON-LD `SingleFamilyResidence` + DOM `<div class="ad-preview">` | Parser más limpio. Paginación nativa. |
| Milanuncios | **No**   | Bloqueado PerimeterX / HUMAN | Requiere Bright Data Web Unlocker | Fuera de MVP. |
| Idealista   | **Fase 2.c**  | Selectores derivados de `lib/idealista/listings.ts` (probado en prod). Captura real con Web Unlocker pendiente. | Chain `webUnlocker → residentialProxy + warm-cookies` | Diseño cerrado en `decisiones.md §11`. |

## Cómo recapturar (cuando algo cambie)

```bash
# Fotocasa (si vuelve a funcionar página 2+, bajar el threshold del 403):
npx tsx scripts/capture-portal-html.ts --portal fotocasa --city cordoba --listing-pages 1

# Pisos.com (3 páginas + detalles):
npx tsx scripts/capture-portal-html.ts --portal pisoscom --city cordoba --listing-pages 3 --detail-limit 2

# Idealista (vía Web Unlocker — Fase 2.c):
npx tsx scripts/capture-portal-html.ts --portal idealista --city cordoba \
  --via-web-unlocker --zone web_unlocker_market --country es \
  --listing-pages 3 --detail-limit 0 --allow-unverified-robots

# Milanuncios (cuando entre Bright Data — hoy fuera de MVP):
npx tsx scripts/capture-portal-html.ts --portal milanuncios --city cordoba --listing-pages 3 --detail-limit 2 --stealth --headed
```

Las capturas se guardan en `data/captures/<portal>/<YYYYMMDD-HHMMSS>/` (excluido del repo). Los fixtures sanitizados van a `workers/market-worker/src/portals/<portal>/__tests__/fixtures/`.

---

## Detalle interactivo: click "Ver teléfono" + ficha completa

A partir del 7 de mayo de 2026, el worker hace un fetch interactivo del detalle por portal: abre la página, clickea el botón "Ver teléfono" y extrae teléfono, descripción completa, todas las URLs de fotos, referencia del anuncio y referencia catastral cuando exista.

Para identificar selectores y endpoints AJAX en cada portal hay una herramienta de calibración:

```bash
# Idealista
$env:PORTAL="idealista"; $env:DETAIL_URL="https://www.idealista.com/inmueble/<ID>/"; npm run market:calibrate-detail

# Fotocasa
$env:PORTAL="fotocasa"; $env:DETAIL_URL="https://www.fotocasa.es/es/comprar/vivienda/.../<ID>/d"; npm run market:calibrate-detail

# Pisos.com
$env:PORTAL="pisoscom"; $env:DETAIL_URL="https://www.pisos.com/comprar/<slug>-<ID>/"; npm run market:calibrate-detail
```

La herramienta guarda en `workers/market-worker/src/portals/<portal>/__tests__/fixtures/detail/`:
- `before.html`: HTML inicial sin click.
- `after.html`: HTML tras click "Ver teléfono".
- `network.har.json`: todas las requests (incluye AJAX del teléfono cuando aplica).
- `summary.json`: resumen con selector que hizo match y endpoints candidatos a phone-AJAX.

Los selectores candidatos viven en [scripts/calibrate-portal-detail.ts](../scripts/calibrate-portal-detail.ts) en la constante `PORTALS`. Cuando un portal cambia su HTML, se recalibra y se actualizan los selectores en el `detail.ts` del portal correspondiente.

### Campos a extraer en cada ficha

| Campo               | Mecanismo                                                   |
|---------------------|-------------------------------------------------------------|
| `phones`            | Texto del nodo donde aparece el número tras click + AJAX response. |
| `description`       | Selector del bloque de descripción (no la versión truncada del listado). |
| `imageUrls`         | URLs `<img src>` o JSON inline del carrusel. Solo URLs originales del portal — no descargamos a Cloudinary. |
| `listingReference`  | Código interno del anunciante (ej. `VES250414SM` en Idealista). Visible en la ficha como "Referencia del anuncio". |
| `cadastralRef`      | Referencia catastral oficial española, 20 chars `[A-Z0-9]`. Solo cuando el anunciante la incluye en la descripción/metadatos. Opcional. |
| `advertiserName`    | Nombre del anunciante (particular o agencia). |
| `advertiserType`    | "particular" / "agency". |

---

## Selectores verificados por portal (calibración del 7/05/2026)

> **Origen:** capturas reales en `data/captures/<portal>/20260507-130407/` (Pisos.com),
> `data/captures/idealista/20260507-013156-unlocker/` (Idealista) y
> `data/captures/fotocasa/20260507-130524/` (Fotocasa). Fixtures sanitizados
> en `workers/market-worker/src/portals/<portal>/__tests__/fixtures/detail/`.
> Validación: `npx vitest run lib/workers/market-worker/__tests__/detail.test.ts`
> (22 tests, 100% passing al 7/05/2026).

### Pisos.com (`source_b`) — detalle interactivo

**Tamaño esperado:** 270–310 KB. **Bloqueo no observado.**

#### ⚠️ Distinción crítica del teléfono

Pisos.com renderiza **dos números distintos** en cada ficha:

- `<div class="callBtn" ... data-number="857681132" data-is-incotel="True">` — **proxy de Incotel**, no es el del anunciante. **NUNCA** extraer este número.
- `<span id="vtmExtraVars" data-var='{"telefono":"957043876", ...}'>` — **número REAL** del anunciante. Esta es la única fuente fiable.

El parser actual extrae **únicamente** `vtmExtraVars.telefono` y descarta cualquier otro número.

#### Selectores

| Campo | Fuente |
|-------|--------|
| `phones` | `<span id="vtmExtraVars" data-var="..."`> → JSON `.telefono`. |
| `description` | `<div class="description__content">...</div>`. Contiene `<br>` que se traducen a `\n`. La versión truncada del meta tag (`<meta name="description">`) acaba con `…` y NO debe usarse. |
| `advertiserName` | `<p class="owner-info__name"><a>NOMBRE</a></p>`. |
| `advertiserType` | `<span id="vtmVars" data-var="..."`> → JSON `.tipoVendedor` (`"profesional"` → `agency`, `"particular"` → `particular`). |
| `listingReference` | Bloque `features__feature` con icono `icon-reference`: `<span class="features__icon icon-reference"></span> ... <span class="features__value">DN02713/2799</span>`. |
| `imageUrls` | Combinación de: 1) `<link rel="preload" as="image" href="https://fotos.imghs.net/...">` en `<head>` (primeras 5 fotos), 2) `<img src="...imghs.net/...">` del carrusel `.carousel__main-photo`, 3) `data-bg="...imghs.net/..."` (lazy backgrounds). El total se muestra en `<span class="media-types-menu__number">N</span>`. |

#### Variantes de tamaño de imagen

Las URLs siguen el patrón `https://fotos.imghs.net/<size>-wp/<advertiser-id>/<id>/<filename>.jpg`. Resolución por prefijo (de mejor a peor): `xl-wp` → `apps-wp` → `appswm-wp` → `fch-wp` → `fchm-wp`. El parser dedupea por nombre de archivo y queda con la mejor variante disponible.

#### Logos a filtrar

`<img class="owner-info__logo" src=".../prof-wp/logos/Logo_517225_*.jpg">` es el logo de la agencia, NO una foto del inmueble. El parser lo excluye con regex `!/Logo_|\/logos\/|prof-wp\/logos/i`.

### Idealista (`source_d`) — detalle interactivo

**Tamaño esperado:** 200–250 KB. **Capturado vía Bright Data Web Unlocker.**

#### Selectores

| Campo | Fuente |
|-------|--------|
| `idealistaAdId` | JS inline `idForm: { adId: 111192450 }` o `name="adId" value="..."`. |
| `idealistaPhonesPath` | JS inline `urlAdContactPhones: '/es/ajax/ads/{adId}/contact-phones'`. |
| `phones` | **Pre-click siempre vacío** (Idealista oculta los teléfonos hasta que el usuario clickea "Ver teléfono"). Post-click: `<a class="phone-number ..." href="tel:NNN">`, `<a class="hidden-contact-phones_formatted-phone ..." href="tel:NNN">`, `<span class="hidden-contact-phones_text">NNN</span>` o JSON `formattedPhoneNumber`/`phoneNumber`. |
| `advertiserName` | JS inline `adCommercialName: "Inmolike"` (o `adProfessionalName`/`adFirstName` como fallback). |
| `advertiserType` | `agency` cuando aparece `adProfessionalName: "..."`, `<div class="professional-name">` o `<input name="professional">`. |
| `description` | `<div class="comment"><div class="adCommentsLanguage expandable..."><p>...</p></div></div>`. La versión `<div class="shortAdDescription">` está truncada. |
| `listingReference` | JS inline `adExternalReference: "KSV-AS-041"` (más estable) o `<p class="txt-ref">KSV-AS-041</p>`. |
| `imageUrls` | JS inline `multimediaCarrousel: { multimedias: [{content:[{src:"https://img4.idealista.com/blur/WEB_DETAIL-M-L/...jpg"}]}]}`. El parser prefiere `WEB_DETAIL-M-L` sobre `WEB_DETAIL_TOP-L-L`. |

#### ⚠️ Teléfonos institucionales a NO confundir

El HTML de Idealista contiene `<a class="phone" href="tel://900423525">` (atención al cliente) y `tel://917014030` (verificación) en el footer/banner. **NUNCA** son del anunciante. El parser distingue por clase CSS: solo extrae `phone-number`, `item-clickable-phone`, `hidden-contact-phones_formatted-phone` (todas exclusivas del anunciante).

#### ⚠️ Templates Mustache

`<a href="tel:{{=phoneNumber}}">` aparece en el HTML como template Handlebars/Mustache. El parser filtra cualquier valor que contenga `{{` para no devolver el placeholder como teléfono.

### Fotocasa (`source_a`) — detalle vía Bright Data (chain residencial)

**Estado:** detalle desbloqueable mediante chain Bright Data `webUnlocker → fotocasa-residential` (mayo 2026). Activación condicional vía `MARKET_FOTOCASA_USE_BRIGHTDATA=true`. Si flag false (default), Fotocasa sigue usando direct-browser y el detalle queda bloqueado por PerimeterX.

#### Pre-requisito: zona Web Unlocker dedicada

La zona Web Unlocker que se usa con Idealista (`web_unlocker1` por defecto) tiene configurado `expect_element=".re-SharedTopbar"`, un selector que NO existe en Fotocasa: la API devuelve HTTP 502 con `x-brd-error: waiting for selector ".re-SharedTopbar" failed`.

**Acción manual una sola vez** en https://brightdata.com/cp/zones:

1. Crear nueva zona Web Unlocker llamada `web_unlocker_fotocasa` (o el nombre que prefieras).
2. **NO** configurar `expect_element` (dejarlo vacío). Bright Data devuelve el HTML cuando la página se haya cargado completamente.
3. Habilitar `fotocasa.es` como **premium domain** si el plan lo requiere.
4. Definir `BRIGHTDATA_FOTOCASA_WEB_UNLOCKER_ZONE=web_unlocker_fotocasa` en el `.env` del Worker (Railway).

#### Marcador de bloqueo (cuando se cae a direct-browser o el chain falla)

```html
<title>SENTIMOS LA INTERRUPCIÓN</title>
```

El parser expone `isFotocasaBlocked(html)` que detecta:
- `html.length < 60_000` Y
- `<title>SENTIMOS LA INTERRUPCI...` o `Pardon Our Interruption` en el body.

Cuando se detecta bloqueo, el parser devuelve `ParsedDetail` vacío para que el handler distinga "ficha bloqueada" de "ficha cargada pero sin datos extraíbles".

#### Selectores del parser (`parseFotocasaDetail`)

Fotocasa renderiza con Next.js: el SSR completo vive en `<script id="__NEXT_DATA__" type="application/json">{...}</script>`. Es la fuente PREFERIDA cuando está presente:

| Campo | Fuente preferida (`__NEXT_DATA__`) | Fallback DOM |
|-------|------------------------------------|--------------|
| `description` | `realEstate.description` | `<div class="re-DetailDescription">...</div>` |
| `phones` | `contactInfo.phone` / `contactInfo.phones[].formattedPhoneNumber` | `<a class="re-ContactDetail-phoneButton" href="tel:...">` o `<a data-testid="phone..." href="tel:...">` post-click |
| `advertiserName` | `contactInfo.agencyName` / `clientName` | `<a class="re-ContactDetail-agencyName">` |
| `advertiserType` | `isAgency: true/false` o `clientTypeId: 1/2` | Texto "profesional" / "particular" en body |
| `listingReference` | `realEstate.clientCode` / `reference` | `<span data-test="reference">...</span>` o "Referencia: ..." en `re-DetailFeatures` |
| `imageUrls` | `realEstate.multimedias[].url` | `<img src="https://img.fotocasa.es/...">`, `<img data-src="...">`, `<link rel="preload" as="image">` |
| `cadastralRef` | (se busca en la descripción con regex 20 chars) | idem |

**Nota**: hasta el 7/05/2026 NO se ha podido capturar HTML real de detalle de Fotocasa por el bloqueo PerimeterX. Los selectores DOM no `__NEXT_DATA__` están basados en patrones conocidos de la librería react-cms de Adevinta pero **sin verificar contra HTML real**. Cuando se desbloquee la captura (zona Bright Data dedicada operativa), recapturar con:

```bash
npx tsx scripts/capture-portal-html.ts --portal fotocasa --city cordoba \
  --via-web-unlocker --zone web_unlocker_fotocasa --country es \
  --listing-pages 1 --detail-limit 2 --allow-unverified-robots
```

y reemplazar los fixtures sintéticos en `workers/market-worker/src/portals/fotocasa/__tests__/fixtures/detail/detail-{agency,particular}-synth-*.html` por capturas reales sanitizadas.

#### Capture interactivo (`captureFotocasaDetail`)

El callback que el runtime invoca cuando hay `Page` Playwright (modo Bright Data residential):

1. Acepta cookie banner (Didomi: `#didomi-notice-agree-button`).
2. Expande descripción truncada si aplica.
3. Pre-arranca `page.waitForResponse` para detectar XHR de teléfono (`/api/realestates/.../phone`).
4. Click en "Ver teléfono" (intenta varios selectores: `[data-testid='see-phone']`, `[data-testid='reveal-phone']`, `.re-ContactDetail-phoneButton`, etc.).
5. Espera `networkidle` + 800ms para que el DOM se rehidrate.
6. Re-lee HTML y delega a `parseFotocasaDetail`.
7. Si el AJAX trajo teléfono que el DOM no refleja, lo añade como fallback al `phones` del result.

---

## Tabla de capacidades por portal (post-calibración 7/05/2026)

| Campo                | Pisos.com  | Idealista (post-click) | Fotocasa (detail con Bright Data) |
|----------------------|:----------:|:----------------------:|:--------------------------------:|
| `phones` (real)      | ✅ JSON    | ✅ post-click + AJAX   | ✅ __NEXT_DATA__ + click (cuando flag activo) |
| `description` completa | ✅       | ✅                     | ✅ __NEXT_DATA__.realEstate.description |
| `imageUrls` (todas)  | ✅ ~50 fotos | ✅ multimediaCarrousel | ✅ __NEXT_DATA__.multimedias[]   |
| `listingReference`   | ✅ DN.../  | ✅ adExternalReference | ✅ __NEXT_DATA__.clientCode      |
| `advertiserName`     | ✅         | ✅ adCommercialName    | ✅ contactInfo.agencyName        |
| `advertiserType`     | ✅ vtmVars | ✅ adProfessionalName  | ✅ contactInfo.isAgency          |
| `cadastralRef`       | regex en description | regex en description | regex en description     |
| **Cobertura objetivo** | **100%** | **70%+** (con click)   | **70%+** (con click + Bright Data) |

> **Coste mensual estimado** (escenario Córdoba, cadencia 120 min, 5 páginas/seed):
> - Idealista: ~$9.45/mes (Web Unlocker + 5% fallback residencial).
> - Fotocasa con Bright Data: ~$3.55/mes (Web Unlocker + 5% fallback residencial).
> - Pisos.com: $0 (direct-browser).
> - **TOTAL Bright Data: ~$13/mes**.
