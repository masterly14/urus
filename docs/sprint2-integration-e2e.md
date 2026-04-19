# Integración End-to-End Sprint 2

Script de verificación que recorre la cadena completa **lead → cierre → post-venta → dashboards**, validando que todos los módulos del Sprint 2 interactúan correctamente.

## Ejecución

```bash
# Ejecución estándar (cleanup automático al terminar)
npm run sprint2:e2e

# Sin cleanup (para inspeccionar datos de test en Neon)
npx tsx scripts/test-sprint2-e2e.ts --no-cleanup
```

## Requisitos

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | **Sí** | Conexión a Neon (BD real) |
| `OPENAI_API_KEY` | No | Si existe, el paso 6 (feedback NLU) usa LangGraph real |
| `WHATSAPP_ACCESS_TOKEN` | No | Si existe, los pasos 3/6 envían mensajes reales |
| `STATEFOX_BEARER_TOKEN` | No | Si existe, el paso 5 consulta Statefox real |
| `CLOUDINARY_URL` | No | Si existe, el paso 9 sube documentos a Cloudinary |

Sin credenciales opcionales, el script ejecuta dry-run graceful y reporta SKIP en los sub-pasos que requieren el servicio externo.

**Nota:** la escritura en Inmovilla (RPA) **nunca** se ejecuta. El paso 7 verifica que el job `WRITE_TO_INMOVILLA` se encola correctamente, pero no lo procesa.

## Flujo verificado (12 pasos)

```
Setup → Comercial + DemandCurrent + DemandSnapshot en BD
  │
  ├─ 1. LEAD_INGESTADO → scoring + SLA + routing + NOTIFY_LEAD_WHATSAPP + FOLLOW_UP_LEAD
  ├─ 2. PROPIEDAD_CREADA → matching → MATCH_GENERADO + properties_current
  ├─ 3. MATCH_GENERADO → WA comprador + NOTIFY_LEAD_WHATSAPP al comercial
  ├─ 4. VISITA_EVALUADA → projection + CommercialVisitEvaluationFact
  ├─ 5. GENERATE_MICROSITE → MicrositeSelection + NOTIFY_MICROSITE_PENDING_VALIDATION
  ├─ 6. WHATSAPP_RECIBIDO → NLU → SELECCION_COMPRADOR + DEMANDA_ACTUALIZADA
  ├─ 7. DEMANDA_ACTUALIZADA → WRITE_TO_INMOVILLA + GENERATE_MICROSITE jobs
  ├─ 8. ESTADO_CAMBIADO "Reservada" → Operacion + GENERATE_CONTRACT_DRAFT
  ├─ 9. Contract Draft → CONTRATO_BORRADOR_GENERADO o DATOS_INCOMPLETOS
  ├─ 10. Firma simulada → FIRMA_ENVIADA + FIRMA_COMPLETADA handlers
  ├─ 11. ESTADO_CAMBIADO "Vendido" → OPERACION_CERRADA + cadencia M9
  └─ 12. Dashboard facts: CommercialLeadFact + CommercialOperationFact
```

## Detalle por paso

### Paso 1 — Lead Scoring

- Emite `LEAD_INGESTADO` con datos de comprador cualificado (preaprobación hipotecaria, presupuesto definido, plazo 15 días).
- Verifica: `PROCESS_EVENT` completado, `NOTIFY_LEAD_WHATSAPP` encolado, cadencia `FOLLOW_UP_LEAD` programada, `CommercialLeadFact` creado.

### Paso 2 — Property + Matching

- Publica `PROPIEDAD_CREADA` con un inmueble compatible con la demanda (Piso, Centro, Córdoba, 280k, 3 hab).
- Verifica: `properties_current` materializada, `MATCH_GENERADO` emitido (cruza contra la demanda del setup).

### Paso 3 — Match Notification

- Drena jobs de match.
- Verifica: `NOTIFY_LEAD_WHATSAPP` del match encolado para el comercial. Si hay token WA, el `sendMatchNotification` al comprador se ejecuta realmente.

### Paso 4 — Post-visita

