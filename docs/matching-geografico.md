# Matching geografico de cruces

## Objetivo

El motor de cruces trata la ubicacion como una condicion primaria cuando la demanda declara barrios o zonas concretas. Precio, habitaciones, superficie o tipologia ya no pueden compensar una incompatibilidad geografica.

El criterio no exige que la propiedad este siempre en la zona exacta: acepta zonas exactas y zonas cercanas/comparables definidas en el catalogo `MarketZoneProfile` / `MarketZoneRelation`. Lo que bloquea son propiedades fuera de la ciudad inferida o en zonas no comparables/genericas como `Andalucia` cuando la demanda pide barrios concretos.

## Archivos principales

- `lib/matching/location.ts`: normalizacion y decision geografica tipada (`accepted`, `rejected`, `unknown`).
- `lib/matching/location-context.ts`: resuelve ciudad, zonas exactas, zonas cercanas y exclusiones desde el catalogo de zonas.
- `lib/matching/scoring.ts`: integra el gate geografico en `computeMatchScore`.
- `lib/matching/match-properties.ts`: cruza una demanda contra propiedades y cuenta rechazos geograficos.
- `lib/matching/match-demands.ts`: cruza una propiedad contra demandas y cuenta rechazos geograficos.
- `scripts/audit-geographic-matches.ts`: audita cruces historicos y, con `--apply`, emite invalidaciones.
- `app/api/matching/cruces/route.ts`: oculta cruces invalidados por defecto.

## Regla de negocio

- Si la demanda no declara zonas, la zona se considera informacion incompleta y recibe score parcial.
- Si la demanda declara una ciudad completa, una propiedad en esa ciudad puede pasar el gate.
- Si la demanda declara barrios o zonas concretas, la propiedad debe coincidir con alguna zona exacta o cercana/comparable.
- Coincidir solo por ciudad no basta cuando hay barrios concretos.
- Zonas genericas como `Andalucia` no sustituyen barrios concretos.
- Las relaciones `not_comparable` prevalecen sobre `comparable`.

## Eventos

- `MATCH_GENERADO`: se conserva como evento historico inmutable.
- `MATCH_INVALIDADO`: se emite para marcar un cruce historico como geograficamente incompatible sin borrar el evento original.

Payload principal de `MATCH_INVALIDADO`:

```json
{
  "matchEventId": "event-id-original",
  "demandId": "40116955",
  "propertyId": "27902283",
  "reason": "Ciudad coincide pero ninguna zona concreta coincide",
  "previousTotalScore": 50,
  "source": "audit_geographic_matches"
}
```

## Comandos

Auditoria read-only:

```bash
npm run audit:geographic-matches -- --demand=40116955 --days=30
```

Aplicar invalidaciones:

```bash
npm run audit:geographic-matches -- --demand=40116955 --days=30 --apply
```

Verificacion enfocada:

```bash
npm test -- lib/matching/__tests__/scoring.test.ts
npm test -- lib/workers/consumer/__tests__/match-demand-internal-job-handler.test.ts
```

Simulacion cercana a produccion (flujo rematch real):

```bash
npm run test:matching-geographic:live -- --demand=40116955 --days=30
```

Con emision real de eventos:

```bash
npm run test:matching-geographic:live -- --demand=40116955 --apply
```
