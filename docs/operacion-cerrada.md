# Operación Cerrada — Definición y Mecanismo

## Qué es una operación cerrada

Una **operación cerrada** es una propiedad en Inmovilla cuyo campo `estadoficha` transiciona a un estado que indica cierre definitivo (venta, alquiler o traspaso). El sistema detecta este cambio automáticamente via el Ingestion Worker y emite el evento `OPERACION_CERRADA` en el Event Store de Neon.

Este evento es el **disparador universal** de toda la cadena post-venta (M9): agradecimiento, soporte, reseñas, referidos y re-captación.

---

## Fuente de datos: enum `estadoficha` de Inmovilla

El campo `estadoficha` es un enum numérico de la API REST de Inmovilla (`GET /enums/?tipos=estadoficha`). Cada valor tiene un nombre textual que el Ingestion Worker normaliza al campo `estado` del dominio.

### Catálogo completo (33 valores)

Obtenido con `npx tsx scripts/dump-estadoficha.ts`:

| valor | nombre              | Es cierre |
|------:|---------------------|:---------:|
|     1 | Libre               |           |
|     2 | Alquilada           |     SI    |
|     3 | Vendida             |     SI    |
|     4 | Señalizada          |           |
|     5 | No Libre            |           |
|     6 | Traspaso            |     SI    |
|     7 | Reservado           |           |
|     8 | En Trámites         |           |
|     9 | Sólo Seguimiento    |           |
|    10 | Alquilada por Otros |     SI    |
|    11 | Vendida por Otros   |     SI    |
|    12 | Solo Publicar       |           |
|    13 | Alquilada MLS       |     SI    |
|    14 | Vendida MLS         |     SI    |
|    15 | Okupada             |           |
|    16 | Alquiler Social     |           |
|    17 | Tapiada             |           |
|    18 | Ofertada            |           |
|    19 | Contrato Arras      |           |
|    20 | Fin de Encargo      |           |
|    21 | Vendida Particular  |     SI    |
|    22 | Alquilada Particular|     SI    |
|    23 | Descartada          |           |
|    32 | Es inmobiliaria     |           |
|    34 | Sin Revisar         |           |
|    35 | Fuera de Mercado    |           |
|    36 | Descartado          |           |
|    37 | Ya No Venden        |           |
|    38 | Ya No Alquilan      |           |
|    40 | Reservada MLS       |           |
|    41 | Ofertada MLS        |           |
|    42 | Pendiente de Firma  |           |
|    43 | Fuera de Mercado    |           |

**9 de 33** estados representan un cierre. Los 24 restantes son estados activos, intermedios o de baja.

---

## Cómo normaliza el estado el Ingestion Worker

El campo `estado` del dominio (`InmovillaProperty.estado`) se rellena según la vía de ingesta:

- **REST** (`lib/inmovilla/rest/properties.ts`): `estadoficha ?? lisestado ?? (nodisponible ? "No disponible" : "Disponible")`
- **Legacy** (`lib/inmovilla/api/properties.ts`): `lisestado` del mapa de paginación

`estadoficha` contiene el nombre textual resuelto ("Vendida", "Alquilada", etc.), no el ID numérico.

---

## Detección automática: `isClosedOperation`

Archivo: `lib/post-sale/closed-operation.ts`

La detección usa 3 keywords con comparación case-insensitive + `.includes()`:

| Keyword      | Estados que cubre                                                        |
|-------------|--------------------------------------------------------------------------|
| `"vendid"`   | Vendida, Vendida por Otros, Vendida MLS, Vendida Particular            |
| `"alquilad"` | Alquilada, Alquilada por Otros, Alquilada MLS, Alquilada Particular   |
| `"traspaso"` | Traspaso                                                                |

Patrón idéntico a `isSmartClosingTrigger` en `smart-closing-handler.ts`.

### Estados que NO disparan cierre (decisiones de diseño)

- **Contrato Arras / Reservado / Reservada MLS / Señalizada / Pendiente de Firma**: son estados intermedios del proceso de cierre; disparan Smart Closing (generación de contrato), no post-venta.
- **Fin de Encargo / Descartada / Descartado / Ya No Venden / Ya No Alquilan**: la propiedad sale del mercado sin cierre comercial; no genera post-venta.
- **Alquiler Social**: no es una operación comercial estándar.

---

## Flujo completo

```
Inmovilla → estadoficha cambia (ej. 1→3: Libre → Vendida)
  │
  ▼
Ingestion Worker (polling REST)
  │  computePropertyDiff() detecta campo "estado" cambiado
  │  publishEventsForDiff() → ESTADO_CAMBIADO
  │
  ▼
Consumer: handleEstadoCambiado (smart-closing-handler.ts)
  ├── UPDATE_PROPERTY_PROJECTION (siempre)
  ├── GENERATE_CONTRACT_DRAFT (si isSmartClosingTrigger: reserva/arras/señal)
  └── isClosedOperation(newEstado)?
        │
        ├── SI → appendEvent(OPERACION_CERRADA) + PROCESS_EVENT
        │         aggregateType: OPERACION
        │         aggregateId: propertyCode
        │         payload: { previousEstado, newEstado, closedAt, ... }
        │
        └── NO → nada adicional

Consumer: handleOperacionCerrada (placeholder → futuras cadencias M9)
  └── Cadencias D0, D3-7, D10-14, D21-30, D90-180 (por implementar)
```

---

## Archivos involucrados

| Archivo | Rol |
|---------|-----|
| `lib/post-sale/closed-operation.ts` | `CLOSED_OPERATION_KEYWORDS` + `isClosedOperation()` |
| `lib/workers/consumer/smart-closing-handler.ts` | `handleEstadoCambiado` — emite `OPERACION_CERRADA` |
| `lib/workers/consumer/handlers.ts` | Registra placeholder para `OPERACION_CERRADA` |
| `prisma/schema.prisma` | `EventType.OPERACION_CERRADA` + `AggregateType.OPERACION` |
| `scripts/dump-estadoficha.ts` | Script para obtener el catálogo real de Inmovilla |
| `lib/post-sale/__tests__/closed-operation.test.ts` | 37 tests cubriendo los 33 estados reales |
| `lib/post-sale/__tests__/closed-operation-handler.test.ts` | Tests del handler ampliado |

---

## Cómo actualizar si Inmovilla añade nuevos estados

1. Ejecutar `npx tsx scripts/dump-estadoficha.ts` para ver el catálogo actualizado.
2. Evaluar si el nuevo estado representa un cierre.
3. Si es cierre: añadir keyword a `CLOSED_OPERATION_KEYWORDS` en `lib/post-sale/closed-operation.ts`.
4. Añadir test en `lib/post-sale/__tests__/closed-operation.test.ts`.