- Emite `VISITA_EVALUADA` con interés "alto" y referencia al inmueble.
- Verifica: handler procesado, `CommercialVisitEvaluationFact` creado.

### Paso 5 — Microsite Generation

- Encola `GENERATE_MICROSITE` con criterios de la demanda.
- Verifica: `MicrositeSelection` creada con status `PENDING_VALIDATION`, job `NOTIFY_MICROSITE_PENDING_VALIDATION` encolado.
- Si no hay token Statefox, la selección puede no tener propiedades (SKIP graceful).

### Paso 6 — Buyer Feedback (NLU)

- Prepara `WhatsAppBuyerSession` y selección APPROVED.
- Emite `WHATSAPP_RECIBIDO` simulando texto del comprador.
- Verifica: `SELECCION_COMPRADOR` y/o `DEMANDA_ACTUALIZADA` emitidos tras NLU.
- Sin `OPENAI_API_KEY`, el NLU puede no producir output (SKIP).

### Paso 7 — Demanda Update Chain

- Verifica que `DEMANDA_ACTUALIZADA` del paso 6 generó jobs `WRITE_TO_INMOVILLA` (con patch de criterios) y `GENERATE_MICROSITE` (regeneración).

### Paso 8 — Smart Closing

- Emite `ESTADO_CAMBIADO` con `newEstado: "Reservada"`.
- Verifica: `Operacion` creada en BD, `GENERATE_CONTRACT_DRAFT` encolado.

### Paso 9 — Contract Draft

- Drena `GENERATE_CONTRACT_DRAFT`.
- Verifica: `CONTRATO_BORRADOR_GENERADO` (si hay datos completos) o `DATOS_INCOMPLETOS` (si faltan datos de comprador/vendedor). Ambos son caminos válidos.

### Paso 10 — Firma (simulada)

- Emite `FIRMA_ENVIADA` y `FIRMA_COMPLETADA` como eventos manuales (sin OTP real).
- Verifica: ambos handlers procesados sin error.

### Paso 11 — Operación Cerrada + Post-venta

- Emite `ESTADO_CAMBIADO` con `newEstado: "Vendido"`.
- Verifica: `OPERACION_CERRADA` emitido, `Operacion.estado = CERRADA_VENTA`, cadencia M9 encolada (`SEND_POST_SALE_MESSAGE`, `SEND_REVIEW_REQUEST`, `SEND_REFERRAL_REQUEST`, `START_POSTVENTA_CADENCE`).

### Paso 12 — Dashboard Facts

- Verifica existencia de `CommercialLeadFact` (del paso 1) y `CommercialOperationFact` (del paso 11) para confirmar que los datos analíticos fluyen correctamente.

## Interpretación de resultados

| Estado | Significado |
|---|---|
| **PASS** | El paso se ejecutó y las verificaciones pasaron |
| **SKIP** | El paso depende de un servicio externo sin credenciales o de un paso anterior que no completó |
| **FAIL** | Error inesperado o verificación fallida — revisar el detalle |

Un resultado limpio con solo `DATABASE_URL` muestra ~10-12 PASS y 0-2 SKIP (pasos que dependen de OpenAI/Statefox).

## Archivos relacionados

| Archivo | Descripción |
|---|---|
| `scripts/test-sprint2-e2e.ts` | Script principal |
| `lib/__tests__/pipeline-integration.test.ts` | Test Vitest del pipeline base (ingestión → proyección) |
| `lib/workers/consumer/__tests__/feedback-loop-e2e.test.ts` | Test Vitest del feedback loop NLU |
| `lib/dashboard/__tests__/dashboards-api-integration.test.ts` | Test Vitest de dashboards API |
| `docs/dashboard-integration-tests.md` | Documentación de tests de dashboards |
| `docs/microsite-feedback-loop.md` | Documentación del feedback loop |

## Cleanup

Por defecto, al terminar el script borra todos los registros creados durante la ejecución (eventos, jobs, proyecciones, facts, selecciones, sesiones WA, operaciones, comercial de test).

Usar `--no-cleanup` para mantener los datos y poder inspeccionarlos en Neon.
