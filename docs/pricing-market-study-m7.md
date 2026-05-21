# Estudio inmobiliario completo M7+

Este documento describe la ampliación del motor de pricing para incluir contexto de zona, demoras estilo Google Maps, baremos estadísticos de precio óptimo y densidad demográfica.

## Qué se implementó

- Persistencia de estudio ampliado en `pricing_reports`:
  - `zoneStudy` (transporte, colegios, tiempos y demografía).
  - `optimalPricing` (min/P25/P50/P75/max + rango recomendado).
- Nuevas tablas de soporte:
  - `demographic_zone_index` (fuente INE por distrito/zona).
  - `zone_poi_index` (POIs de transporte/colegios).
  - `zone_travel_time_index` (tiempos por modo y destino).
- Integración en `runPricingAnalysis` para componer el estudio automáticamente por inmueble.
- Endpoint nuevo `GET /api/pricing/estudio/[code]` para devolver el detalle de estudio por propiedad.
- Extensión de APIs de mercado/listado y UI:
  - `app/api/pricing/mercado/route.ts` incorpora densidad y accesibilidad agregada por zona.
  - `app/api/pricing/properties/route.ts` expone rango de precio óptimo y bucket de densidad.
  - `app/platform/pricing/mercado/page.tsx` añade selector de capa (precio/densidad/accesibilidad).
  - `app/platform/pricing/informe/[code]/page.tsx` añade tarjetas de "Estudio de zona" y "Precio óptimo (baremos)".

## Scripts operativos

- `npm run pricing:import-demographics-ine -- --file=<csv>`
  - Importa/actualiza `demographic_zone_index` desde CSV.
  - Flags: `--dry-run`.
- `npm run pricing:sync-zone-pois -- --city=Cordoba --limit=20`
  - Sincroniza POIs (`transport`, `school`) vía Google Places alrededor de centroides de zona.
  - Flags: `--dry-run`, `--radius`, `--source`.
- `npm run pricing:build-travel-time-index -- --city=Cordoba --city-center=lat,lng`
  - Calcula tiempos por modo (`driving`, `transit`, `walking`) con Google Distance Matrix.
  - Persiste en `zone_travel_time_index`.
  - Flags: `--dry-run`, `--limit`, `--source`.

## Variables de entorno

- `GOOGLE_MAPS_API_KEY` (server-side, recomendado).
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (fallback si no existe la server key).
- `MARKET_CITY_CENTER_COORDS` (opcional; default Córdoba centro en script de travel time).

## Prueba rápida

1. Ejecutar migración nueva de Prisma.
2. Cargar densidad:
   - `npm run pricing:import-demographics-ine -- --file=data/demographics/ine_density.csv`
3. Sincronizar POIs:
   - `npm run pricing:sync-zone-pois -- --city=Cordoba --limit=10`
4. Construir tiempos:
   - `npm run pricing:build-travel-time-index -- --city=Cordoba --limit=10`
5. Reanalizar una propiedad:
   - `POST /api/pricing/analyze/async` con `propertyCode`.
6. Validar outputs:
   - `GET /api/pricing/estudio/{code}`
   - `/platform/pricing/informe/{code}`
   - `/platform/pricing/mercado`
