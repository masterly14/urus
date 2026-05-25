# Auditoria de Cruces y Microsites

## Objetivo

Esta auditoria sirve para diagnosticar, sin mutar datos, el flujo que empieza cuando llega una demanda nueva y termina en cruces internos, evaluacion de cobertura y posible generacion/envio de microsite.

El caso principal que cubre es distinguir si ver `30` cruces en la pantalla es solo la paginacion inicial de `/platform/matching/cruces` o si el total real de `MATCH_GENERADO` tambien esta estancado.

## Script

Archivo principal:

- `scripts/audit-cruces-microsites.ts`

Comandos:

```bash
npx tsx scripts/audit-cruces-microsites.ts --days 7
npx tsx scripts/audit-cruces-microsites.ts --demand DEM-12345 --days 30
npx tsx scripts/audit-cruces-microsites.ts --since 2026-05-01T00:00:00.000Z --limit 50 --json
```

Parametros:

- `--demand` / `--demand-id`: audita una demanda concreta por `DemandCurrent.codigo`.
- `--days`: ventana relativa desde ahora. Por defecto, `7`.
- `--since`: ventana absoluta ISO. Si se pasa, prevalece sobre `--days`.
- `--limit`: numero de demandas recientes a auditar cuando no se pasa `--demand`. Por defecto, `20`.
- `--json`: imprime el reporte estructurado completo.

El script carga `.env` con `dotenv/config` y usa `DATABASE_URL`, igual que los workers reales. No encola jobs, no ejecuta handlers, no llama a Statefox, no envia WhatsApp y no genera microsites.

## Que Lee

Fuentes read-only consultadas:

- `events`: `DEMANDA_CREADA`, `DEMANDA_MODIFICADA`, `DEMANDA_ACTUALIZADA`, `MATCH_GENERADO`, `SELECCION_VALIDADA`, `SELECCION_COMPRADOR` y `WHATSAPP_ENVIADO`.
- `job_queue`: `PROCESS_EVENT`, `MATCH_DEMAND_AGAINST_INTERNAL`, `EVALUATE_DEMAND_COVERAGE`, `GENERATE_MICROSITE` y `SEND_MICROSITE_TO_BUYER`.
- `demands_current`: estado proyectado y criterios de elegibilidad de la demanda.
- `microsite_selections`: selecciones creadas, estado, origen, stock y dedup de coverage.
- `rematch_runs`: ultimos rematches manuales para separar el flujo automatico del flujo manual.
- Conversaciones WhatsApp: eventos `WHATSAPP_RECIBIDO` / `WHATSAPP_ENVIADO` con `aggregateType="WHATSAPP_CONVERSATION"`, asociados por `payload.demandId` y por telefono normalizado (`aggregateId`/`waId`).

## Interpretacion del 30

La pantalla de cruces carga inicialmente:

```text
/api/matching/cruces?limit=30
```

Por eso, el reporte separa:

- `dbTotalMatchGenerado`: total real en `events`.
- `firstPageVisibleCount`: cantidad que veria la primera pagina de la UI.
- `firstHundredVisibleCount`: cantidad disponible al pedir hasta 100.
- `hasMoreThanThirty`: confirma si hay mas de 30 eventos reales.

Si `dbTotalMatchGenerado > 30`, el numero visible no prueba que el matching este parado: puede ser simplemente la pagina inicial. Si `dbTotalMatchGenerado` tambien esta fijo en 30, entonces hay que mirar los cortes por demanda y la cola.

## Conversaciones vs Cruces

La UI de `/platform/conversaciones` no lista cruces. Lista conversaciones agrupadas por `waId` desde eventos:

```text
aggregateType = WHATSAPP_CONVERSATION
type IN (WHATSAPP_RECIBIDO, WHATSAPP_ENVIADO)
```

Por tanto, `178` eventos `MATCH_GENERADO` no implican `178` conversaciones visibles. Puede haber muchos cruces para una misma demanda/telefono, cruces que solo notifican al comercial, cruces del flujo `auto_demand_*` que no envian WhatsApp directo al comprador, o jobs de envio fallidos antes de crear `WHATSAPP_ENVIADO`.

