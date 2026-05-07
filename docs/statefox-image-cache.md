# Statefox Image Cache (M6/M7)

Pipeline server-side para recuperar imágenes desde el `pLink` del portal original
de un comparable Statefox y servirlas desde Cloudinary, sustituyendo las URLs
`pImages` que la API entrega ya firmadas y caducan en pocas horas.

## Por qué existe

Statefox `/snapshot` devuelve `pImages` como URLs firmadas (`Expires`,
`Signature`, `Key-Pair-Id`). En la práctica el grueso llega vencido y los CDNs
del portal devuelven 403/text-xml en vez de la imagen. Esperar a regenerar URLs
no es viable: necesitamos un asset propio, estable y cacheable.

## Arquitectura

```
Statefox /snapshot ──► Comparable con pLink
                            │
                            ▼
              ┌────────────────────────────────┐
              │ hydrateComparablesWithImageCache │
              │  · Lee Neon → cachedUrls         │
              │  · Si hay cache → Cloudinary     │
              │  · Si no:                        │
              │     1) warm import en caliente   │
              │     2) encolar job               │
              └────────────────────────────────┘
                            │
                            ▼
        IMPORT_STATEFOX_PORTAL_IMAGES (consumer)
                            │
                            ▼
   discoverPortalImages() — varios paths según portal
       │
       ├─ Idealista (recomendado): Bright Data Web Unlocker (REST)
       │  · POST https://api.brightdata.com/request
       │  · Devuelve HTML ya desbloqueado (DataDome resuelto)
       │  · Sin Playwright, sin warm session, sin browser
       │
       ├─ Idealista (alternativa): warm session DataDome (CDP) + residencial
       │  · PortalWarmSession guarda cookies/userAgent
       │  · politeNavigate simula home → scroll → anuncio
                            │
                            ▼
  downloadPortalImage()  — Referer/User-Agent/cookies del portal
                            │
                            ▼
  uploadStatefoxImageToCloudinary() — public_id determinista
                            │
                            ▼
            statefox_comparable_images (Neon)
```

## Modelo de datos

`prisma/schema.prisma → StatefoxComparableImage` (tabla
`statefox_comparable_images`).

| Campo | Tipo | Notas |
|-------|------|-------|
| `source` | `StatefoxPortalSource` | `idealista`, `fotocasa`, `pisoscom`, `habitaclia`, `unknown` |
| `statefoxId` | `String` | `_id` del comparable Statefox |
| `portalUrl` | `String` | `pLink` normalizado |
| `imageIndex` | `Int` | Orden estable. `0` se usa también para registrar estados terminales |
| `originalImageUrl` | `String?` | URL del portal antes de subir |
| `originalImageSha256` | `String?` | Hash de bytes para deduplicar |
| `cloudinarySecureUrl` | `String?` | URL servida a la UI |
| `status` | `StatefoxImageCacheStatus` | `PENDING`, `IMPORTED`, `FAILED`, `BLOCKED`, `CAPTCHA`, `LISTING_REMOVED`, `NO_IMAGES_FOUND` |

Clave única: `(source, statefoxId, imageIndex)`. Idempotencia del job:
`statefox-image-import:{source}:{statefoxId}`.

`PortalWarmSession` (tabla `portal_warm_sessions`) persiste cookies de confianza
obtenidas con Bright Data Scraping Browser para reutilizarlas en Chromium local
con proxy residencial:

| Campo | Tipo | Notas |
|-------|------|-------|
| `source` | `StatefoxPortalSource` | Portal al que aplica la cookie |
| `cookieHeader` | `String` | Header `Cookie` serializado (`datadome=...; ...`) |
| `userAgent` | `String` | UA observado en el navegador CDP que resolvió el reto |
| `proxySession` | `String?` | Sesión sticky residencial usada/esperada |
| `status` | `PortalWarmSessionStatus` | `ACTIVE`, `EXPIRED`, `EXHAUSTED`, `INVALIDATED` |
| `requestCount` / `maxRequests` | `Int` | Límite de reutilización antes de agotar la cookie |
| `expiresAt` | `DateTime` | TTL conservador para evitar cookies viejas |

