# Statefox API — `https://statefox.com/public/aapi/props`

---

## GET `/properties` — Listed properties from portals

### Description

Returns a filterable index of properties by source, listing type, housing type, and insert date. The response contains dynamic keys per `propertyId` and a `meta` block with pagination and price ranges.

### Headers

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `Authorization` | string | ✅ | Bearer token. Enviar como `Authorization: Bearer <TOKEN>`. Ej: `abc123...` |

### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `source` | string | ✅ | Fuente del listado. Ej: `idealista`. Valores: `idealista`, `fotocasa`, `pisoscom`, `habitaclia` |
| `type` | string | ✅ | Tipo de operación. Si está vacío, se usa `sale` por defecto. Valores: `sale`, `rent` |
| `items` | integer | ✅ | Ítems por página. Ej: `10`. Rango: `1…500` |
| `housing` | string | ✅ | Tipo de inmueble. Si está vacío, se usa `house` por defecto. Valores: `flat`, `house`, `countryhouse`, `duplex`, `penthouse`, `studio`, `loft`, `garage`, `office`, `premises`, `land`, `building`, `storage`, `warehouse`, `room` |
| `insert` | string (date) | ❌ | Fecha de inserción. Formato `Y-m-d`. Ej: `2025-10-29` |

### Respuesta `200 OK`

- `properties`: Objeto `{propertyId: Property}`. Ej: `"id.es.r.110283328": {...}`
- `meta`: Paginación y rango de precios (`page`, `total`, `items`, `price.min`, `price.max`)

Cada propiedad incluye información completa: estado, tipo, precio, habitaciones, dirección, coordenadas, imágenes, información del anunciante, extras, timestamps y más.

### Estructura de respuesta

#### `properties` — Map `{propertyId: Property}`

**Ejemplo de propiedad en alquiler (`id.es.r.110283328`):**

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `_id` | string | ID interno | `id.es.r.110283328` |
| `pType` | string | Tipo de operación | `rent` |
| `pStatus` | string | Estado del listado | `active` |
| `pHousing` | string | Tipo de inmueble | `flat` |
| `pDesc` | string | Descripción del inmueble | `Piso en pleno centro...` |
| `pPrice` | integer | Precio anunciado | `450` |
| `pRooms` | integer | Número de habitaciones | `3` |
| `pBaths` | integer | Número de baños | `1` |
| `pFloor` | string | Planta | `3` |
| `pOrientation` | string | Orientación de la fachada | `ss` |
| `pTags` | string | Etiquetas de la propiedad | — |
| `pAddress` | string | Dirección aproximada | `Calle Grecia` |
| `pRef` | string | Referencia del anunciante | `PNZC-587` |
| `pContact` | string | Información de contacto | — |
| `pPricePerMeter` | integer | Precio por m² | `8` |
| `pLink` | string | URL del listado original | `https://www.idealista.com/inmueble/110283328/` |
| `propertyMainImage` | string | URL de la imagen principal | — |
| `pPhones` | array | Teléfonos de contacto | `["658965865"]` |

---

#### `pAdvert` — Información del anunciante

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `type` | string | Tipo de anunciante (`private` / `professional`) | `private` |
| `name` | string | Nombre del anunciante | `Carmen` |
| `total` | integer \| object | Total de listados (entero para privado, objeto con `sale`/`rent` para profesional) | `0` |
| `data` | array | Datos adicionales del anunciante | `[]` |

---

#### `pMeters` — Métricas del inmueble en m²

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `built` | integer | Superficie construida | `56` |
| `usable` | integer | Superficie útil | `0` |
| `plot` | integer | Superficie de parcela | `0` |
| `buildable` | integer | Superficie edificable | `0` |
| `terrace` | integer | Superficie de terraza | `0` |
| `garage` | integer | Superficie de garaje | `0` |

---

#### `pExtras` — Características adicionales

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `oCondition` | string | Condición original | `good` |
| `condition` | string | Condición del inmueble | `good` |
| `certenerat` | string | Certificado energético (letra) | `exempt` |
| `certeneval` | float | Certificado energético (valor) | `99.9` |
| `certemirat` | string | Certificado medioambiental (letra) | `G` |
| `certemival` | float | Certificado medioambiental (valor) | `999.9` |
| `exterior` | boolean | Es exterior | `true` |
| `terrace` | boolean | Tiene terraza | `false` |
| `balcony` | boolean | Tiene balcón | `false` |
| `furniture` | boolean | Tiene muebles | `true` |
| `furnished` | boolean | Está amueblado | `true` |
| `lift` | boolean | Tiene ascensor | `false` |
| `heating` | string | Tipo de calefacción (`gas` / `electric` / `central` / `heatpump`) | `gas` |
| `aircond` | boolean | Tiene aire acondicionado | `true` |
| `airConditioning` | boolean | Aire acondicionado disponible | `true` |
| `pool` | boolean | Tiene piscina | `false` |
| `garden` | boolean | Tiene jardín | `false` |
| `garage` | boolean | Tiene garaje | `false` |
| `boxroom` | boolean | Tiene trastero | `false` |
| `wardrobes` | boolean | Armarios empotrados | `false` |
| `chimney` | boolean | Tiene chimenea | `false` |
| `purchaseopt` | boolean | Opción de compra | `false` |
| `year` | string | Año de construcción | `2023` |
| `deposit` | string | Meses de fianza | `1` |
| `negotiable` | boolean | Precio negociable | `true` |
| `link` | string | URL del listado en el portal | `https://www.fotocasa.es/...` |