El reporte incluye:

- `conversationsUi.totalConversationWaIds`: numero real de conversaciones agrupadas por telefono.
- `conversationsUi.outboundMessages` e `inboundMessages`: mensajes reales trazados en el Event Store.
- `demands[].whatsappMessages`: mensajes enviados/recibidos asociados a cada demanda por `payload.demandId` o por telefono normalizado.
- `matchReason`: indica si el mensaje se encontro por `payload.demandId`, por `aggregateId.phone`, o por ambos.

## Elegibilidad de una Demanda

El auditor replica las comprobaciones de elegibilidad sin ejecutar matching:

- `estadoId` debe estar en `ACTIVE_DEMAND_STATES`.
- `tipoOperacion` debe existir para los jobs automaticos de demanda nueva.
- Debe haber criterios utiles: zona, tipo, presupuesto, metros o habitaciones.
- El telefono no bloquea la generacion de cruces, pero si afecta al envio al comprador.

Los blockers aparecen como causa directa. Las warnings indican que el flujo podria avanzar, pero con riesgo de no enviar o no generar una seleccion util.

## Arbol de Decision

1. `dbTotalMatchGenerado > 30`: revisar paginacion/UI antes de asumir fallo de matching.
2. Hay `PENDING` o `IN_PROGRESS` antiguos en jobs criticos: revisar si el consumer esta ejecutandose (`npm run consumer`) y si hay locks stale.
3. Hay `FAILED` o `DEAD_LETTER`: revisar `lastError` del job en el reporte.
4. La demanda no tiene `DEMANDA_CREADA` en la ventana: revisar ingestion de demandas antes del consumer.
5. Existe `DEMANDA_CREADA`, pero no `MATCH_DEMAND_AGAINST_INTERNAL`: revisar el `PROCESS_EVENT` del evento de demanda.
6. Existe `MATCH_DEMAND_AGAINST_INTERNAL`, pero no `MATCH_GENERADO`: puede ser dedup por delta menor a 5, score bajo, filtros duros o ausencia de propiedades elegibles.
7. Hay `MATCH_GENERADO`, pero no `EVALUATE_DEMAND_COVERAGE`: revisar follow-up jobs del handler de matching interno.
8. Hay coverage, pero no microsite: puede estar cubierto por cartera interna, haber dedup de coverage reciente, estar desactivada la busqueda externa (`ENABLE_EXTERNAL_PORTFOLIO_SEARCH`) o no haber stock.
9. Hay microsite creado, pero no `APPROVED`: revisar `OPENAI_API_KEY` y fallos del job `GENERATE_MICROSITE`.
10. Hay microsite aprobado, pero no envio: revisar `SEND_MICROSITE_TO_BUYER`, telefono resuelto, plantilla WhatsApp y `NEXT_PUBLIC_APP_URL`.

## Campos Clave del Reporte

- `overallFindings`: resumen accionable de las causas probables.
- `crucesUiVsDb`: comparativa entre paginacion visible y conteo real.
- `criticalJobs.statusByType`: estado agregado de la cola.
- `criticalJobs.oldestPending`: primer indicio de worker parado o cola bloqueada.
- `demands[].eligibility`: blockers y warnings por demanda.
- `demands[].likelyCut`: punto mas probable donde se corto el flujo.
- `demands[].events.matchSourceBreakdown`: separa `auto_demand_creada`, `auto_demand_modificada`, `rematch_manual`, `rematch_inline` y legacy.
- `demands[].microsites.recentCoverageDedup`: confirma si coverage pudo omitir un microsite por cooldown.
- `demands[].whatsappMessages`: confirma si hubo mensajes trazados para la demanda y por que clave se asociaron.

## Alcance y Seguridad

El auditor es deliberadamente read-only:

- No usa `enqueueJob`.
- No llama a `appendEvent`.
- No invoca `matchPropertiesToDemand` ni `generateMicrositeSelection`.
- No contacta APIs externas.
- No envia mensajes WhatsApp.

Si el reporte identifica una causa, la correccion debe hacerse en una tarea separada: este script solo produce evidencia.
