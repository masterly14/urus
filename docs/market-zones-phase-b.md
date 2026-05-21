# Fase B — Perfil de comparabilidad por propiedad

Fase B conecta el catálogo de zonas (Fase A) con el flujo real de pricing para que cada análisis tenga contexto de submercado antes del filtro avanzado de comparables (Fase C).

## Alcance implementado

- Nuevo builder:
  - `lib/market-zones/property-comparability-profile.ts`
  - `buildPropertyComparabilityProfile(input)`
- Integración en orquestador de pricing:
  - `lib/pricing/index.ts`
  - Se ejecuta después de `extractPropertyForPricing`.
- Enriquecimiento de input:
  - `lib/pricing/extract-property.ts`
  - Añade `zonaRaw`, `keyLoca`, `keyZona` desde `PropertySnapshot.raw`.
- Tipos extendidos:
  - `lib/pricing/types.ts`
  - `PropertyComparabilityProfile` + campos nuevos en `PricingPropertyInput` y `PricingAnalysisResult`.
- Persistencia de trazabilidad:
  - `lib/pricing/report-repo.ts`
  - El perfil se guarda dentro de `queryMeta.comparabilityProfile`.

## Resolución de zona

Orden de resolución:

1. `key_zona/key_loca` (estable Inmovilla).
2. Alias normalizado (`market_zone_aliases`).
3. Nombre canónico (`market_zone_profiles.zoneNameCanonical`).

Si la zona encontrada está inactiva y tiene redirect, se resuelve cadena de redirect hasta la zona activa.

## Fallback conservador `UNKNOWN_ZONE`

Cuando no hay mapeo o la zona no es utilizable para pricing:

- `zoneCode = null`
- `allowedZoneCodes = []`
- `confidenceLevel = low`
- `confidenceFlags` incluye `UNKNOWN_ZONE`

Esto evita mezclar comparables de zonas no validadas.

## Señales de confianza

El perfil incluye:

- `confidenceLevel`: `high | medium | low`
- `confidenceFlags`: motivos concretos (`HEURISTIC_PROFILE`, `LOW_SOURCE_QUALITY`, `REDIRECT_APPLIED`, etc.)

Regla operativa:

- `ready` tiende a confianza alta/media.
- `heuristic` fuerza confianza baja.

## Qué no cambia en Fase B

- No se aplica todavía filtro por `allowedZoneCodes` / `excludedZoneCodes` en `fetch-comparables`.
- No se altera ranking estadístico ni recomendación LLM por submercado.

Eso queda para Fase C.

## Tests

- `lib/market-zones/__tests__/property-comparability-profile.test.ts`
  - key_zona (happy path)
  - alias
  - redirect
  - fallback `UNKNOWN_ZONE`
  - perfil `heuristic`
- `lib/pricing/__tests__/extract-property.test.ts`
  - verifica `zonaRaw`, `keyLoca`, `keyZona`
- `lib/pricing/__tests__/index-comparability.test.ts`
  - verifica que `runPricingAnalysis` incorpora/persiste `comparabilityProfile`
