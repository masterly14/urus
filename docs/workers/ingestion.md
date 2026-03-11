# Ingestion Worker — Propiedades (M1)

Worker de ingesta que lee propiedades activas de Inmovilla por polling, detecta cambios comparando con un snapshot previo persistido en Neon y emite eventos inmutables al Event Store.

## Arquitectura

```
QStash (cron cada X min)
  └─ POST /api/cron/ingestion/properties
       ├─ loginToInmovilla (Playwright + 2FA vía Composio)
       ├─ fetchAllProperties (API paginación Inmovilla)
       ├─ loadPreviousSnapshot (Neon: property_snapshots)
       ├─ computePropertyDiff
       │    ├─ PROPIEDAD_CREADA   → appendEvent
       │    ├─ PROPIEDAD_MODIFICADA → appendEvent
       │    └─ ESTADO_CAMBIADO    → appendEvent
       └─ saveCurrentSnapshot (upsert en property_snapshots)
```

## Campos que participan en el diff

| Campo | Tipo | Evento si cambia |
|-------|------|-----------------|
| `estado` | string | `ESTADO_CAMBIADO` |
| `precio` | number | `PROPIEDAD_MODIFICADA` |
| `metrosConstruidos` | number | `PROPIEDAD_MODIFICADA` |
| `habitaciones` | number | `PROPIEDAD_MODIFICADA` |
| `banyos` | number | `PROPIEDAD_MODIFICADA` |
| `ciudad` | string | `PROPIEDAD_MODIFICADA` |
| `zona` | string | `PROPIEDAD_MODIFICADA` |
| `fechaActualizacion` | string | `PROPIEDAD_MODIFICADA` |

Si `estado` cambia junto con otros campos, se emite `ESTADO_CAMBIADO` (que incluye los demás cambios en `otherChangedFields`).

### Metadata y trazabilidad (Event Store)

Cada evento incluye en `metadata` (y en `correlationId`) la información necesaria para auditar y detectar duplicados en reintentos de cron:

| Campo en metadata | Tipo | Uso |
|-------------------|------|-----|
| `source` | string | Siempre `"ingestion:properties"` |
| `cycleId` | string | UUID del ciclo (igual que `correlationId`) |
| `fingerprint` | string | SHA-256 del payload estable; sirve para idempotencia y alertas |
| `aggregateId` | string | Código de la propiedad |
| `eventType` | string | `PROPIEDAD_CREADA` \| `PROPIEDAD_MODIFICADA` \| `ESTADO_CAMBIADO` |
| `changedFields` | string[] | Campos que dispararon el cambio |

La publicación es **orden determinista** por `aggregateId` y tipo de evento dentro del mismo ciclo.

## Eventos emitidos

### PROPIEDAD_CREADA

Propiedad no existía en el snapshot previo.

```json
{
  "type": "PROPIEDAD_CREADA",
  "aggregateType": "PROPERTY",
  "aggregateId": "<codigo>",
  "payload": {
    "snapshot": { "codigo": "...", "ref": "...", "precio": 250000, "..." : "..." },
    "detectedAt": "2026-03-11T08:00:00.000Z"
  },
  "correlationId": "<cycleId>"
}
```

### PROPIEDAD_MODIFICADA

Cambio en campos del diff (sin cambio de estado).

```json
{
  "type": "PROPIEDAD_MODIFICADA",
  "aggregateType": "PROPERTY",
  "aggregateId": "<codigo>",
  "payload": {
    "before": { "precio": 250000, "zona": "Centro", "..." : "..." },
    "after": { "precio": 275000, "zona": "Centro", "..." : "..." },
    "changedFields": ["precio"],
    "detectedAt": "2026-03-11T08:00:00.000Z"
  }
}
```

### ESTADO_CAMBIADO

Cambio del campo `estado` (puede incluir otros cambios).

```json
{
  "type": "ESTADO_CAMBIADO",
  "aggregateType": "PROPERTY",
  "aggregateId": "<codigo>",
  "payload": {
    "previousEstado": "Activo",
    "newEstado": "Vendido",
    "otherChangedFields": ["precio"],
    "snapshot": { "..." : "..." },
    "detectedAt": "2026-03-11T08:00:00.000Z"
  }
}
```

