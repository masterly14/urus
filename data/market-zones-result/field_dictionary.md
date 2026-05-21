# Diccionario de campos — Capa de Comparabilidad por Barrios (Córdoba v1)

**Versión:** v1.0 · **Ciudad:** Córdoba capital · **Validado:** 2026-05-21 · **Owner:** comercial_cordoba

Documento de referencia único para ingeniería. Define tipo, enum, obligatoriedad y regla de validación de cada campo de los CSV entregados.

---

## Archivo 1 — `market_zone_profile.csv`

| Campo | Tipo | Obligatorio | Enum / Formato | Ejemplo | Regla de validación |
|---|---|---|---|---|---|
| `city` | string | sí | — | `Córdoba` | Fijo por archivo. UTF-8 con tilde. |
| `zone_code` | string | sí | `COR-NNN` | `COR-008` | Único, inmutable. Clave primaria. Las relaciones referencian por este código, no por nombre. |
| `zone_name` | string | sí | — | `Casco Antiguo` | Nombre canónico interno. Puede cambiar; no rompe relaciones. |
| `aliases_portals_json` | JSON array | sí | `["..."]` | `["Casco Antiguo","Judería"]` | Variantes tal cual aparecen en portales (Idealista, Fotocasa, etc.). Vacío = `[]`. |
| `aliases_internal_json` | JSON array | sí | `["..."]` | `["Casco Histórico","Casco"]` | Variantes usadas internamente por comercial / CRM. |
| `aliases_typos_json` | JSON array | sí | `["..."]` | `["casco antiguo","juderia"]` | Errores de escritura, sin tilde, minúsculas, abreviaciones. |
| `market_segment` | enum | sí (si `is_active=true`) | `popular \| medio \| medio_alto \| premium` | `medio_alto` | No vacío si zona activa. |
| `quality_profile` | enum | sí (si `is_active=true`) | `basico \| medio \| alto` | `medio` | No vacío si zona activa. |
| `demand_level` | enum | sí | `baja \| media \| alta` | `alta` | — |
| `liquidity_level` | enum | sí | `lenta \| media \| rapida` | `media` | — |
| `price_band_m2_min` | integer | sí (si activa) | €/m² | `1700` | > 0. Banda recalculada excluyendo no-residenciales cuando aplica (ver `notes`). |
| `price_band_m2_max` | integer | sí (si activa) | €/m² | `2200` | ≥ `price_band_m2_min`. |
| `dominant_housing_types_json` | JSON array | sí | `["Piso","Ático","Chalet","Pareado","Adosado","Casa","Estudio","Parking","Local comercial"]` | `["Piso","Estudio"]` | Tipos observados en la zona; orden por dominancia. |
| `building_age_profile` | enum | sí | `nuevo \| mixto \| antiguo` | `antiguo` | — |
| `unit_size_min` | integer | sí | m² | `45` | > 0. |
| `unit_size_max` | integer | sí | m² | `120` | ≥ `unit_size_min`. |
| `amenities_profile_json` | JSON array | sí | strings libres normalizadas | `["ascensor","garaje","trastero"]` | Vacío = `[]`. Recomendado: snake_case sin tildes. |
| `comparable_radius_mode` | enum | sí | `intra_zone_only \| zone_plus_mirrors \| dynamic` | `zone_plus_mirrors` | `intra_zone_only` para zonas aisladas (ej. pedanías). |
| `source_quality` | enum | sí | `alta \| media \| baja` | `baja` | `baja` cuando: N<3, outliers no filtrables, o tipado no validado externamente. |
| `owner_team` | string | sí | — | `comercial_cordoba` | Equipo responsable de la validación. |
| `last_validated_at` | date (ISO) | sí | `YYYY-MM-DD` | `2026-05-21` | Dispara alerta si > 90 días sin revisión. |
| `is_active` | boolean | sí | `true \| false` | `true` | `false` para zonas deprecadas o consolidadas en otra. |
| `redirect_to_zone_code` | string | condicional | `COR-NNN` o vacío | `COR-013` | Obligatorio si `is_active=false` y la zona fue consolidada en otra. Permite resolver alias históricos. |
| `inventory_count` | integer | sí | — | `2` | Snapshot al momento de validación. Informativo. |
| `avg_price_m2` | integer | no | €/m² | `1817` | Vacío permitido si N=0. |
| `median_price_m2` | integer | no | €/m² | `1817` | — |
| `sample_property_codes_json` | JSON array | sí | `["..."]` | `["27274997","28184163"]` | Códigos de inmuebles del seed que respaldan el tipado. |
| `notes` | string | no | texto libre | — | Decisiones de tipado, outliers identificados, contexto. |

---

## Archivo 2 — `market_zone_relations.csv`

| Campo | Tipo | Obligatorio | Enum / Formato | Ejemplo | Regla de validación |
|---|---|---|---|---|---|
| `city` | string | sí | — | `Córdoba` | Fijo por archivo. |
| `from_zone_code` | string | sí | `COR-NNN` | `COR-008` | Debe existir en `market_zone_profile.csv` con `is_active=true`. |
| `to_zone_code` | string | sí | `COR-NNN` | `COR-009` | Idem. No puede ser igual a `from_zone_code`. |
| `relation_type` | enum | sí | `comparable \| not_comparable` | `comparable` | — |
| `strength` | enum | sí | `strong \| medium \| weak` | `medium` | Fortaleza de la regla para el ranking final. |
| `is_symmetric` | boolean | sí | `true \| false` | `true` | Default `true`. Si `false`, `asymmetry_reason` obligatorio. |
| `asymmetry_reason` | string | condicional | texto libre | `"A puede aspirar a B; B no debe usar A como referencia."` | Obligatorio cuando `is_symmetric=false`. Explica dirección y motivo. |
| `reason` | string | sí | texto libre | `"Ambos urbanos centrales..."` | Justificación de negocio. Aparece en explicabilidad del informe. |
| `validated_by` | string | sí | — | `comercial_cordoba` | Equipo o persona que firma la regla. |
| `validated_at` | date (ISO) | sí | `YYYY-MM-DD` | `2026-05-21` | — |

### Reglas globales del archivo de relaciones

1. **Simetría por defecto:** si `is_symmetric=true`, ingeniería debe interpretar la regla como bidireccional. NO duplicar filas para representar simetría.
2. **Asimetría obligatoriamente justificada:** filas con `is_symmetric=false` deben tener `asymmetry_reason` no vacío. Falla import si vacío.
3. **No comparables prevalecen:** ante conflicto entre una regla `comparable` y una `not_comparable` entre el mismo par, prevalece `not_comparable`.
4. **Sin auto-referencias:** `from_zone_code != to_zone_code`.
5. **Sin referencias a zonas deprecadas:** `from_zone_code` y `to_zone_code` deben tener `is_active=true` en el profile. Si una zona deprecada aparece históricamente, resolver vía `redirect_to_zone_code`.

---

## Notas de importación para ingeniería

- **Encoding:** UTF-8 con BOM opcional. Los nombres con tilde (`Córdoba`, `Andalucía`, `Higuerón`) deben preservarse.
- **JSON embebido:** los campos `*_json` contienen JSON válido escapado por el dialecto CSV estándar (RFC 4180). Parsear con `json.loads()` tras leer el CSV.
- **Idempotencia:** el importador debe usar `zone_code` y el par `(from_zone_code, to_zone_code, relation_type)` como claves de upsert.
- **Validación previa a producción:** ejecutar checks listados en el documento operativo (sección 7) antes de activar feature flag.