## Estados terminales

| Status | Reintenta automáticamente | Acción operativa |
|--------|---------------------------|------------------|
| `IMPORTED` | No | Nada |
| `FAILED` | Sí (backoff de la cola) | Esperar; si persiste, revisar logs |
| `BLOCKED` | No | Cambiar `IDEALISTA_STORAGE_STATE`/proxy y re-encolar manualmente |
| `CAPTCHA` | No | Igual que `BLOCKED` |
| `LISTING_REMOVED` | No | El anuncio ya no existe |
| `NO_IMAGES_FOUND` | No | El portal no expuso imágenes (revisar manualmente) |

Un `IMPORTED` o un terminal **bloquea** futuros enqueues (vía
`hasTerminalImageImportState`). Para reintentar, basta con borrar/limpiar la
fila correspondiente o ejecutar el script con `--upload`.

## Mitigación antibots

- **Bright Data Web Unlocker (recomendado para Idealista)**: si
  `BRIGHTDATA_WEB_UNLOCKER_ZONE` y `BRIGHTDATA_API_TOKEN` están definidos y
  `BRIGHTDATA_WEB_UNLOCKER_ENABLED` no está apagado, el extractor de Idealista
  hace una sola request `POST https://api.brightdata.com/request` y recibe el
  HTML ya desbloqueado. Se bypaséa Playwright entero. Es el path por defecto
  cuando la zona y el token están configurados, porque:
  - Bright Data Browser API por CDP sigue devolviendo 403 contra Idealista
    incluso con dominios premium activos (DataDome bloquea el handshake antes
    de que el unblocking interactivo aplique).
  - Web Unlocker está específicamente diseñado para portales DataDome y se
    factura solo por éxito (~$1.5/1000 requests, premium para `idealista.com`).
  - Para nuestro volumen (250 comparables × ~4 snapshots/día) sale entre $30 y
    $60/mes vs varios cientos por GB con Browser API.
  - Crear la zona en https://brightdata.com/cp/zones → "Add API" →
    "Web Unlocker API". Copiar el `zone name` (ej. `web_unlocker1`) y el API
    key generado.
- **Bright Data Scraping Browser**: si `BRIGHTDATA_SCRAPING_BROWSER_URL` está
  definida, `lib/scraping/browser.ts` conecta Playwright por CDP
  (`chromium.connectOverCDP`). Bright Data gestiona fingerprint, IP residencial,
  stealth y CAPTCHA solving (`Captcha.waitForSolve`).
- **CDP directo para Idealista (default cuando hay CDP)**: con
  `STATEFOX_IDEALISTA_DIRECT_CDP_ENABLED=true` (default si hay CDP), Idealista
  abre el listing directamente con Bright Data CDP, sin warm session ni
  navegación humana extra. Es lo más fiable contra DataDome y no depende de la
  tabla `portal_warm_sessions`. Pon `false` para usar el flujo híbrido warm
  session + residencial. **Importante**: en este modo, el `goto` usa
  `waitUntil: "domcontentloaded"` con timeout de al menos 120 s siguiendo la
  recomendación oficial de Bright Data, porque su backend puede tardar segundos
  o minutos en completar el unlocking. Idealista suele facturarse como dominio
  premium (`~$8/CPM` o más, ver dashboard).
- **Bright Data Residential Proxy**: si Bright Data entrega un comando HTTP tipo
  `curl --proxy brd.superproxy.io:33335 --proxy-user ...` en vez de URL `wss://`,
  Playwright local lo usa como proxy residencial con `server`, `username` y
  `password` separados. Puede añadir una sesión sticky al username para mantener
  la misma IP durante la navegación. Esto evita la IP local, pero no activa el
  helper CDP de CAPTCHA.
- **Warm session DataDome**: para Idealista, antes de usar el residencial se busca
  una `PortalWarmSession` activa. Si no existe, se abre Bright Data Scraping
  Browser por CDP, se resuelve CAPTCHA si aplica, se extraen cookies y `userAgent`,
  y luego el extractor residencial reutiliza esas señales. Si aparece 403/429,
  CAPTCHA o texto de bloqueo, la sesión se invalida y el siguiente job fuerza
  re-warm.