En la tabla `events`, el campo `metadata` incluye `source`, `cycleId`, `fingerprint`, `aggregateId`, `eventType` y `changedFields` (ver sección anterior).

## Verificación operativa

Checklist para comprobar que los eventos fluyen a Neon tras un ciclo:

1. **Ejecutar un ciclo:** `npm run ingestion:properties` y anotar el `Ciclo ID` del resultado.
2. **Consultar por ciclo:** en Neon o con Prisma, filtrar `events` por `correlationId = <cycleId>`; debe haber tantos registros como "Eventos" indicados en el resumen del ciclo.
3. **Consultar por propiedad:** usar `getEventsByAggregate("PROPERTY", "<codigo>")` (desde código o API) para ver el historial de una propiedad.
4. **Consultar por posición:** usar `getEventsSince(position, { type: "PROPIEDAD_CREADA" })` para listar altas recientes.

Si en varios ciclos consecutivos `propertiesRead > 0` pero `eventsEmitted = 0`, revisar que no haya errores de conexión a Neon ni fallos silenciosos en `appendEvent`.

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `INMOVILLA_USER` | Si | Usuario de Inmovilla |
| `INMOVILLA_PASSWORD` | Si | Contraseña de Inmovilla |
| `INMOVILLA_OFFICE_KEY` | Si | Clave de oficina |
| `COMPOSIO_API_KEY` | Si | API key de Composio (para 2FA) |
| `COMPOSIO_USER_ID` | Si | User ID en Composio con conexion Gmail |
| `OPENAI_API_KEY` | Si | API key de OpenAI (agente 2FA) |
| `DATABASE_URL` | Si | Conexion a Neon (Prisma) |
| `CRON_SECRET` | Si (prod) | Token para autenticar el endpoint de cron |

## Ejecucion local

```bash
# Ejecutar un ciclo completo manualmente
npm run ingestion:properties

# Solo leer propiedades (sin diff ni eventos)
npm run inmovilla:read-properties
```

## Configuracion de QStash (produccion)

Crear un cron schedule en Upstash QStash apuntando al endpoint:

```
POST https://<dominio>/api/cron/ingestion/properties
Authorization: Bearer <CRON_SECRET>
```

Frecuencia: cada 5 minutos (`*/5 * * * *`).

## Tabla property_snapshots

Almacena el ultimo estado conocido de cada propiedad. Se usa exclusivamente para el diff entre ciclos.

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| `codigo` (PK) | string | ID unico de la propiedad en Inmovilla |
| `ref` | string | Referencia interna |
| `precio`, `estado`, etc. | varios | Campos normalizados de InmovillaProperty |
| `raw` | json | Datos completos tal como los devuelve Inmovilla |
| `firstSeenAt` | datetime | Primera vez que el worker vio esta propiedad |
| `lastSeenAt` | datetime | Ultima vez que el worker vio esta propiedad |

## Troubleshooting

| Problema | Causa probable | Solucion |
|----------|---------------|----------|
| Login falla con "No se encontro window.ps" | Sesion de Inmovilla no llego al panel | Verificar credenciales y que Inmovilla no este en mantenimiento |
| "No se encontro un correo 2FA reciente" | El correo 2FA no llego a tiempo | Verificar conexion Composio-Gmail y que el filtro de spam no bloquee correos de Inmovilla |
| Todos los eventos son PROPIEDAD_CREADA | Tabla property_snapshots vacia (primera corrida) | Comportamiento esperado en la primera ejecucion |
| Timeout en fetchAllProperties | Muchas propiedades o Inmovilla lento | Verificar conectividad; considerar aumentar timeouts |
| Error de Prisma en saveCurrentSnapshot | Conflicto de concurrencia | QStash no deberia disparar ciclos superpuestos; verificar frecuencia del cron |

## Tests

```bash
# Unit tests del diff (sin DB)
npx vitest run lib/workers/ingestion/__tests__/properties-diff.test.ts

# Unit tests del publicador de eventos (mock de appendEvent)
npx vitest run lib/workers/ingestion/__tests__/event-publisher.test.ts

# Integration tests del snapshot-repo (requiere DB)
npx vitest run lib/workers/ingestion/__tests__/snapshot-repo.test.ts

# Integration tests de emisión al Event Store (requiere DB)
npx vitest run lib/workers/ingestion/__tests__/properties-worker-events.test.ts

# Todos los tests
npm test
```
