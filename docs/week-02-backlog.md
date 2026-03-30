# Backlog ejecutable — Semana 2

Fecha: 2026-03-15
Contexto: salida de Demo Week 1 (sin bloque de demo en vivo).

## Hallazgos rapidos de investigacion

- No hay implementacion productiva de LangGraph en `lib/` ni `app/api/` todavia; Semana 2 arranca desde baseline.
- WhatsApp aparece solo en planificacion/documentacion, sin servicio ni webhook implementados en codigo.

## Prioridades para Dia 7 (M4)

### P0 - Bloqueantes de arranque

1. Seleccionar proveedor de WhatsApp Business (`360dialog` o `Twilio`) y confirmar credenciales de sandbox.
2. Definir contrato de envio para `sendWhatsAppMessage(to, template, variables)`.
3. Crear endpoint `POST /api/whatsapp/send` con validacion de payload e idempotencia basica.

### P1 - Flujo entrante y eventos

1. Crear endpoint `POST /api/whatsapp/webhook` con verificacion de firma.
2. Parsear mensajes entrantes y emitir evento de dominio `WHATSAPP_RECIBIDO`.
3. Persistir metadatos minimos de trazabilidad (`messageId`, `from`, `timestamp`, `provider`).

### P1 - Baseline LangGraph

1. Definir estado inicial del grafo (lead, score, canal, SLA, siguiente accion).
2. Crear primer flujo: `lead_ingestado -> score_reglas -> routing -> notificacion_whatsapp`.
3. Determinar estrategia de persistencia de ejecucion (Neon) y reintentos.

### P2 - Calidad y operacion

1. Tests unitarios de envio WhatsApp (mock de proveedor).
2. Tests de integracion de webhook + emision de evento.
3. Dashboards minimos de observabilidad por ciclo (tiempo, errores, reintentos).

## Dependencias y prerequisitos

- Variables de entorno disponibles en `.env.example` para proveedor WA elegido.
- Secretos de webhook provisionados en entorno de desarrollo.
- Convenio de templates de negocio (matching, seguimiento, validacion).
- Definicion de SLA objetivo para mensajes salientes por score.

## Criterio de "Done" de inicio de semana

- Envio y recepcion de un mensaje de prueba funcionando end-to-end.
- Evento `WHATSAPP_RECIBIDO` visible en Event Store.
- Flujo base de LangGraph definido con estado y transiciones documentadas.
