# Catálogos Inmovilla (Enums vía REST)

Los valores válidos para `key_loca`, `key_tipo`, `key_zona` y otros enums de la API REST de Inmovilla se obtienen de `GET /enums/?...` y se **cachean en Neon** para no superar el rate limit (2 peticiones/minuto) ni llamar a la API en cada operación.

## Origen de datos

- **API:** `GET /enums/?calidades`, `?tipos`, `?paises`, `?ciudades`, `?zonas={key_loca}` (ver [documentacion-api-rest-inmovilla.md](documentacion-api-rest-inmovilla.md)).
- **Sincronización:** `npx tsx scripts/sync-inmovilla-enums.ts` — descarga todos los enums y los persiste en Neon respetando 2 req/min. Opción `--skip-zonas` para omitir zonas y reducir tiempo.
- **Tablas Prisma:** `InmovillaEnumCalidad`, `InmovillaEnumTipo`, `InmovillaEnumPais`, `InmovillaEnumCiudad`, `InmovillaEnumZona`.

## Resolución de códigos (desde Neon)

El módulo `lib/inmovilla/rest/catalogs.ts` expone funciones de **solo lectura** que consultan Neon (no la API de Inmovilla):

| Función | Uso |
|--------|-----|
| `getKeyLocaByCiudad(prisma, { ciudadNombre, provincia })` | Obtener `key_loca` por nombre de ciudad (y opcional provincia). |
| `getKeyTipoByNombre(prisma, tipoPropiedad)` | Obtener valor numérico de `key_tipo` (ej. "Piso" → 1). |
| `getKeyZonaByZonaAndKeyLoca(prisma, nombreZona, keyLoca)` | Obtener `key_zona` por nombre de zona y ciudad. |
| `getCiudadesByPais(prisma, paisValor)` | Listar ciudades de un país. |
| `getZonasByKeyLoca(prisma, keyLoca)` | Listar zonas de una ciudad (útil para `lib/geo`). |

## Dónde se usan estos catálogos

- **Egestion Worker:** al crear o actualizar propiedades y demandas en Inmovilla vía API REST o RPA, necesita enviar `key_loca`, `key_tipo`, `key_zona` numéricos; los resuelve con las funciones de `catalogs.ts` y el cliente `prisma` de `lib/prisma.ts`.
- **lib/geo (Día 3):** mapeo de `key_zona` a polígonos geoespaciales para demandas; puede usar `getZonasByKeyLoca` para obtener las zonas de una ciudad y asociarlas a geometrías.

## Refresco de catálogos

Ejecutar periódicamente (p. ej. cron vía QStash, TTL 24–72 h) el script de sincronización para actualizar Neon con cambios en Inmovilla. No usar la API de enums en tiempo real para evitar superar el rate limit.