- **Comportamiento humano**: `ghost-cursor` genera trayectorias Bézier y scroll
  parcial. Idealista no va directo al anuncio: entra por home, espera DOM,
  desplaza parcialmente y luego navega al listing.
- **Sesión persistente**: `IDEALISTA_STORAGE_STATE` reutiliza la sesión exportada
  por `npm run scrape:idealista`. Sin sesión, Idealista bloquea con 403.
- **Cadencia humana**: `IDEALISTA_IMAGE_IMPORT_DELAY_MS` introduce pausa fija +
  jitter aleatorio de hasta 750 ms antes de extraer.
- **Detección explícita**: `extract.ts` clasifica el cuerpo de la página y mapea
  CAPTCHA, "uso indebido", "anuncio no disponible" y HTTP 401/403/429 a estados
  terminales.
- **Circuit breaker por portal**: `statefox-image-import:idealista` (y demás).
  Tras 3 fallos consecutivos, el handler abre el circuito por 5 min y devuelve
  retriable, evitando martillear al portal.
- **Proxy opcional**: `IDEALISTA_PROXY_SERVER` (+ user/pass) se aplica también al
  contexto Playwright genérico de Fotocasa/Pisos.com.

## Variables de entorno

Ver `.env.example`:

| Variable | Default | Descripción |
|----------|---------|-------------|
| `STATEFOX_IMAGE_IMPORT_ENABLED` | `true` (prod), `false` (test) | Master switch |
| `STATEFOX_IMAGE_IMPORT_SYNC_ON_FIRST_SEEN` | `true` | Importa una imagen en caliente al ver un comparable nuevo |
| `STATEFOX_IMAGE_IMPORT_SYNC_MAX_COMPARABLES` | `5` | Máximo de comparables nuevos en warm import por ejecución |
| `STATEFOX_IMAGE_IMPORT_MAX_IMAGES` | `12` | Galería completa por comparable (job asíncrono) |
| `STATEFOX_IMAGE_IMPORT_TIMEOUT_MS` | `60000` | Timeout duro Playwright + descarga + Cloudinary |
| `STATEFOX_WARM_SESSION_ENABLED` | `true` | Activa warm sessions DataDome para Idealista |
| `STATEFOX_WARM_SESSION_REQUIRE_CDP` | `true` | Si no hay CDP ni cookie activa, corta con `BLOCKED` en vez de gastar residencial |
| `STATEFOX_WARM_SESSION_TTL_MS` | `14400000` | TTL de cookie cálida (4h) |
| `STATEFOX_WARM_SESSION_MAX_REQUESTS` | `40` | Reusos máximos por cookie cálida |
| `STATEFOX_HUMAN_BEHAVIOR_ENABLED` | `true` | Activa movimientos/scroll humano con `ghost-cursor` |
| `STATEFOX_WARMUP_NAVIGATION_ENABLED` | `true` | Activa navegación home → anuncio en Idealista (solo modo residencial) |
| `STATEFOX_IDEALISTA_DIRECT_CDP_ENABLED` | `true` si hay CDP | Idealista usa Bright Data CDP directo en vez de warm session + residencial |
| `IDEALISTA_STORAGE_STATE` | — | JSON de sesión Playwright |
| `IDEALISTA_HEADLESS` | `true` | |
| `IDEALISTA_IMAGE_IMPORT_DELAY_MS` | `3000` | Pausa antes de extraer (con jitter) |
| `IDEALISTA_PROXY_SERVER` | — | Proxy opcional para Playwright |
| `BRIGHTDATA_SCRAPING_BROWSER_URL` | — | URL WebSocket `wss://...:9222` de Scraping Browser (CDP) |
| `BRIGHTDATA_RESIDENTIAL_PROXY_URL` | — | Proxy residencial HTTP `http://brd.superproxy.io:33335` |
| `BRIGHTDATA_RESIDENTIAL_PROXY_USERNAME` | — | Usuario Bright Data del proxy residencial |
| `BRIGHTDATA_RESIDENTIAL_PROXY_PASSWORD` | — | Password Bright Data del proxy residencial |
| `BRIGHTDATA_RESIDENTIAL_PROXY_SESSION` | — | Sufijo sticky `-session-...` para mantener la misma IP durante la navegación |
| `BRIGHTDATA_CDP_CONNECT_TIMEOUT_MS` | `120000` | Timeout de conexión CDP |
| `BRIGHTDATA_NETWORKIDLE_TIMEOUT_MS` | `25000` | Espera `networkidle` cuando se usa Bright Data |
| `BRIGHTDATA_CAPTCHA_DETECT_TIMEOUT_MS` | `20000` | Timeout de detección/solución CAPTCHA CDP |
| `BRIGHTDATA_CAPTCHA_SOLVE_ENABLED` | `true` si hay CDP | Activa `Captcha.waitForSolve` |

