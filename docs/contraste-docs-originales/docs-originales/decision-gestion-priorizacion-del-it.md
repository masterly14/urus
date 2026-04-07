# Motor de Decisión para la Gestión y Priorización del IT

# Inmobiliario

# 1) Estructura del sistema de priorización (arquitectura)

## Capa A — Captura unificada de entradas (IT)

**Fuentes típicas:**
● Portales (Idealista/Fotocasa/Habitaclia)
● Web (formularios)
● WhatsApp/Instagram/Facebook
● Llamadas (call tracking)
● Referidos / base de datos
**Salida obligatoria:** todo entra al **CRM** como “Lead/Conversación” con:
● origen
● ciudad (Córdoba/Málaga/Sevilla)
● tipo (propietario / comprador / inversor)
● timestamp
● datos mínimos

## Capa B — Normalización y enriquecimiento

Aquí conviertes texto “sucio” en campos útiles:
● **Parseo** de mensaje (presupuesto, zona, urgencia, financiación, tipo activo)
● **Geolocalización** (zona/barrio si lo menciona)
● **Detección de intención** (vender ya / solo curiosear / inversión)


● **Detección de calidad** (¿aporta datos o es genérico?)
Esto lo hace:
● reglas + expresiones (rápido y barato)
● y/o un LLM (IA) para clasificar cuando el texto es libre

## Capa C — Scoring (prioridad) en 0–

Tu motor de priorización debe dar:
● **Score total**
● **Motivo del score** (explicable)
● **Siguiente mejor acción** (NBA: next best action)
El score se compone de 3 sub-scores:

1. **Probabilidad de cierre (Pclose)**
2. **Valor económico esperado (Value)**
3. **Urgencia/SLAs (Urgency)**
Ejemplo de fórmula:
**Score = 0,55·Pclose + 0,30·Value + 0,15·Urgency**

## Capa D — Enrutado y SLA automáticos

Con el score:
● asignas comercial según **ciudad + especialidad + carga**
● defines SLA:
○ score ≥ 80 → contactar < 5 min
○ 60–79 → < 30 min


```
○ 40–59 → < 2 h
○ < 40 → cadencia automática (sin gastar tiempo humano)
```
## Capa E — Seguimiento + recirculación

Si no contesta / no avanza:
● cadencias automáticas (D+1, D+3, D+7)
● cambio de estado
● re-asignación si SLA incumplido
● recirculación a otro comercial si se enfría

## Capa F — Aprendizaje (feedback loop)

Cada lead que cierre/no cierre alimenta el modelo:
● qué origen convierte mejor
● qué copy/guion funciona
● qué perfil de lead realmente compra
● qué comercial está cerrando mejor en cada segmento

# 2) Cómo se implementa en la práctica (paso a paso)

## Paso 1 — Define el “diccionario de datos” (lo que el CRM debe tener)

Campos mínimos:
● Ciudad (Córdoba/Málaga/Sevilla)
● Tipo lead (propietario/comprador/inversor)


● Presupuesto/Precio objetivo
● Plazo (0–30 días / 30–90 / 90+)
● Financiación (preaprobado / “lo miro” / sin datos)
● Motivación (alta/media/baja)
● Origen (portal/web/redes/referido)
● Segmento (obra nueva, residencial, inversión, lujo, etc.)
● Estado pipeline
● Score + explicación + SLA
**Clave:** sin estos campos, no hay priorización consistente.

## Paso 2 — Crea reglas rápidas (MVP en 48–72h)

Antes de “IA avanzada”, construyes **scoring por reglas** (barato y fiable).
Ejemplo (comprador):
● Preaprobación hipotecaria: +
● Presupuesto definido: +
● Plazo ≤ 30 días: +
● Mensaje con detalles (zona, tipología): +
● Referido: +
● “Solo estoy mirando”: −
Ejemplo (propietario):
● Urgencia de venta (“me urge”): +
● Precio cercano a mercado (si lo estimas): +
● Exclusiva aceptable / motivación: +


● Documentación disponible: +
● “Quiero probar sin agencia”: −
Con esto ya logras el 80% del valor.

## Paso 3 — Añade IA para clasificar texto libre y extraer variables

Aquí el LLM hace 3 cosas:

1. **Clasifica intención** (alta/media/baja)
2. **Extrae entidades** (zona, presupuesto, plazo, tipología)
3. **Genera un resumen** para el comercial + “siguiente acción”
Importante: la IA NO decide sola.
La IA propone → tú lo conviertes en campos → tu score decide.

## Paso 4 — Motor de asignación (routing) por ciudad + carga +

## rendimiento

Regla típica:

1. filtra por ciudad
2. filtra por especialidad (captación / compradores / inversión)
3. asigna al comercial con:
    ○ menor carga activa ponderada
    ○ mejor conversión histórica en ese segmento (si ya tienes datos)
Esto se automatiza con una tabla sencilla:
● Comerciales: ciudad, especialidad, activos actuales, ratio cierre, disponibilidad.

## Paso 5 — SLA + “alarmas” automáticas


Si score alto:
● notificación inmediata (WhatsApp/Slack/email)
● tarea en CRM con vencimiento
● si no se registra contacto en X minutos → escalado a jefe de zona
● si sigue sin acción → re-asignación automática
Esto es lo que evita que el sistema dependa de “hoy estoy liado”.

## Paso 6 — Cadencias automáticas por segmento (sin quemar al equipo)

Para scores medios/bajos:
● secuencia de mensajes (WhatsApp/email/SMS) con valor
● reintento de llamada programado
● “nurturing” semanal (propietarios) / diario (compradores calientes)
La priorización aquí es: **la máquina insiste** hasta que merezca tiempo humano.

## Paso 7 — Panel de control (dirección y jefes de zona)

KPIs imprescindibles para validar la priorización:
● Tiempo medio de primera respuesta por score
● Conversión por rango de score (80+, 60–79, etc.)
● Cierre por origen
● Cierre por comercial y por segmento
● Leads “perdidos por SLA”
Si el score no predice cierres, lo ajustas.


# 3) Resultado operativo esperado (qué cambia en el día

# a día)

```
● Los comerciales llaman primero a lo que paga y cierra
● Se reduce drásticamente el “trabajo de atención” improductivo
● La dirección deja de “empujar” y pasa a “optimizar”
● Se minimiza el efecto del comercial lento o desordenado
```
# 4) Recomendación de implementación (orden correcto)

1. **Scoring por reglas + routing + SLA** (rápido, robusto)
2. **Cadencias automáticas** (para no gastar tiempo humano)
3. **IA de extracción/clasificación** (para mejorar precisión)
4. **Aprendizaje con datos de cierre** (para afinar y escalar)


