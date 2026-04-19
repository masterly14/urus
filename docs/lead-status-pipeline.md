# Lead Status Pipeline — Estado Interno del Lead

## Propósito

`DemandCurrent.leadStatus` es el campo de estado **propio del sistema Urus**, independiente de Inmovilla. Representa en qué etapa del pipeline comercial se encuentra cada demanda (lead de comprador), desde que se ingesta hasta que se cierra la operación.

> **Importante:** Inmovilla no se actualiza con estos estados. El campo `keysitu` en Inmovilla permanece fijo en `20` (Buscando) salvo que un usuario lo cambie manualmente en el CRM. La fuente de verdad del pipeline es **nuestra DB (Neon)**, no Inmovilla.

---

## Máquina de Estados

```
NUEVO
  │
  │  (primer WhatsApp recibido del comprador)
  ▼
CONTACTADO
  │
  │  (SELECCION_COMPRADOR con decision=ME_INTERESA)
  ▼
EN_SELECCION ──────────────────────────────────────────────────────┐
  │                                                                 │
  │  (VISITA_SOLICITADA — comprador expresa ME_ENCAJA)             │
  ▼                                                                 │
VISITA_PENDIENTE                                              VISITA_CANCELADA
  │                                                                 │
  │  (VISITA_COMPRADOR_ACEPTO — comprador acepta slot)             │
  ▼                                                                 │
VISITA_CONFIRMADA                                                   │
  │                                                                 │
  │  (VISITA_DATOS_RECOPILADOS — datos del visitante listos)       │
  ▼                                                                 │
VISITA_REALIZADA                                                    │
  │                                                                 │
  │  (CONTRATO_BORRADOR_GENERADO)                                  │
  ▼                                                                 │
EN_NEGOCIACION ◄────────────────────────────────────────────────────┘
  │
  │  (FIRMA_ENVIADA)
  ▼
EN_FIRMA
  │
  │  (FIRMA_COMPLETADA / OPERACION_CERRADA)
  ▼
CERRADO

─────────────────────────────
VISITA_PENDIENTE → PERDIDO   (VISITA_ESCALADA_MANUAL — sin resolución tras N rondas)
```

---

## Valores del Enum

| Valor | Descripción | Evento disparador |
|-------|-------------|-------------------|
| `NUEVO` | Demanda recibida de Inmovilla; sin contacto aún | `DEMANDA_CREADA` (default) |
| `CONTACTADO` | Primer WhatsApp recibido del comprador | `WHATSAPP_RECIBIDO` (solo si leadStatus=NUEVO) |
| `EN_SELECCION` | Comprador interactuando con propiedades/microsites | `SELECCION_COMPRADOR` con `decision=ME_INTERESA` |
| `VISITA_PENDIENTE` | Visita solicitada; coordinando horario con comercial | `VISITA_SOLICITADA` |
| `VISITA_CONFIRMADA` | Visita agendada en calendario | `VISITA_COMPRADOR_ACEPTO` |
| `VISITA_REALIZADA` | Datos del visitante recopilados; visita lista | `VISITA_DATOS_RECOPILADOS` |
| `EN_NEGOCIACION` | Post-visita: contrato o propuesta en proceso | `CONTRATO_BORRADOR_GENERADO` |
| `EN_FIRMA` | Firma digital enviada / en trámite | `FIRMA_ENVIADA` |
| `CERRADO` | Operación cerrada exitosamente | `FIRMA_COMPLETADA` / `OPERACION_CERRADA` |
| `PERDIDO` | Lead perdido (escalado tras N rondas sin acuerdo) | `VISITA_ESCALADA_MANUAL` |

---

## Implementación

### Schema (Prisma)

```prisma
enum LeadStatus {
  NUEVO
  CONTACTADO
  EN_SELECCION
  VISITA_PENDIENTE
  VISITA_CONFIRMADA
  VISITA_REALIZADA
  EN_NEGOCIACION
  EN_FIRMA
  CERRADO
  PERDIDO
}

model DemandCurrent {
  // ...
  leadStatus  LeadStatus @default(NUEVO)
  // ...
}
```

