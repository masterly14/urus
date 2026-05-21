# Fase A — Catalogo de zonas de mercado (Cordoba)

Este documento describe la operativa de Fase A para cargar y validar el catalogo de zonas con fuente Inmovilla (`key_loca=224499`) antes de integrar el motor de comparabilidad.

## Alcance implementado

- Modelos Prisma:
  - `MarketZoneProfile` (`market_zone_profiles`)
  - `MarketZoneRelation` (`market_zone_relations`)
  - `MarketZoneAlias` (`market_zone_aliases`)
- Migracion SQL: `prisma/migrations/20260521183500_add_market_zone_catalog_phase_a/migration.sql`
- Importador idempotente: `scripts/import-market-zones-cordoba.ts`
- Validador de consistencia y normalizacion de relaciones/aliases: `lib/market-zones/catalog-import.ts`
- Endpoint interno readonly de preview:
  - `GET /api/internal/market-zones/preview?catalogVersion=v1.1&keyLoca=224499`

## Dataset fuente

- CSV principal:
  - `data/market-zones-result/inmovilla_cordoba_zone_validation_224499_v1_tipado.csv`
- Contrato de campos:
  - `data/market-zones-result/field_dictionary_v1.1.md`

## Comandos

### 1) Validacion sin escritura (recomendado antes de importar)

```bash
npm run market-zones:import -- --dry-run
```

Salida esperada:

- Conteo de filas activas/ready/heuristic
- Numero de relaciones normalizadas y aliases
- Warnings de conflictos comparable vs not_comparable
- Cero errores de validacion para permitir import real

### 2) Import real a base de datos

```bash
npm run market-zones:import
```

Opciones:

```bash
npm run market-zones:import -- --file data/market-zones-result/inmovilla_cordoba_zone_validation_224499_v1_tipado.csv --catalog-version v1.1
```

## Reglas validadas por el importador

- `redirected` y `deprecated` deben incluir `redirect_to_zone_code` valido y activo.
- No se aceptan referencias de comparabilidad hacia zonas inactivas o inexistentes.
- `price_band_m2_max >= price_band_m2_min` para zonas activas `ready/heuristic`.
- Conflictos intra-fila (`comparable` y `not_comparable` al mismo destino) se resuelven con prevalencia de `not_comparable` y warning.
- Conflictos inter-zona (`A->B comparable` y `B->A not_comparable`) se resuelven con prevalencia de `not_comparable` y warning.

## Endpoint de preview interno

Ruta:

```text
GET /api/internal/market-zones/preview?catalogVersion=v1.1&keyLoca=224499
```

Requiere sesion autenticada con rol `ceo` o `admin`.

Devuelve:

- Conteos por `coverageStatus`, `pricingProfileStatus`, `validationPriority`
- Totales de filas, activas y relaciones
- Conflictos de relaciones
- Redirects invalidos
- Muestras P1/P2/P3

## Test automatizado

Se incluye suite unitaria del parser/validador:

```bash
npm test -- lib/market-zones/__tests__/catalog-import.test.ts
```
