# Motor de Priorización y Asignación de Leads

> Sistema que evalúa cada lead entrante en segundos, le asigna una prioridad numérica, lo enruta al mejor comercial disponible, y garantiza seguimiento automático si nadie responde.

---

## Qué problema resuelve

Entran leads de múltiples canales (portales, web, redes, referidos). Sin sistema, todos se tratan igual: el comercial que está libre los coge, o peor, nadie los coge a tiempo. Los leads calientes se enfrían, los fríos consumen tiempo, y no hay criterio objetivo para decidir quién atiende qué.

Este motor **clasifica, prioriza, asigna y hace seguimiento** de cada lead de forma automática. El comercial recibe en su WhatsApp exactamente lo que tiene que atender, con la urgencia correcta.

---

## Qué aporta

| Antes | Después |
|---|---|
| Todos los leads se tratan igual | Cada lead tiene un score 0-100 y un SLA |
| El comercial elige qué atender | El sistema asigna al mejor comercial disponible |
| Leads calientes se enfrían sin respuesta | SLA de 5 minutos para leads de score ≥80 |
| Sin seguimiento: se olvidan | Cadencias automáticas D+1, D+3, D+7 |
| Sin datos: "el mercado está mal" | Métricas objetivas de conversión por origen, comercial y segmento |

---

## Cómo funciona

### Paso 1 — Scoring (0-100)

Cada lead se evalúa con una fórmula ponderada de 3 dimensiones:

```
Score = 0.55 × Probabilidad de cierre + 0.30 × Valor económico + 0.15 × Urgencia
```

**Señales de comprador:**

| Señal | Efecto |
|---|---|
| Preaprobación hipotecaria | +25 puntos |
| Presupuesto definido | +15 |
| Plazo ≤ 30 días | +20 |
| Mensaje con detalles (zona, tipología) | +10 |
| Referido | +15 |
| "Solo estoy mirando" | −20 |

**Señales de propietario:**

| Señal | Efecto |
|---|---|
| Urgencia de venta | +20 |
| Precio cercano a mercado | +15 |
| Exclusiva aceptable | +15 |
| Documentación disponible | +10 |
| "Quiero probar sin agencia" | −25 |

El score es **explicable**: cada lead tiene la lista de razones que justifican su puntuación.

### Paso 2 — SLA automático

| Score | Nivel | SLA | Acción |
|---|---|---|---|
| ≥ 80 | CRITICAL | < 5 minutos | Notificación inmediata al comercial |
| 60–79 | HIGH | < 30 minutos | Notificación prioritaria |
| 40–59 | MEDIUM | < 2 horas | Tarea en cola |
| < 40 | LOW | Cadencia automática | Sin gasto de tiempo humano |

### Paso 3 — Routing inteligente

El sistema selecciona al mejor comercial disponible:

1. Filtra por **ciudad** del lead
2. Filtra por **disponibilidad** (carga actual < máximo)
3. Calcula score: **60% capacidad libre + 40% tasa de conversión histórica**
4. Bonus si la **especialidad** del comercial coincide con el tipo de lead
5. Asigna al de mayor score

Si no hay comercial disponible → el lead queda en cola con el motivo registrado.

### Paso 4 — Notificación

El comercial asignado recibe por WhatsApp:
- ID del lead y score
- Nivel de SLA y tiempo límite
- Ciudad y señales clave
- Enlace al panel para más detalles

### Paso 5 — Cadencias automáticas (leads fríos)

Para leads con score < 40, el sistema programa recordatorios automáticos al comercial:

| Día | Mensaje | Urgencia visual |
|---|---|---|
| D+1 | "1 día sin contacto" | Normal |
| D+3 | "3 días sin contacto" | Atención |
| D+7 | "7 días sin contacto — última alerta" | Urgente |

Si el comercial marca el lead como contactado en cualquier momento, todos los recordatorios pendientes se cancelan automáticamente.

### Red de seguridad

Un proceso periódico (cada 6-12 horas) revisa los últimos 200 leads y verifica que todos tengan sus cadencias programadas. Si alguno se "cayó" por un error técnico, se reprograman los recordatorios faltantes.

---

## Tecnología

- **Scoring:** Reglas deterministas en TypeScript (sin IA, predecible y auditable)
- **Routing:** Consulta a tabla de comerciales con capacidad y conversión
- **SLA:** Jobs programados con `availableAt` en cola de trabajo
- **Cadencias:** Jobs con ejecución diferida (D+1, D+3, D+7)
- **Notificaciones:** WhatsApp Cloud API (Meta)