### Helper de actualización

`lib/projections/update-lead-status.ts` expone dos funciones:

| Función | Cuándo usar |
|---------|-------------|
| `updateDemandLeadStatus(demandId, status)` | Eventos cuyo payload contiene `demandId` directamente |
| `updateLeadStatusByOperationId(operationId, status)` | Eventos de nivel `Operacion` (contrato, firma, cierre) |

Ambas son **best-effort**: si la demanda no existe en `demands_current`, loguean una advertencia y no lanzan error.

### Handlers que actualizan el estado

| Handler | Evento | Nuevo estado |
|---------|--------|--------------|
| `whatsapp-nlu-handler.ts` | `WHATSAPP_RECIBIDO` | `CONTACTADO` (solo si estaba en `NUEVO`) |
| `seleccion-comprador-handler.ts` | `SELECCION_COMPRADOR` (ME_INTERESA) | `EN_SELECCION` |
| `visit-scheduling-event-handlers.ts` | `VISITA_SOLICITADA` | `VISITA_PENDIENTE` |
| `visit-scheduling-event-handlers.ts` | `VISITA_COMPRADOR_ACEPTO` | `VISITA_CONFIRMADA` |
| `visit-scheduling-event-handlers.ts` | `VISITA_DATOS_RECOPILADOS` | `VISITA_REALIZADA` |
| `visit-scheduling-event-handlers.ts` | `VISITA_ESCALADA_MANUAL` | `PERDIDO` |
| `visit-scheduling-event-handlers.ts` | `VISITA_CANCELADA` | `EN_SELECCION` |
| `contrato-borrador-handler.ts` | `CONTRATO_BORRADOR_GENERADO` | `EN_NEGOCIACION` |
| `firma-enviada-handler.ts` | `FIRMA_ENVIADA` | `EN_FIRMA` |
| `firma-completada-handler.ts` | `FIRMA_COMPLETADA` | `CERRADO` |
| `post-sale-handler.ts` | `OPERACION_CERRADA` | `CERRADO` |

---

## Por qué no actualizamos Inmovilla

El campo `demandas-keysitu` de Inmovilla representa la "situación" de la demanda en el CRM (20=Buscando, 23, 26=Cliente de Portal, 31). **No lo modificamos programáticamente** por las siguientes razones:

1. **Solo vía RPA**: Inmovilla no expone REST para cambiar el estado de demandas. Requiere simular la UI mediante `guardar.php`, lo que es frágil y costoso.
2. **Estados propios**: Los estados de Inmovilla (`keysitu`) no tienen correspondencia directa con las etapas del pipeline automatizado.
3. **Fuente de verdad**: Nuestro event store y `demands_current.leadStatus` son la fuente de verdad del pipeline. Inmovilla es la "bóveda" de datos legales y CRM del agente humano.
4. **Riesgo de corrupción**: Actualizar `keysitu` automáticamente podría confundir a los agentes en Inmovilla que usan ese campo manualmente.

Si en el futuro se necesita reflejar cambios en Inmovilla, se añadirá una operación `updateDemandStatus` en `writeToInmovilla` siguiendo el patrón de `updateDemandCriteria` (mismo `guardar.php` sin `SoyNuevo`, modificando `demandas-keysitu`).

---

## Consultas útiles

```sql
-- Distribución de leads por estado
SELECT "leadStatus", COUNT(*) as total
FROM demands_current
GROUP BY "leadStatus"
ORDER BY total DESC;

-- Leads en visita pendiente o confirmada
SELECT codigo, nombre, telefono, "comercialId", "leadStatus"
FROM demands_current
WHERE "leadStatus" IN ('VISITA_PENDIENTE', 'VISITA_CONFIRMADA')
ORDER BY "updatedAt" DESC;

-- Leads que no han avanzado de NUEVO en los últimos 7 días
SELECT codigo, nombre, "lastEventAt"
FROM demands_current
WHERE "leadStatus" = 'NUEVO'
  AND "lastEventAt" < NOW() - INTERVAL '7 days';
```