---

#### `pPoint` — Coordenadas geográficas

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `latitude` | number | Latitud | `37.6106209` |
| `longitude` | number | Longitud | `-0.9742879` |

---

#### `pImages` — Imágenes de la propiedad

Objeto indexado por número. Ej: `{0: {src: "https://img3.idealista.com/.../1400671041.jpg"}, 1: {...}}`

---

#### `pTS` — Timestamps (Unix time)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `seen` | integer | Última vez visto | `1768289332` |
| `check` | integer | Último chequeo | `1768289332` |
| `insert` | integer | Inserción | `1768169530` |
| `hash` | integer | Hash | `1768294001` |
| `match` | integer | Match | `1768294001` |
| `change` | integer | Último cambio | `1768199724` |
| `mod` | integer | Última modificación | `1768258880` |

---

#### `pDate` — Fechas formateadas (`Y-m-d`)

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `seen` | string | `2026-01-13` |
| `insert` | string | `2026-01-11` |
| `check` | string | `2026-01-13` |
| `hash` | string | `2026-01-13` |
| `match` | string | `2026-01-13` |

---

#### `pCity` — Información de ciudad

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `_id` | string | ID MongoDB de la ciudad | `5c8ecf03936ec31bfd65eca1` |
| `cityName` | string | Nombre de la ciudad | `Cartagena` |
| `cityRegion` | string | Provincia/Región | `Murcia` |

---

#### `pZone` — Zona/barrio

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `_id` | string | ID de zona | `norte-zona-juan-de-borbon` |
| `name` | string | Nombre de zona | `Norte · Zona Juan de Borbón` |

---

#### `pChanges` — Cambios detectados

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `type` | string | Cambio de tipo | — |
| `price` | integer | Cambio de precio | `0` |
| `status` | integer | Cambio de estado | `0` |
| `address` | integer | Cambio de dirección | `0` |
| `descrip` | integer | Cambio de descripción | `0` |

---

#### `is` — Flags booleanos

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `acquire` | boolean | Adquirido | `true` |
| `crawl` | boolean | Rastreado | `false` |
| `complete` | boolean | Completo | `true` |
| `residential` | boolean \| null | Es residencial | — |

---

#### `has` — Flags de características

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `images` | boolean | Tiene imágenes | `true` |
| `reports` | boolean | Tiene informes | `false` |
| `contact` | boolean | Tiene contacto | `false` |
| `follow` | boolean | Tiene seguimiento | `false` |
| `stock` | boolean | Tiene stock | `false` |

---

#### `meta` — Paginación y precios

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `page` | integer | Página actual | `1` |
| `total` | integer | Total de resultados | `180` |
| `items` | integer | Resultados en esta página | `10` |
| `price.min` | integer | Precio mínimo en resultados | `380` |
| `price.max` | integer | Precio máximo en resultados | `6000` |

---

### Errores

| Código | Descripción |
|--------|-------------|
| `400` | Parámetros de consulta inválidos |
| `401` | Token ausente o inválido |

---

---

## GET `/snapshot` — Current state of properties

### Description

Devuelve el último estado conocido de cada propiedad (indexado por `propertyId`) más un bloque `meta` para paginación.

### Headers

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `Authorization` | string | ✅ | Bearer token. Enviar como `Authorization: Bearer <TOKEN>`. Ej: `abc123...` |

### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `items` | integer | ✅ | Ítems por página. Ej: `10`. Rango: `1…250` |
| `status` | string | ❌ | Estado actual del listado. Ej: `active`. Valores: `active`, `inactive` |
| `type` | string | ❌ | Tipo de operación esperada en resultados. Ej: `sale`. Valores: `sale`, `rent` |
| `next` | string | ❌ | Cursor para la siguiente página. Pasar el valor de `meta.next` de la llamada anterior. No es necesario en la primera llamada. Ej: `6900e90269a...` |

### Respuesta `200 OK`

- `result`: Objeto snapshot `{propertyId: SnapshotProperty}` con el estado más reciente
- `meta`: `meta.items`, `meta.sort`, `meta.next` (cursor), `meta.debug`

Cada propiedad incluye detalles completos: estado, tipo, descripción, precio, habitaciones, dirección, información de ciudad, coordenadas, imágenes, extras, información del anunciante, timestamps, etc.

