# Diccionario de campos — Capa de Comparabilidad por Barrios (Córdoba v1.1)

**Versión:** v1.1 (schema Inmovilla) · **Ciudad:** Córdoba capital · **Validado:** 2026-05-21 · **Owner:** comercial_cordoba · **Fuente:** `key_loca=224499`

Documento de referencia único para ingeniería. El CSV `inmovilla_cordoba_zone_validation_224499_v1_tipado.csv` mantiene las 41 columnas originales de Inmovilla; este diccionario las describe.

---

## Campos inmutables (no tocar al importar)

| Campo | Tipo | Descripción |
|---|---|---|
| `priority_rank` | integer | Orden de validación generado por backlog. |
| `validation_priority` | enum | `P1_active_inventory \| P2_historical_inventory \| P3_no_stock`. |
| `key_loca` | integer | Identificador de localidad en Inmovilla (Córdoba = 224499). |
| `key_zona` | integer | **Clave primaria estable de Inmovilla.** Inmutable. |
| `zona_inmovilla` | string | Nombre de la zona tal como llega de Inmovilla. |
| `suggested_zone_code` | string | Código canónico interno generado (`COR-IMV-{key_zona}`). Inmutable. Las relaciones referencian por este código. |

---

## Campos de clasificación (rellenos por equipo de negocio)

| Campo | Tipo | Obligatorio | Enum / Formato | Regla |
|---|---|---|---|---|
| `coverage_status` | enum | sí | `validated \| known_unprofiled \| redirected \| out_of_scope \| deprecated` | Estado de cobertura del tipado. |
| `pricing_profile_status` | enum | sí | `ready \| heuristic \| not_ready \| redirected \| not_applicable \| deprecated` | Estado de uso por motor de pricing. Solo `ready` y `heuristic` se inyectan; `heuristic` marca confianza baja. |
| `zone_name_canonical` | string | sí | — | Nombre canónico interno (puede diferir de `zona_inmovilla`). |
| `macro_area` | enum | recomendado | `Centro \| Norte \| Sur \| Este \| Oeste \| Sierra \| Periurbano` | Macroárea geográfica de Córdoba capital. |

---

## Perfil comercial (obligatorio si `is_active=true` y `coverage_status ∈ {validated, known_unprofiled}` con tipado)

| Campo | Tipo | Enum / Formato | Ejemplo | Regla |
|---|---|---|---|---|
| `market_segment` | enum | `popular \| medio \| medio_alto \| premium` | `medio_alto` | No vacío si activa con perfil. |
| `quality_profile` | enum | `basico \| medio \| alto` | `medio` | No vacío si activa con perfil. |
| `demand_level` | enum | `baja \| media \| alta` | `alta` | — |
| `liquidity_level` | enum | `lenta \| media \| rapida` | `rapida` | — |
| `price_band_m2_min` | integer | €/m² | `1700` | > 0. |
| `price_band_m2_max` | integer | €/m² | `2200` | ≥ `price_band_m2_min`. |
| `dominant_housing_types_json` | JSON array | `["Piso","Ático","Chalet","Pareado","Adosado","Casa","Estudio","Parking","Local comercial"]` | `["Piso","Estudio"]` | Vacío = `[]`. |
| `building_age_profile` | enum | `nuevo \| mixto \| antiguo` | `antiguo` | — |
| `amenities_profile_json` | JSON array | strings normalizadas | `["ascensor","garaje"]` | Vacío = `[]`. |

---

## Reglas de comparabilidad

| Campo | Tipo | Enum / Formato | Regla |
|---|---|---|---|
| `comparable_radius_mode` | enum | `intra_zone_only \| zone_plus_mirrors \| dynamic` | `intra_zone_only` para zonas aisladas (pedanías). |
| `comparable_with_zone_codes_json` | JSON array | `["COR-IMV-XXX",...]` | Códigos de zonas con `is_active=true`. Vacío = `[]`. |
| `not_comparable_with_zone_codes_json` | JSON array | `["COR-IMV-XXX",...]` | Códigos de zonas con `is_active=true`. Vacío = `[]`. |

