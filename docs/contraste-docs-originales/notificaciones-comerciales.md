# Flujo de Notificaciones a Comerciales

> Documento técnico que cubre los distintos canales de notificación al comercial implementados en el sistema. No tiene documento original dedicado en `docs-originales/`.

---

## Contexto

El sistema notifica a los comerciales en múltiples puntos del flujo de negocio, siempre vía **WhatsApp Cloud API** (integración directa con Meta, sin BSP). Las notificaciones se envían desde `lib/whatsapp/send.ts` (1082 líneas, 20+ funciones de envío).

---

## Catálogo de Notificaciones al Comercial

### Por Lead Scoring (M3)

| Notificación | Trigger | Contenido |
|---|---|---|
| Lead asignado | `NOTIFY_LEAD_WHATSAPP` | ID, score, SLA, ciudad, señales |
| Follow-up D+1 | `FOLLOW_UP_LEAD` step 1 | Recordatorio: 1 día sin contacto |
| Follow-up D+3 | `FOLLOW_UP_LEAD` step 2 | Recordatorio: 3 días sin contacto |
| Follow-up D+7 | `FOLLOW_UP_LEAD` step 3 | Último aviso: 7 días sin contacto |

### Por Matching (M5)

| Notificación | Trigger | Contenido |
|---|---|---|
| Match generado | `handleMatchGenerado()` | Propiedad + demanda cruzadas + score |

### Por Microsite (M6-M7)

| Notificación | Trigger | Contenido |
|---|---|---|
| (Histórico) Validación pendiente | `NOTIFY_MICROSITE_PENDING_VALIDATION` | Flujo retirado: enlace `/validar-seleccion/{token}` + SLA 2h |
| (Histórico) Escalado validación | Cron SLA microsite | Flujo retirado |

### Por Pricing (M7)

| Notificación | Trigger | Contenido |
|---|---|---|
| Informe de pricing | `NOTIFY_PRICING_WHATSAPP` | Semáforo, gap%, enlace al informe |

### Por Smart Closing (M8)

| Notificación | Trigger | Contenido |
|---|---|---|
| Datos incompletos | `NOTIFY_CONTRACT_DATA_INCOMPLETE` | Campos faltantes para generar contrato |
| Firma completada | `FIRMA_COMPLETADA` | Confirmación de firma exitosa |
| Firma rechazada | `FIRMA_RECHAZADA` | Firmante declinó el documento |
| SLA firma escalado | `FIRMA_SLA_ESCALADO` | 5 días sin firma → escalado |
| Recordatorio firma | `NOTIFY_SIGNATURE_REMINDER` | +1, +3, +5 días al firmante |

### Por Post-Venta (M9)

| Notificación | Trigger | Contenido |
|---|---|---|
| Incidencia abierta | `INCIDENCIA_POSTVENTA_ABIERTA` | Cliente reporta problema |
| Referido capturado | `REFERIDO_CAPTURADO` | Nuevo referido registrado |

---

## Plantillas WhatsApp (Meta Business Manager)

Todas las notificaciones que inician conversación (fuera de la ventana de 24h) requieren **plantillas aprobadas** en Meta Business Manager. Categoría `UTILITY`, idioma `es_ES`.

### Plantillas Documentadas

| Nombre en Meta | Uso | Variables |
|---|---|---|
| `contrato_firma_recordatorio_d1` | Recordatorio firma día +1 | nombre, tipo doc, referencia, URL firma |
| `contrato_firma_recordatorio_d3` | Recordatorio firma día +3 | (mismo) |
| `contrato_firma_recordatorio_d5` | Recordatorio firma día +5 | (mismo) |
| `contrato_firma_sla_escalado` | Escalado firma sin completar | referencia, tipo doc, URL seguimiento |
| `lead_asignado` | Lead asignado (futuro) | leadId, score, slaLevel |

### Mensajes de Texto (dentro de ventana 24h)

En desarrollo/demos, varias notificaciones usan mensajes de texto simples (requieren que el comercial haya iniciado conversación en las últimas 24h). En producción se migrarán a plantillas aprobadas.

---

## Implementación Técnica

### Patrón de Envío

Todas las notificaciones siguen el mismo patrón:

1. **Job en cola** (`JobQueue`) con payload tipado
2. **Handler del consumer** resuelve teléfono del comercial
3. **Función de envío** en `lib/whatsapp/send.ts`
4. **Registro** de evento en Neon (`WHATSAPP_ENVIADO`)

### Resolución del Teléfono del Comercial

Dos estrategias según el contexto:

| Estrategia | Función | Uso |
|---|---|---|
| Por propiedad | `resolveAgentPhoneByProperty()` | Pricing, smart closing |
| Por asignación directa | Payload del job contiene `agentId` | Lead scoring, matching |

`resolveAgentPhoneByProperty()` consulta `PropertySnapshot.agente` → busca en `Comercial` por nombre.

### Archivos Clave

| Archivo | Función |
|---|---|
| `lib/whatsapp/send.ts` | 20+ funciones de envío tipadas |
| `lib/whatsapp/client.ts` | Cliente HTTP para WhatsApp Cloud API |
| `lib/routing/resolve-property-agent.ts` | Resolución de comercial por propiedad |
| `lib/routing/agent-repo.ts` | Consulta del pool de comerciales |
