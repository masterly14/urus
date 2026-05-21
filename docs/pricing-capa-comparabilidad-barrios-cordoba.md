# Capa de Comparabilidad por Barrios (Cordoba)

Documento operativo para construir la capa que evita comparables por cercania ciega y fuerza comparables por submercado real.

Aplica al motor de pricing de Urus para propiedades en Cordoba.

---

## 1) Objetivo

Construir una capa de seleccion de comparables que:

- priorice pares reales de mercado (mismo submercado y perfil de producto),
- excluya barrios cercanos no comparables,
- mejore precision del gap, semaforo y recomendacion,
- deje trazabilidad explicable para comercial y direccion.

---

## 2) Problema que resolvemos

La version actual puede mezclar inmuebles por cercania y filtros generales (ciudad/tipologia/rango), aunque pertenezcan a submercados distintos.

Resultado: clusters sucios, recomendaciones distorsionadas y baja defendibilidad comercial.

---

## 3) Alcance del proyecto

Entra en alcance:

- Cordoba capital (fase inicial).
- Mercado venta residencial (fase inicial).
- Zonas/barrios con inventario real en cartera y oferta externa.

Fuera de alcance inicial:

- Alquiler.
- Municipios perifericos (si no hay cobertura de datos minima).
- Segmentos no residenciales.

---

## 4) Definiciones base

- **Submercado (micro-market):** unidad de comparabilidad real. Puede ser barrio o union de zonas homogeneas.
- **Zona espejo:** barrio no colindante pero comparable por producto/demanda/ticket.
- **Zona no comparable:** barrio cercano pero incompatible estructuralmente.
- **Comparable valido:** inmueble que pasa filtros duros + filtro de submercado + score de comparabilidad.

---

## 5) Datos que el equipo debe levantar (tipado de barrios)

El equipo de negocio/datos debe entregar un perfil por barrio (o micro-market) con estos campos minimos.

### 5.1 Identidad y cobertura

- `city`: Cordoba
- `zoneCode`: identificador canonico interno
- `zoneName`: nombre comercial canonico
- `aliases[]`: variantes de nombre (portales, escritura, abreviaciones)
- `parentArea`: distrito o macrozona
- `isActive`: si entra en motor de comparabilidad

### 5.2 Perfil de mercado

- `marketSegment`: `popular | medio | medio_alto | premium`
- `demandLevel`: `baja | media | alta`
- `liquidityLevel`: `lenta | media | rapida`
- `priceBandM2Min` y `priceBandM2Max` (rango orientativo de zona)
- `dominantOperation`: venta (fase 1)

### 5.3 Perfil de producto

- `dominantHousingTypes[]`: piso, atico, casa, etc.
- `buildingAgeProfile`: `nuevo | mixto | antiguo`
- `qualityProfile`: `basico | medio | alto`
- `dominantUnitSizeRange`: rango m2 habitual
- `amenitiesProfile[]`: ascensor, garaje, terraza, urbanizacion, etc.

### 5.4 Reglas de comparabilidad

- `comparableWith[]`: zonas espejo permitidas
- `notComparableWith[]`: zonas cercanas excluidas
- `comparableRadiusMode`: `intra_zone_only | zone_plus_mirrors | dynamic`
- `hardExclusionRules[]`: reglas explicitas (ej. "no comparar con zona popular antigua")

### 5.5 Calidad y gobierno del dato

- `sourceQuality`: `alta | media | baja`
- `lastValidatedAt`: fecha de ultima revision
- `ownerTeam`: responsable de negocio
- `notes`: contexto no estructurado

---

## 6) Formato de entrega recomendado

Se recomienda entregar dos artefactos:

1. **CSV/Sheet maestro de zonas** (`market_zone_profile`).
2. **CSV/Sheet de relaciones** (`market_zone_relations`), para `comparableWith` y `notComparableWith`.

### 6.1 Esquema minimo: market_zone_profile

- `city`
- `zone_code`
- `zone_name`
- `aliases_json`
- `market_segment`
- `demand_level`
- `liquidity_level`
- `price_band_m2_min`
- `price_band_m2_max`
- `dominant_housing_types_json`
- `building_age_profile`
- `quality_profile`
- `unit_size_min`
- `unit_size_max`
- `amenities_profile_json`
- `comparable_radius_mode`
- `source_quality`
- `owner_team`
- `last_validated_at`
- `is_active`

### 6.2 Esquema minimo: market_zone_relations

- `city`
- `from_zone_code`
- `to_zone_code`
- `relation_type` (`comparable` o `not_comparable`)
- `strength` (`strong | medium | weak`)
- `reason`
- `validated_by`
- `validated_at`

---

## 7) Criterios de calidad para aceptar los datos

No se integra a produccion si no se cumple:

- Cobertura minima del 80% del inventario activo de Cordoba en zonas tipadas.
- Alias resueltos para variantes comunes de escritura.
- Cada zona con al menos 1 regla de comparabilidad (permitida o excluida).
- Sin zonas activas sin `marketSegment` ni `qualityProfile`.
- Validacion negocio firmada por responsable comercial.

