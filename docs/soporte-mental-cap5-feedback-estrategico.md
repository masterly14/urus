# M12 — Capa 5: feedback estratégico del coach (sin exponer conversaciones)

El bot de soporte mental sigue siendo confidencial para el comercial. La **Capa 5** solo expone al liderazgo **señales operativas agregadas** derivadas del Event Store (`MENTAL_MSG_*`): conteos, medias de `nivelEnergia` y frecuencia del flujo `bloqueo` según la clasificación estructurada del coach. **No se incluye el texto** de los mensajes del comercial ni del coach en las alertas.

## Qué se construyó

- **Escáner**: `lib/mental-health/strategic-feedback-scanner.ts` — agrega eventos por `waId`, resuelve `comercialId` vía payload o `mental_health_sessions`, fusiona por comercial y genera candidatos.
- **Cron**: `POST /api/cron/mental-health-strategic-alerts` — persiste en `dashboard_alerts` y notifica con `alertGeneric` (log + `ALERT_WHATSAPP_TO` si está definido). **No** replica el patrón de WhatsApp al comercial del cron de dashboard comercial.

## Tipos de alerta (`dashboard_alerts.type`)

| Tipo | Significado (agregado) |
|------|-------------------------|
| `mh_energy_low` | Media de `nivelEnergia` (1–5) baja en N clasificaciones del coach |
| `mh_bloqueo_recurrente` | Muchas clasificaciones con `flujo === "bloqueo"` en la ventana |
| `mh_sobrecarga_uso` | Muchos `MENTAL_MSG_RECIBIDO` en la ventana (uso intensivo del canal) |

## Variables de entorno

Documentadas en `.env.example` con prefijo `MENTAL_STRATEGIC_*` (ventana en días, deduplicación, umbrales de energía, bloqueo e intensidad de uso).

## Cómo probar

- Tests unitarios de agregación: `npm test -- strategic-feedback-scanner`
- Cron manual (requiere `CRON_SECRET`):

```bash
curl -sS -X POST "$APP_URL/api/cron/mental-health-strategic-alerts" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- UI CEO: `/platform/rendimiento/alertas` — filtros incluyen los tres tipos `mh_*`.

## Orquestación recomendada

Programar en QStash **2–3 veces por semana** (p. ej. lun/mié/vie 09:00 UTC), además del cron semanal de alertas comerciales.