## Bright Data: coste y elección de producto

Para el volumen esperado del proyecto, el coste más probable es bajo porque la
cache se genera una vez por comparable:

| Escenario | Volumen estimado | Scraping Browser | Residential Proxy |
|-----------|------------------|------------------|-------------------|
| Ramp-up inicial | ~8.000 anuncios / mes | ~65-160 USD si se cobra por CPM premium | ~40 GB x ~8.40 USD = ~336 USD |
| Régimen normal | ~2.000 anuncios / mes | ~16 USD | ~5-8 GB x ~8.40 USD = ~42-67 USD |

La URL `wss://...:9222` de Scraping Browser es preferible contra Idealista porque
incluye evasión y CAPTCHA solving. El proxy HTTP residencial entregado por Bright
Data funciona como salida IP española, pero nuestro navegador sigue siendo
Playwright local y puede requerir retries si DataDome exige desafíos más fuertes.

Con warm session, el coste esperado baja: una resolución CDP por portal cada 4h
o cada 40 anuncios, y el resto de anuncios usa residential proxy. Si Idealista
invalida la cookie antes del TTL, el primer 403/429 marca la sesión como
`INVALIDATED` y la siguiente ejecución vuelve a pasar por CDP.

## Tests

```bash
npx vitest run lib/statefox/image-cache/__tests__
npx vitest run lib/workers/consumer/__tests__/statefox-image-import-handler.test.ts
```

Los tests cubren detección de portal, idempotencia, parser de URLs en JSON
embebido, selección de fotos (Cloudinary primero, `pImages` vigentes como
fallback), warm import con límites y handler con circuit breaker + estados
terminales.

## Script live

```bash
# Dry-run (no toca Cloudinary)
npm run statefox:images:test -- --portal-url https://www.idealista.com/inmueble/12345/

# Upload real (requiere CLOUDINARY_* y DATABASE_URL configurados)
npm run statefox:images:test -- \
  --portal-url https://www.idealista.com/inmueble/12345/ \
  --statefox-id id.es.r.12345 \
  --upload \
  --max-images 3

# Forzar warm session antes del discovery
npm run statefox:images:test -- \
  --portal-url https://www.idealista.com/inmueble/12345/ \
  --warm

# Comparar contra residencial directo e invalidar cookies activas
npm run statefox:images:test -- --source idealista --limit 1 --no-warm
npm run statefox:images:test -- --source idealista --invalidate --warm

# Forzar Bright Data Scraping Browser CDP directo (recomendado para Idealista)
npm run statefox:images:test -- --source idealista --limit 1 --cdp

# Validar el flujo híbrido warm session + residencial aunque haya CDP disponible
npm run statefox:images:test -- --source idealista --limit 1 --no-cdp --warm
```

## Riesgos operativos

- El scraping de portales tiene riesgo legal/operativo. Validar con Statefox y
  con cada portal el alcance de uso (almacenar imágenes derivadas del `pLink`
  puede requerir acuerdo contractual).
- Si Idealista cambia el HTML/CDN, el extractor tendrá que actualizarse.
- Cloudinary cobra por bytes/derivaciones: `STATEFOX_IMAGE_IMPORT_MAX_IMAGES`
  acota el coste por comparable.