---

## 8) Construccion tecnica (una vez listos los datos)

## Fase A - Base de conocimiento de zonas

1. Crear tablas/modelos:
   - `market_zone_profile`
   - `market_zone_relation`
   - `market_zone_alias`
2. Crear importador idempotente desde CSV/Sheet.
3. Crear endpoint interno de validacion y preview del catalogo.

Entregable: catalogo de zonas disponible y versionado.

## Fase B - Perfil de comparabilidad del inmueble

1. Nuevo modulo `buildPropertyComparabilityProfile(propertyCode)`:
   - normaliza zona del inmueble (via alias),
   - resuelve submercado objetivo,
   - obtiene reglas permitidas/prohibidas,
   - devuelve perfil estructurado para el motor.
2. Si zona no mapeada:
   - fallback conservador (`UNKNOWN_ZONE`),
   - no mezclar con zonas no validadas,
   - marcar baja confianza.

Entregable: perfil de comparabilidad por propiedad.

## Fase C - Embudo de candidatos

1. Candidate generation (deterministico):
   - ciudad, operacion, tipologia, rango m2, rango precio.
2. Filtro de submercado:
   - mantener solo zona objetivo + zonas espejo permitidas,
   - excluir `notComparableWith`.
3. Ranking final:
   - score hibrido (reglas + IA opcional),
   - seleccionar top-N.

Entregable: set de comparables limpio y trazable.

## Fase D - Integracion con motor de pricing

1. Insertar capa previa en `runPricingAnalysis`.
2. Pasar cluster limpio a `analyzeCluster`.
3. Persistir trazabilidad por comparable:
   - `included/excluded`,
   - motivo de inclusion/exclusion,
   - score de comparabilidad.

Entregable: informe de pricing con comparables defendibles.

## Fase E - UI, observabilidad y control

1. En informe mostrar:
   - "por que este comparable entra",
   - "por que zonas cercanas se excluyen".
2. Dashboard de calidad:
   - cobertura de zonas,
   - tasa de `UNKNOWN_ZONE`,
   - distribucion de exclusiones por regla.
3. Alertas:
   - zona sin validacion reciente,
   - alias nuevos sin mapear.

Entregable: operacion controlada y auditable.

---

## 9) Rol de IA en esta arquitectura

IA recomendada como capa de apoyo, no unica fuente de verdad:

- Normaliza descripciones y contexto de producto.
- Ayuda en ranking de candidatos grises.
- Propone sugerencias de relaciones nuevas entre zonas.

No sustituye:

- reglas duras de exclusion,
- taxonomia de zonas validada,
- trazabilidad reproducible.

---

## 10) Flujo operativo final (resumen)

1. Inmueble entra a analisis.
2. Se construye perfil de comparabilidad (zona/submercado).
3. Se generan candidatos por filtros duros.
4. Se aplican reglas de comparabilidad de barrios.
5. IA re-rankea casos grises.
6. Se arma cluster final.
7. Se ejecuta analisis estadistico y recomendacion.
8. Se guarda informe + explicabilidad + metricas.

---

## 11) Plan de implementacion sugerido (4 semanas)

### Semana 1

- Cerrar taxonomia de zonas Cordoba.
- Levantar CSV maestro + relaciones.
- Definir reglas minimas de comparabilidad.

### Semana 2

- Crear modelos/tablas e importador.
- Resolver alias y normalizacion de zonas.
- Exponer APIs internas de lectura del catalogo.

### Semana 3

- Integrar embudo de candidatos en motor.
- Aplicar filtro por submercado y exclusiones.
- Persistir trazabilidad por comparable.

### Semana 4

- Ajustes de umbrales y QA con casos reales.
- Activar dashboard de calidad.
- Salida controlada a produccion (feature flag).

---

## 12) Criterios de exito

- Reduccion de comparables "incorrectos por cercania" > 70%.
- Mejora de consistencia entre analisis repetidos de la misma propiedad.
- Menor tasa de disputas comerciales por comparables no defendibles.
- Aumento de confianza del comercial en semaforo y recomendacion.

---

## 13) Riesgos y mitigaciones

- **Riesgo:** zonas sin tipar al inicio.
  - **Mitigacion:** fallback conservador + bloqueo de comparables dudosos.
- **Riesgo:** tipado desactualizado.
  - **Mitigacion:** `lastValidatedAt` obligatorio y alertas.
- **Riesgo:** sobre-dependencia de IA.
  - **Mitigacion:** reglas duras primero, IA como capa complementaria.

---

## 14) Checklist de arranque para el equipo

- [ ] Definir listado canonico de barrios/zonas de Cordoba.
- [ ] Completar tipado minimo por zona (segmento, producto, rango m2, rango €/m2).
- [ ] Completar matriz de `comparableWith` y `notComparableWith`.
- [ ] Resolver alias de nombres de zona en portales y fuentes internas.
- [ ] Validar dataset con direccion comercial.
- [ ] Congelar version v1 del catalogo y pasar a integracion tecnica.