> **Nota:** La respuesta usa `result` en lugar de `properties` y tiene estructuras de campo diferentes al endpoint `/properties`.

### Estructura de respuesta

#### `result` — Map `{propertyId: SnapshotProperty}`

**Ejemplo de propiedad en venta (`id.es.s.110295095`):**

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `_id` | string | ID interno | `id.es.s.110295095` |
| `pStatus` | string | Estado | `active` |
| `pType` | string | Tipo de operación | `sale` |
| `pHousing` | string | Tipo de inmueble | `penthouse` |
| `pDescription` | string | Descripción pública | `No todos los áticos son iguales...` |
| `pAddress` | string | Dirección aproximada | `Islas canarias` |
| `pRooms` | integer | Número de habitaciones | `2` |
| `pFloor` | string | Planta | `3` |
| `pOrientation` | string | Orientación de la fachada | `ss` |
| `pBaths` | integer | Número de baños | `1` |
| `pPrice` | integer | Precio de venta | `180000` |
| `pRef` | string | Referencia del anunciante | — |
| `pLink` | string | URL del listado original | `https://www.idealista.com/inmueble/110295095/` |
| `pPhones` | array | Teléfonos de contacto | `["822260008"]` |
| `pZone` | string \| object | Zona/barrio (puede ser string vacío u objeto) | — |
| `match` | array | Datos de match | `[]` |
| `pChanges` | array | Array de cambios | `[]` |

---

#### `pMeters` — Métricas del inmueble en m²

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `built` | integer | Superficie construida | `60` |
| `usable` | integer | Superficie útil | `0` |
| `plot` | integer | Superficie de parcela | `0` |
| `buildable` | integer | Superficie edificable | `0` |
| `terrace` | integer | Superficie de terraza | `0` |
| `garage` | integer | Superficie de garaje | `0` |

---

#### `pExtras` — Características adicionales

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `community` | integer | Cuotas de comunidad mensuales | `30` |
| `oCondition` | string | Condición original | `good` |
| `condition` | string | Condición del inmueble | `good` |
| `certenerat` | string | Certificado energético (letra) | `exempt` |
| `certeneval` | float | Certificado energético (valor) | `99.9` |
| `certemirat` | string | Certificado medioambiental (letra) | `G` |
| `certemival` | float | Certificado medioambiental (valor) | `999.9` |
| `exterior` | boolean | Es exterior | `true` |
| `terrace` | boolean | Tiene terraza | `true` |
| `balcony` | boolean | Tiene balcón | `false` |
| `wardrobes` | boolean | Armarios empotrados | `true` |
| `year` | string | Año de construcción | `1973` |
| `lift` | boolean | Tiene ascensor | `false` |
| `heating` | string | Tipo de calefacción | `central` |
| `aircond` | boolean | Tiene aire acondicionado | `true` |
| `airConditioning` | boolean | Aire acondicionado disponible | `true` |
| `boxroom` | boolean | Tiene trastero | `false` |
| `negotiable` | boolean | Precio negociable | `true` |

---

#### `pAdvert` — Información del anunciante

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `name` | string | Nombre del anunciante | `VipKel Consulting Services Tenerife` |
| `type` | string | Tipo de anunciante (`private` / `professional`) | `professional` |

---

#### `pPrivate` — Detalles del anunciante privado (cuando `type=private`)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `name` | string | Nombre del contacto privado | `Jose` |

---

#### `pPoint` — Coordenadas geográficas

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `latitude` | number | Latitud | `28.0131954` |
| `longitude` | number | Longitud | `-16.6706061` |

---

#### `pImages` — Imágenes de la propiedad

Array de URLs de imágenes. Ej: `["https://img4.idealista.com/...webp"]`

---

#### `pTS` — Timestamps (Unix time)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `seen` | integer | Última vez visto | `1768297077` |
| `check` | integer | Último chequeo | `1768297077` |
| `mod` | integer | Última modificación | `1768297046` |
| `insert` | integer | Inserción | `1768297046` |
| `change` | integer | Último cambio | `1768297077` |

---

#### `pCity` — Información de ciudad

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `_id` | string | ID MongoDB de la ciudad | `5c8ecf03936ec31bfd65f101` |
| `cityName` | string | Nombre de la ciudad | `Arona` |
| `cityRegion` | string | Provincia/Región | `Santa Cruz de Tenerife` |

---

#### `meta` — Paginación del snapshot

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `items` | integer | Propiedades en esta página | `10` |
| `sort` | string | Orden de resultados | `pTS.insert,DESC` |
| `next` | string \| null | Cursor para la siguiente página (o `null`) | `69662744e6fd3:1W6DClv4yQNh633g8dd8tn6E2z0ABezRHhvRyo81L86EnMzM85OApKUV` |
| `debug` | null | Información de debug (si está habilitado) | — |

---

### Errores

| Código | Descripción |
|--------|-------------|
| `400` | Parámetros de consulta inválidos |
| `401` | Token ausente o inválido |