**Importante:** este schema **no separa simetría explícita** como el modelo v1. Si una zona A lista a B en `comparable_with`, ingeniería debe interpretar la relación como simétrica salvo que B **no** liste a A; en ese caso la relación es asimétrica (A puede usar B, B no usa A). Asimetrías documentadas en este v1: solo en `notes`.

---

## Estado y gobierno

| Campo | Tipo | Enum / Formato | Regla |
|---|---|---|---|
| `source_quality` | enum | `alta \| media \| baja` | `baja` en v1 por defecto (N pequeño, sin validación externa). |
| `owner_team` | string | — | Equipo responsable. v1: `comercial_cordoba`. |
| `validated_by` | string | — | Quien firma la validación. |
| `validated_at` | date | `YYYY-MM-DD` | Dispara alerta si > 90 días sin revisión. |
| `is_active` | boolean | `true \| false` | `false` para deprecadas, redirects y out_of_scope. |
| `redirect_to_zone_code` | string | `COR-IMV-XXX` o vacío | Obligatorio si `is_active=false` y `coverage_status=redirected` o `deprecated`. |

---

## Datos derivados de Inmovilla (informativos, no tocar)

`inventory_count_active`, `inventory_count_historical`, `avg_price_m2_active`, `median_price_m2_active`, `avg_price_m2_historical`, `median_price_m2_historical`, `unit_size_min_active`, `unit_size_max_active`, `dominant_tipos_detected_json`, `sample_active_property_codes_json`, `sample_historical_property_codes_json`, `raw_zone_variants_json`.

---

## `notes` — convenciones

Texto libre. Usar para registrar:
- Outliers identificados y motivo de exclusión de la banda.
- Decisiones de consolidación (`CONSOLIDADO: incluye key X por duplicado de naming`).
- Reglas asimétricas (`Asimétrica: A puede mirar a B; B no debe mirar a A`).
- Banderas para revisar (`REVISAR: muestra está fuera del término municipal`).
- Motivo de `out_of_scope` (`Out of scope: polígono industrial`).

---

## Reglas globales

1. **No tocar campos inmutables** (sección 1). `key_zona` y `suggested_zone_code` son las claves estables.
2. **`is_active=false` exige decisión coherente:**
   - `coverage_status=deprecated` → debe tener `redirect_to_zone_code`.
   - `coverage_status=redirected` → debe tener `redirect_to_zone_code` apuntando a `suggested_zone_code` de una zona con `is_active=true`.
   - `coverage_status=out_of_scope` → `redirect_to_zone_code` vacío, `notes` con motivo.
3. **No referencias cruzadas a zonas inactivas:** `comparable_with_zone_codes_json` y `not_comparable_with_zone_codes_json` solo apuntan a zonas con `is_active=true`.
4. **Prevalencia ante conflicto:** si A lista a B como comparable y B lista a A como no comparable, prevalece **no comparable**.
5. **JSON embebido:** todos los campos `*_json` se parsean con `json.loads()` tras leer el CSV.
6. **Idempotencia del importador:** usar `key_zona` como clave de upsert.

---

## Métricas v1 esperadas tras importar

| Métrica | Valor esperado |
|---|---|
| Filas totales | 201 |
| `coverage_status=validated` | 19 |
| `coverage_status=deprecated` | 1 (Tablero key 4141699 → 1903399) |
| `coverage_status=redirected` | 82 |
| `coverage_status=out_of_scope` | 55 |
| `coverage_status=known_unprofiled` | 44 (de las cuales 25 con `pricing_profile_status=heuristic`) |
| Zonas activas con ≥1 regla comparabilidad | 19/19 (100%) |
| Cobertura inventario activo de Córdoba | 100% (las 19 P1 cubren el seed completo) |
