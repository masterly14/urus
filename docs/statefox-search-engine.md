# Statefox Snapshot Search Engine

## Qué es y para qué sirve

Motor de búsqueda de propiedades sobre el endpoint `GET /snapshot` de Statefox. Reemplaza el uso de `GET /properties` para matching y microsite, que devolvía volumen insuficiente para filtrar en memoria.

**Problema resuelto:** `/properties` devolvía máx ~34 props por source (inventario Córdoba), y el filtrado en memoria por ciudad/precio/metros descartaba casi todo, resultando en 0 matches consistentemente. `/snapshot` expone el inventario completo (~5000+ props en Córdoba) con paginación cursor-based.

## Archivos principales

| Archivo | Rol |
|---------|-----|
| `lib/statefox/snapshot-search.ts` | Motor de búsqueda con paginación, filtrado en memoria y early exit |
| `lib/statefox/query-builder.ts` | Traductor demanda → filtros (mejorado con normalización NFD) |
| `lib/statefox/client.ts` | Cliente HTTP de bajo nivel (`getSnapshot`, `getProperties`) |
| `lib/statefox/types.ts` | Tipos TypeScript para ambos endpoints |
| `lib/statefox/__tests__/snapshot-search.test.ts` | Tests unitarios (33 tests) |
| `lib/statefox/__tests__/query-builder.test.ts` | Tests unitarios (21 tests) |
| `scripts/test-snapshot-search.ts` | Script de validación E2E contra API real |

## Consumidores

| Archivo | Cómo usa el motor |
|---------|-------------------|
| `lib/microsite/selection.ts` | `searchSnapshotForDemand` → genera selección de propiedades para microsite |
| `lib/workers/consumer/visita-evaluada-handler.ts` | `searchSnapshotForDemand` → cuenta stock disponible para decidir si generar microsite |

## Cómo funciona

### Estrategia de búsqueda

1. Convierte la demanda (`DemandFilterInput`) en filtros: housing type, location keywords, rangos de precio/metros, habitaciones mínimas.
2. Pagina `GET /snapshot` (250 items/página, cursor-based, solo `status=active`).
3. Filtra en memoria cada propiedad contra todos los criterios.
4. **Early exit:** deja de paginar al alcanzar `targetResults` matches (default: 20).
5. **Max pages:** nunca escanea más de `maxPages` páginas (default: 6 = 1500 props).

### Normalización de texto

Toda comparación de ciudad/zona/dirección usa `normalizeForComparison`:
- Minúsculas
- Strip de diacríticos vía NFD (`Córdoba` → `cordoba`)
- Trim de espacios

### Matching de ciudad bidireccional

```
keyword.includes(cityName) || cityName.includes(keyword)
```

Esto permite que "córdoba capital" matchee con `cityName: "Córdoba"` y viceversa. También busca en `pZone.name` y `pAddress`.

### Filtros aplicados (en orden)

1. **Precio:** `pPrice > 0` y dentro de `[minPrice, maxPrice]`
2. **Housing:** `pHousing === housing` (ej. `"flat"`)
3. **Ciudad/zona:** al menos un keyword matchea city, zone o address
4. **Metros:** si `pMeters.built > 0`, dentro de `[minMeters, maxMeters]`
5. **Habitaciones:** si `pRooms > 0`, `pRooms >= minRooms`

## Rendimiento observado (Córdoba, abril 2026)

| Demanda | Matches | Páginas | Latencia |
|---------|---------|---------|----------|
| Piso Córdoba 100-200k€, 2+ hab | 82 | 1 | ~3s |
| Piso Córdoba sin filtro | 149 | 1 | ~3s |
| Casa Córdoba hasta 300k€ | 40 | 1 | ~3s |
| Piso Córdoba Centro 80-150k€ 60-90m² | 27 | 1 | ~3s |
| Ático Córdoba 150-250k€ (sin stock) | 0 | 6 | ~15s |

Cuando hay stock, el early exit mantiene la latencia en ~3s (1 página). El peor caso (sin matches) escanea 6 páginas en ~15s.

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `STATEFOX_BEARER_TOKEN` | Sí | Bearer token para la API |
| `STATEFOX_REST_TIMEOUT_MS` | No | Timeout por request (default: 30000ms) |

## Cómo probarlo

```bash
# E2E contra API real (requiere STATEFOX_BEARER_TOKEN en .env)
npx tsx scripts/test-snapshot-search.ts

# Tests unitarios
npx vitest run lib/statefox/__tests__/

# Debug del inventario (volumen, ciudades, housing types)
npx tsx scripts/debug-statefox-snapshot.ts
```

## Mejora de NLU (campo ciudad)

Se añadió un campo `ciudad` separado en el schema NLU (`lib/agents/nlu-graph.ts`) para que el LLM distinga entre nombre de ciudad y barrio/zona:

- `ciudad`: solo el nombre de la ciudad (ej: "Córdoba")
- `zonas`: barrios dentro de la ciudad (ej: ["Centro", "Norte"])

En la proyección (`DEMANDA_ACTUALIZADA`), `ciudad` se antepone a `zonas` en el campo `demands_current.zonas` como CSV, lo que permite que el motor de búsqueda matchee tanto por ciudad como por zona.

## Limitaciones conocidas

- La cuenta Statefox solo tiene inventario de **Córdoba**. Demandas de otras ciudades darán 0 resultados.
- El endpoint `/snapshot` no soporta filtros server-side (housing, city, price). Todo el filtrado es en memoria.
- Sin stock para un tipo/rango, el motor escanea hasta `maxPages` páginas antes de devolver 0, con latencia proporcional.
