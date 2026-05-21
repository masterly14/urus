# Fase C + D minima viable — Integracion de comparabilidad en motor de pricing

Este documento describe la integracion minima de la capa de comparabilidad en el motor real de pricing.

## Objetivo

Aplicar reglas de submercado en tiempo de ejecucion y guardar explicabilidad por comparable en `pricing_report` (JSON), sin crear tablas nuevas.

## Reglas operativas implementadas

### Por estado de zona

- `ready`:
  - comparabilidad avanzada completa
  - usa `allowedZoneCodes` del perfil (zona objetivo + espejos permitidos)
  - excluye siempre `notComparableWith`
- `heuristic`:
  - comparabilidad limitada
  - usa zona objetivo + permitidos explicitos
  - mantiene flags de baja confianza del perfil
- `not_ready` / `out_of_scope` / `deprecated` / `unknown`:
  - fallback conservador
  - no expansion por espejos
  - si hay zona objetivo resoluble: solo esa zona
  - si no hay zona resoluble: exclusion por defecto (`ZONE_UNKNOWN_FALLBACK`)

### Exclusiones duras

`notComparableWith` prevalece siempre.

Si una zona cae en permitido y excluido, gana exclusión.

## Archivos clave

- `lib/pricing/fetch-comparables.ts`
  - aplica filtros por submercado y construye decision por comparable
- `lib/pricing/index.ts`
  - propaga `comparabilityProfile` a fetch
  - incluye metadata de comparabilidad en `queryMeta`
- `lib/pricing/types.ts`
  - añade contrato de trazabilidad (`PricingComparabilityMeta`, `ComparableDecisionTrace`)
- `lib/pricing/report-repo.ts`
  - persiste trazabilidad en JSON y mantiene compatibilidad con reportes antiguos

## Trazabilidad persistida (JSON)

En `queryMeta.comparability` se guardan:

- `comparabilityFilterApplied`
- `effectiveAllowedZoneCodes`
- `effectiveExcludedZoneCodes`
- `candidatesBeforeFilter`
- `candidatesAfterFilter`
- `excludedByReason`
- `comparableDecisions[]` con:
  - `statefoxId`
  - `candidateZoneRaw`
  - `candidateZoneCodeResolved`
  - `decision` (`included`/`excluded`)
  - `reason` (`ZONE_NOT_ALLOWED`, `ZONE_EXCLUDED_NOT_COMPARABLE`, `ZONE_UNKNOWN_FALLBACK`, etc.)

## Tests

Suites relevantes:

- `lib/pricing/__tests__/fetch-comparables.test.ts`
  - casos ready/heuristic/fallback + decisiones
- `lib/pricing/__tests__/index-comparability.test.ts`
  - integración de `runPricingAnalysis` con metadata de comparabilidad
- `lib/market-zones/__tests__/property-comparability-profile.test.ts`
  - resolución de zona, redirects y fallback `UNKNOWN_ZONE`

## Fuera de alcance en esta etapa

- No se modifica el algoritmo estadistico de `analyze-cluster`.
- No se introduce tabla dedicada de trazabilidad por comparable.
- No se cambia ranking LLM por submercado (siguiente iteración).
