# Deprecación controlada de Statefox como fuente de pricing/microsites

## Contexto

Statefox es un servicio externo SaaS que provee inventario inmobiliario via API REST. Lo usamos hoy como fuente de:

- **Comparables de pricing** (`lib/pricing/fetch-comparables.ts` consume `GET /snapshot`).
- **Búsqueda de propiedades para microsites** (`lib/microsite/selection.ts` consume `searchSnapshotForDemand`).
- **Cache de imágenes** (`lib/statefox/image-cache/` extrae imágenes vigentes con Bright Data y las sube a Cloudinary; las URLs originales caducan rápido en Idealista).

Con el módulo Market in-house (`lib/market/*`) ya capturando inventario directamente desde portales (Idealista, Fotocasa, Pisos.com), tenemos una fuente propia más rica, sin coste por request y sin dependencia de un proveedor externo. La migración se hace por feature flag para no romper producción.

## Estado actual

| Pieza | Estado | Notas |
| --- | --- | --- |
| `lib/market/comparables.ts` (`fetchMarketComparables`) | Listo | Mismo shape que el adapter Statefox. |
| `lib/market/search.ts` (`searchMarketForDemand`) | Listo | Construye `StatefoxSnapshotProperty`-like desde `MarketListing` para no tocar microsite/selection.ts. |
| `lib/pricing/fetch-comparables.ts` | Adaptado | Usa `MARKET_PRICING_SOURCE` flag. Fallback explícito a Statefox si MarketListing devuelve 0. |
| `lib/microsite/selection.ts` | Adaptado | Mismo flag y fallback. |
| `MarketListingImage` (modelo Prisma) | Listo | Migración `20260513121500_add_market_listing_image`. |
| Image cache lazy real (`MARKET_IMAGE_IMPORT` job) | **Listo (v1)** | Se encola `MARKET_IMPORT_LISTING_IMAGES` y el consumer importa a Cloudinary desde `market_listings.imageUrls` persistiendo en `market_listing_images`. Política por portal configurable (`MARKET_IMAGE_IMPORT_PORTALS`, default `idealista`). |

## Decisiones operativas

### Estrategia de migración: feature flag por entorno (camino c)

`MARKET_PRICING_SOURCE` controla la fuente:

- `marketlisting`: lee primero de MarketListing. Si devuelve 0 comparables (ciudad sin seeds, p. ej. Sevilla en V1), cae a Statefox automáticamente. Loguea el fallback para detectar regresiones de cobertura.
- `statefox` (default): comportamiento legacy. Sin riesgo.

### Cobertura

V1: solo **Córdoba sale** tiene seeds activos en MarketListing (`scripts/seed-market-cordoba.ts`). Cualquier otra ciudad o `rent` cae automáticamente a Statefox por el fallback. Para activar el flag globalmente sin perder cobertura hay que sembrar antes el resto de ciudades en `MarketSeed`.

### Image cache

El worker de `MARKET_IMAGE_IMPORT` ya está activo en el consumer y los comparables de MarketListing:

- sirven URLs originales del portal por defecto,
- marcan `imageCacheStatus: "PENDING"` y encolan lazy import para portales sensibles (default `idealista`),
- usan Cloudinary cuando ya existe cache importado.

Esto es aceptable para Fotocasa y Pisos.com (sus URLs suelen ser más persistentes). Para Idealista, el import lazy queda habilitado por defecto para evitar 403 por caducidad de URLs.

### Telemetría sugerida

- Conteo diario de fallbacks `marketlisting → statefox` por ciudad. Si una ciudad cae siempre a Statefox, hay un gap en seeds.
- Conteo diario de comparables servidos por source. Cuando MarketListing supere a Statefox sostenidamente para Córdoba, se puede subir el flag a producción.

## Plan de cierre

1. Sembrar multi-ciudad en `MarketSeed` (Sevilla, Madrid o el alcance V2 acordado).
2. Validar 7 días con `MARKET_PRICING_SOURCE=marketlisting` en producción midiendo:
   - Tasa de fallback < 5% por ciudad.
   - Cobertura imágenes Cloudinary > 80% comparables.
   - Sin regresiones en `PricingReport.semaforo` ni en SLA de microsite.
3. Apagar el cron `/api/cron/statefox/image-cache/*` para esa ciudad.
4. Marcar Statefox como removido en futuras releases (no eliminar todavía: la API sigue siendo útil como verificación cruzada y para ciudades sin seeds).

## Endpoints / archivos `@deprecated`

- `lib/statefox/snapshot-search.ts` (función `searchSnapshotForDemand`).
- `lib/statefox/client.ts` (función `getSnapshot`).
- `lib/statefox/image-cache/select.ts` (función `hydrateComparablesWithImageCache`).

Estas seguirán funcionando indefinidamente como fallback. La etiqueta `@deprecated` solo aparece en el JSDoc para que IDEs avisen a nuevos consumidores.
