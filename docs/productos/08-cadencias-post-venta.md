# Sistema de Cadencias Post-Venta

> Automatización que activa una secuencia temporal de comunicaciones tras el cierre de una operación: agradecimiento, soporte, reseñas, referidos y re-captación.

---

## Qué problema resuelve

Después de firmar, el cliente desaparece del radar. Nadie le pregunta si todo fue bien, nadie le pide una reseña cuando está satisfecho, nadie le sugiere que recomiende. Se pierde el momento de máxima satisfacción y se desperdicia un activo que ya confía en la agencia.

Este sistema **convierte cada cierre en un generador de ingresos futuros**: reseñas, referidos, y re-captación. Todo automático, todo en el momento justo.

---

## Qué aporta

| Métrica | Mejora estimada |
|---|---|
| Reseñas obtenidas | +20–30% |
| Operaciones vía referidos | +10–20% |
| Coste de captación | –15% |
| Valor del cliente a largo plazo | Mayor |

---

## Cómo funciona

### Disparador

El sistema detecta que una operación se ha cerrado (cambio de estado a "vendido", "firmada", etc.). Esto activa automáticamente toda la cadencia.

### Las 5 fases temporales

#### Fase 1 — Cierre inmediato (Día 0)

**Objetivo:** cerrar emocional y operativamente.

- Mensaje de agradecimiento personalizado por WhatsApp (nombre del cliente, tipo de operación, comercial asignado)
- Checklist interno de "operación cerrada correctamente"

#### Fase 2 — Soporte temprano (Día 3-7)

**Objetivo:** detectar problemas antes de que se conviertan en mala reseña.

- Mensaje: "¿Todo correcto con la entrega, llaves, suministros?"
- Enlace a guía práctica (cambio de suministros, empadronamiento, IBI)
- Si responde "Necesito ayuda" → se crea incidencia interna y **se pausa toda la cadencia**
- Si responde "Todo OK" → la cadencia continúa

#### Fase 3 — Reputación online (Día 10-14)

**Objetivo:** capturar reseñas cuando la satisfacción está alta.

- Solicitud de reseña por WhatsApp con enlace directo a Google Reviews
- **Regla de oro:** solo se envía si NO hay incidencias abiertas
- Recordatorio suave si no responde

#### Fase 4 — Activación de referidos (Día 21-30)

**Objetivo:** nuevos leads sin coste de captación.

- Mensaje: "Si conoces a alguien que esté pensando en comprar o vender, estaremos encantados de ayudarle."
- Enlace a formulario de referido (nombre, teléfono, notas)
- El referido se registra automáticamente y se asigna a un comercial

#### Fase 5 — Re-captación (90-180 días) *(planificado)*

**Objetivo:** convertir al cliente en activo recurrente.

Segmentación automática:
- **Comprador residencial:** "¿Cómo va la vivienda?" / "¿Te planteas vender?"
- **Inversor:** oportunidades off-market, rentabilidades
- **Vendedor:** valoración actualizada, evolución de precios

### Sistema de incidencias

Si el cliente reporta un problema en cualquier fase:
1. Se pausa toda la cadencia (no se piden reseñas ni referidos con un problema abierto)
2. Se crea una tarea interna para el equipo
3. Solo cuando se marca "resuelto" se reanuda la cadencia

### Referidos

Cada referido captado tiene un ciclo de vida propio:
- `PENDIENTE_ASIGNACION` → `ASIGNADO` → `CONTACTADO` | `DESCARTADO`
- Se vincula al comercial asignado
- Se trackea como fuente de lead para medir ROI de la post-venta

---

## Tecnología

- **Canal:** WhatsApp Cloud API (Meta) — todas las comunicaciones
- **Cadencias:** Jobs programados con ejecución diferida
- **Incidencias:** Eventos inmutables (abierta/resuelta) que controlan el flujo
- **Referidos:** Modelo propio con formulario público
- **Scanner:** Proceso periódico que verifica cadencias faltantes y las reprograma
