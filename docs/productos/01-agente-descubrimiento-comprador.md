# Agente de Descubrimiento de Necesidades del Comprador

> Sistema conversacional que interpreta lo que el comprador realmente busca a partir de sus mensajes de texto libre, y traduce esa información en criterios de búsqueda accionables.

---

## Qué problema resuelve

Un comprador escribe "no me cuadra, es caro" o "quiero algo con terraza en otra zona". Un humano tarda minutos en interpretar eso, abrir una ficha, cambiar campos, y relanzar una búsqueda. Si gestiona 30 compradores activos, ese trabajo se multiplica y se pierde información por el camino.

Este agente **elimina la interpretación manual**. Lee el mensaje, entiende qué quiere decir, extrae las variables concretas (precio, zona, metros, extras) y actualiza automáticamente los criterios de búsqueda del comprador.

---

## Qué aporta

| Antes | Después |
|---|---|
| El comercial lee cada mensaje, interpreta, y actualiza manualmente | El sistema interpreta y actualiza solo |
| Se pierden matices ("con terraza" se olvida) | Cada detalle se captura como variable estructurada |
| El comprador repite lo mismo en cada interacción | El sistema acumula contexto conversacional |
| Reacción lenta: horas o días | Reacción inmediata: segundos |

---

## Cómo funciona

### Entrada

Un mensaje de WhatsApp del comprador. Puede ser:
- Una respuesta a una propiedad mostrada ("me gusta pero es caro")
- Feedback sobre varias propiedades de un portal de selección ("la primera me encanta, la segunda no")
- Un cambio de criterios ("ahora busco en otra zona")
- Una combinación de todo lo anterior en lenguaje natural

### Procesamiento

El agente opera en dos modos según el contexto:

**Modo simple** — cuando el comprador responde a una propiedad individual:
1. Clasifica la intención: me encaja / no me encaja / busco algo diferente
2. Extrae variables modificadas: precio, zona, metros, habitaciones, extras
3. Genera un resumen estructurado

**Modo contextual** — cuando el comprador tiene un portal de selección activo con varias propiedades:
1. Recibe el mensaje + la lista de propiedades que se le mostraron + el historial conversacional
2. Identifica a qué propiedad se refiere cada comentario
3. Clasifica sentimiento por propiedad (interesa / no interesa)
4. Extrae variables de demanda actualizadas
5. Detecta si quiere ver más opciones

### Salida

```
Intención: wants_changes
Feedback por propiedad:
  - Propiedad A: ME_INTERESA (razón: "le gusta la zona")
  - Propiedad B: NO_ME_ENCAJA (razón: "demasiado cara")
Variables extraídas:
  - precioMax: 280.000€ (antes: 320.000€)
  - extras: ["terraza"] (nuevo requisito)
Quiere más opciones: sí
```

### Acciones automáticas que dispara

1. **Actualiza los criterios de búsqueda** del comprador con las variables extraídas
2. **Persiste el feedback** por cada propiedad evaluada
3. **Regenera el portal de selección** si el comprador quiere más opciones (con los nuevos criterios)
4. **Escribe los cambios** en el sistema de registro para mantener coherencia

### Contexto multi-turno

El agente mantiene una sesión conversacional por comprador. Sabe:
- Qué propiedades se le mostraron
- Qué dijo en mensajes anteriores
- Cuál es su demanda subyacente
- Cuántos turnos de conversación lleva

Esto permite que el comprador refine iterativamente sin que nadie intervenga.

---

## Ejemplo real de interacción

**Comprador escribe:**
> "La del centro me gusta mucho pero 320k es demasiado para mí. La de Nervión ni la vi, no me interesa esa zona. ¿Tenéis algo con terraza por menos de 280?"

**El agente produce:**
- Propiedad Centro: ME_INTERESA (pero precio excesivo)
- Propiedad Nervión: NO_ME_ENCAJA (zona rechazada)
- Variables actualizadas: precioMax → 280.000€, extras → terraza
- Quiere más opciones: sí

**Resultado:** se regenera automáticamente un nuevo portal de selección con propiedades ≤280k que tengan terraza, excluyendo Nervión.

---

## Tecnología

- **Motor de comprensión:** LangGraph con structured output (Zod)
- **Canal:** WhatsApp Cloud API (Meta) — integración directa
- **Persistencia:** Event Store inmutable + sesión conversacional en base de datos
- **Calidad:** Suite de evaluación AI-to-AI con 6 categorías de test (ver documento de Suite de Evaluación)
