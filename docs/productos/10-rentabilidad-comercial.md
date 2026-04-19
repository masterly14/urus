# Panel de Rentabilidad por Comercial

> Sistema de gobierno del equipo comercial que mide rendimiento real por persona, clasifica automáticamente perfiles, detecta ineficiencias, y genera alertas y recomendaciones accionables.

---

## Qué problema resuelve

"Trabajo mucho pero el mercado está mal." Sin datos objetivos, esa frase no se puede rebatir. No se sabe quién rinde, quién no, por qué, ni qué hacer al respecto. Las decisiones de formación, redistribución o desvinculación se toman por sensación.

Este panel **convierte la gestión del equipo en ciencia**: métricas objetivas, clasificación automática, alertas tempranas, y recomendaciones concretas por perfil.

---

## Qué aporta

| Sin panel | Con panel |
|---|---|
| Se gestiona por sensaciones | Se gestiona por datos |
| "Vende más" como feedback | "Tu tasa de contacto está por debajo del equipo" como feedback |
| Se detecta el problema cuando ya costó dinero | Alertas en 2 semanas de caída |
| Top performers invisibles | Identificados y replicables |
| Bajo rendimiento tolerado por inercia | Plan de mejora con KPIs claros y plazo |

---

## Métricas que calcula automáticamente

| Métrica | Qué mide |
|---|---|
| Leads asignados | Volumen de trabajo recibido |
| Leads contactados | Actividad real de seguimiento |
| Leads perdidos por falta de seguimiento | Oportunidades desperdiciadas |
| Visitas realizadas | Actividad de campo |
| Cierres | Resultado final |
| Facturación estimada | Impacto económico |
| Conversión lead → visita | Eficiencia de contacto |
| Conversión visita → cierre | Eficiencia de cierre |
| Revenue por lead asignado | Rentabilidad de la asignación |
| Días promedio hasta cierre | Velocidad operativa |
| Tasa de pérdida de leads | Indicador de gestión |

Todas se calculan automáticamente desde los eventos del sistema. **Sin inputs manuales.**

---

## Clasificación automática de perfiles

Cada comercial se clasifica matemáticamente (no subjetivamente) en uno de 4 perfiles:

| Perfil | Características | Acción recomendada |
|---|---|---|
| **Top performer** | Alta conversión, alta facturación, buen uso del sistema | Asignar leads de mayor valor, replicar su método |
| **Productivo ineficiente** | Mucha actividad, baja conversión | Revisar proceso de cierre, ajustar tipo de lead |
| **Dependiente del lead caliente** | Solo cierra leads de score muy alto | Entrenar en leads medianos, diversificar asignación |
| **Bajo rendimiento estructural** | Todas las métricas por debajo de la media | Plan de mejora con KPIs claros, decisión a 30-60 días |

La clasificación se calcula con scores normalizados por perfil, comparando al comercial contra la media del equipo. Se persiste con confidence y snapshot de métricas.

---

## Sistema de alertas

| Tipo de alerta | Condición | Severidad |
|---|---|---|
| **Caída de rendimiento** | Cierres o revenue caen ≥2 semanas seguidas | Warning → Critical |
| **SLA incumplido (leads)** | Lead sin contacto tras umbral de horas | Critical |
| **SLA incumplido (firma)** | Firma pendiente pasado el plazo | Warning |
| **Desviación del equipo** | Métrica del comercial >2σ por debajo de la media | Warning |

Las alertas se generan automáticamente por un scanner periódico. Se notifican y se pueden resolver desde el panel.

---

## Vistas por rol

| Rol | Qué ve |
|---|---|
| **CEO** | Ranking completo, comparativa entre ciudades, coste de oportunidad |
| **Jefe de zona** | Rendimiento individual de su equipo, alertas, evolución mensual |
| **Comercial** | Su rendimiento vs media, objetivo mensual, qué métrica mejorar |

El comercial no ve datos de otros. El CEO ve todo.

---

## Comunicación al comercial

Nunca se dice: "Tienes que vender más."

Se dice:
- "Tu tasa de contacto está por debajo del equipo."
- "Estás perdiendo leads por no llamar en las primeras 2 horas."
- "Tu cierre mejora cuando el lead viene de referido."

El comercial sabe: qué falla, cómo mejorarlo, cómo se le va a medir.

---

## Tecnología

- **Datos:** Tablas de hechos materializadas desde el Event Store (leads, visitas, evaluaciones, operaciones)
- **Queries:** SQL analítico con joins sobre tablas de hechos + tabla de comerciales
- **Clasificación:** Algoritmo de scoring por perfiles con umbrales configurables
- **Alertas:** Scanner periódico con deduplicación y persistencia
- **UI:** Panel con ranking, detalle por comercial, evolución semanal (12 semanas), feed de alertas
