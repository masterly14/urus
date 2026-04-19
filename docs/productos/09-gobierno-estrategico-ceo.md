# Panel de Gobierno Estratégico del CEO

> Sistema de inteligencia ejecutiva que permite al CEO ver el estado completo de la empresa en 2 minutos, recibir diagnósticos automáticos con recomendaciones, y tomar decisiones de expansión basadas en datos.

---

## Qué problema resuelve

El CEO necesita saber cómo va la empresa sin preguntar a nadie. Hoy depende de reportes manuales, sensaciones de los jefes de zona, y reuniones para enterarse de lo que pasa. Cuando detecta un problema, ya es tarde.

Este sistema **convierte al CEO en un estratega con radar**: ve el estado en tiempo real, recibe alertas antes de que los problemas exploten, y obtiene recomendaciones accionables generadas por IA.

---

## Qué aporta

| Sin sistema | Con sistema |
|---|---|
| El CEO reacciona | El CEO anticipa |
| Decisiones por intuición | Decisiones por datos |
| Espera al cierre de mes para actuar | Actúa en tiempo real |
| Expansión como apuesta | Expansión como consecuencia lógica |
| Microgestión obligada | Control estratégico sin asfixiar |

---

## Las 6 capas del sistema

### Capa 1 — Visión ejecutiva en tiempo real

**El CEO sabe en 2 minutos cómo está la empresa.**

KPIs globales con semáforo verde/amarillo/rojo:

| Indicador | Qué mide | Semáforo |
|---|---|---|
| **Facturación** | Revenue real vs objetivo | Verde ≥80%, Amarillo ≥60%, Rojo <60% |
| **Equipo** | Alertas abiertas + carga de trabajo | Verde = equipo sano, Rojo = sobrecarga o alertas masivas |
| **Expansión** | Cash + margen + estabilidad de revenue | Verde = listo para expandir, Rojo = proteger |
| **Costes** | Ratio coste operativo / revenue | Verde <60%, Rojo ≥80% |

Además: facturación mensual/trimestral, EBITDA, margen por operación, cash disponible, capacidad de reinversión, histórico de 6 meses.

### Capa 2 — Rendimiento por ciudad y persona

**Entiende dónde se genera y dónde se pierde dinero.**

Vista por ciudad (Córdoba / Málaga / Sevilla):
- Comerciales activos y carga media
- Propiedades activas
- Operaciones y facturación del mes
- Rentabilidad por comercial
- Coste de oportunidad (leads perdidos + capacidad ociosa)

El sistema responde automáticamente: ¿faltan comerciales? ¿Sobran? ¿Dónde?

### Capa 3 — Estado del equipo humano *(planificado)*

**Protege el activo más valioso: las personas.**

Métricas agregadas (sin exponer conversaciones privadas):
- Nivel de uso del bot de soporte mental
- Patrones de bloqueo por zona
- Riesgo de burnout
- Estabilidad del equipo

El CEO ve riesgos **estructurales**, no intimidades.

### Capa 4 — Diagnóstico automático con IA

**El sistema deja de mostrar datos y empieza a pensar.**

Ejemplos de recomendaciones generadas:
- "Córdoba: carga media por comercial > umbral → **contratar 1–2 comerciales**"
- "Málaga: conversión alta, carga baja → **aumentar captación**"
- "Sevilla: buen volumen, bajo cierre → **intervenir proceso de cierre**"

Cada recomendación incluye: datos de soporte, acción sugerida, impacto esperado, y nivel de confianza.

### Capa 5 — Motor de expansión geográfica

**Decide CUÁNDO y DÓNDE expandirse.**

El sistema evalúa si la empresa está lista para abrir en una nueva ciudad:
- Cash disponible suficiente
- Margen operativo estable
- Revenue por encima de objetivos
- Procesos probados y replicables

Genera un "readiness score" y recomendaciones concretas:
> "Valencia cumple criterios. Lanzamiento recomendado en 90 días con 3 comerciales."

### Capa 6 — Control financiero y reinversión

**El CEO sabe cuánto puede arriesgar sin poner en peligro la empresa.**

Control automático de costes fijos, variables, coste por operación, ROI de automatizaciones. Recomendaciones de cuánto reinvertir, en qué, y cuándo frenar.

---

## Cómo se alimenta

| Fuente | Datos |
|---|---|
| Operaciones cerradas | Revenue, volumen, días hasta cierre |
| Leads y visitas | Actividad comercial por persona y ciudad |
| Alertas del dashboard comercial | Estado del equipo |
| Operaciones activas | Pipeline en curso |
| Snapshot financiero (manual) | EBITDA, costes, cash (hasta integrar contabilidad) |
| Objetivos | Targets por año/mes |

Los datos financieros que no se pueden derivar automáticamente (EBITDA, costes operativos, cash) se introducen manualmente o por script hasta que se integre un sistema contable.

---

## Tecnología

- **Datos:** Queries analíticas sobre Event Store + tablas de hechos
- **Semáforos:** Reglas deterministas con umbrales configurables
- **IA:** 3 grafos LangGraph independientes (diagnóstico, expansión, financiero)
- **Persistencia:** Eventos inmutables por cada diagnóstico generado
- **UI:** Panel ejecutivo con lectura rápida, foco estratégico, cero microgestión
