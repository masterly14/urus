# Bot de Soporte Mental para Comerciales

> Agente conversacional confidencial que sostiene el rendimiento de los comerciales de alto nivel, detecta bloqueos, y proporciona intervenciones inmediatas. *(Planificado — Sprint 3)*

---

## Qué problema resuelve

Cuando se automatiza todo lo operativo, el comercial pasa a ser un closer puro. Más presión, más dinero en juego, más exposición emocional. El rendimiento sube... y luego cae. Miedo a cerrar, autosabotaje, fatiga, bloqueos recurrentes. Sin soporte, el talento se vuelve volátil.

Este bot **estabiliza el rendimiento** proporcionando soporte inmediato, confidencial, y accionable. No es coaching motivacional vacío. Es infraestructura psicológica para closers de alto nivel.

---

## Qué aporta

| Sin sistema | Con sistema |
|---|---|
| Rendimiento sube y luego cae | Rendimiento se estabiliza y escala |
| Bloqueos invisibles hasta que cuestan dinero | Detección temprana y desbloqueo inmediato |
| Rotación silenciosa | Menor burnout, mayor retención |
| Soporte solo en reuniones semanales | Soporte 24/7 sin fricción |
| El CEO no sabe que hay un problema | Alertas de riesgo operativo (sin exponer intimidades) |

---

## Las 5 capas del sistema

### Capa 1 — Acceso conversacional 24/7

El comercial escribe por WhatsApp (canal privado y confidencial):

- "Estoy bloqueado con un cierre"
- "Tengo miedo de decir el precio"
- "Me noto desconectado"
- "Quiero mejorar mi cierre"

El bot responde con tono profesional, no motivacional vacío. Conversación natural, acción inmediata.

### Capa 2 — Diagnóstico automático del estado mental

El bot clasifica automáticamente:

| Dimensión | Valores |
|---|---|
| Tipo de bloqueo | Miedo, inseguridad, presión, ego, fatiga |
| Nivel de energía | 1-5 |
| Foco | Centrado, disperso, errático |

Se diagnostica, no se juzga.

### Capa 3 — Intervención personalizada

Según el diagnóstico, el bot activa el subflujo correspondiente:

**Preparación pre-cierre:**
- 5 preguntas para ordenar la llamada
- Anclajes de seguridad
- Simulación de objeciones
- Micro-rutinas de 2 minutos

**Bloqueo:**
- Detección del tipo específico
- Ejercicio de reencuadre (2-5 min)
- Acción inmediata, no teoría

**Descarga emocional:**
- Escucha activa
- Reencuadre de la situación
- Transición a acción

**Enfoque:**
- Micro-rutinas de concentración
- Priorización de tareas del día

Ejemplos de interacción:
> "Vamos a preparar este cierre en 3 pasos."
> "Te voy a hacer 5 preguntas para ordenar la llamada."
> "Ensayemos la objeción de precio."

### Capa 4 — Programas de desarrollo continuo

Cadencias automáticas por WhatsApp:

| Programa | Frecuencia |
|---|---|
| Mentalidad de alto ticket | Semanal |
| Gestión del rechazo | Semanal |
| Identidad de closer | Quincenal |
| Disciplina emocional | Semanal |
| Desapego del resultado | Quincenal |

Formato: micro-ejercicios, retos, reflexiones guiadas, autoevaluaciones rápidas. El comercial evoluciona sin darse cuenta.

### Capa 5 — Feedback estratégico (sin invadir)

El sistema **NO reporta emociones al CEO**. Solo reporta:
- Nivel de uso del bot (agregado)
- Patrones por zona (problema estructural, no individual)
- Alertas de riesgo operativo: caída de energía prolongada, bloqueo recurrente, sobrecarga

Esto permite:
- Intervención del jefe de zona (ajustar carga)
- Apoyo puntual (sin que el comercial sepa que el bot "avisó")
- Decisiones estructurales (si una zona entera muestra fatiga)

**Se protege la confianza del comercial.** Sin confianza, no se usa. Sin uso, no funciona.

---

## Integración con contexto de negocio

El bot sabe (sin invadir):
- Si hoy tiene cierres pendientes
- Si está en racha positiva
- Si perdió una operación reciente
- Si lleva días sin actividad

Esto permite intervenciones proactivas:
> "Veo que tienes un cierre importante hoy. ¿Quieres que lo preparemos juntos?"

No accede a facturación individual ni métricas visibles al comercial.

---

## Confidencialidad

| Aspecto | Implementación |
|---|---|
| Conversaciones | Cifradas (cifrado en reposo + candidato a cifrado por columna) |
| Acceso | Solo el comercial ve sus conversaciones |
| CEO | Solo ve métricas agregadas, nunca contenido |
| Jefe de zona | Recibe alertas de riesgo, no detalles |
| Retención | Política de retención a definir |

---

## Tecnología

- **Motor conversacional:** LangGraph con subflujos especializados
- **Canal:** WhatsApp Cloud API (Meta) — canal privado
- **Persistencia:** Sesiones cifradas en base de datos
- **Alertas:** Scanner de patrones → métricas agregadas para CEO
- **Cadencias:** Jobs programados para desarrollo continuo
- **Contexto:** Lectura de eventos de negocio (sin exponer al comercial)
