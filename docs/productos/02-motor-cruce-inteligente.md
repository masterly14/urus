# Motor de Cruce Inteligente de Propiedades (Smart Matching)

> Sistema que cruza automáticamente cada nueva propiedad contra todas las demandas activas de compradores, generando matches reales con scoring multidimensional.

---

## Qué problema resuelve

Cuando entra una nueva propiedad al inventario, alguien tiene que revisar manualmente qué compradores podrían estar interesados. Con 200 demandas activas y 50 propiedades nuevas al mes, eso son miles de combinaciones que un humano no puede evaluar con rigor. Se pierden oportunidades, se notifica tarde, o se notifica al comprador equivocado.

Este motor **cruza automáticamente** cada propiedad nueva contra todas las demandas activas, calcula un score de compatibilidad multidimensional, y genera matches que disparan notificaciones inmediatas.

---

## Qué aporta

| Antes | Después |
|---|---|
| Cruce manual: el comercial recuerda "a quién le podría interesar" | Cruce exhaustivo contra todas las demandas activas |
| Se notifica a 2-3 compradores por intuición | Se notifica a todos los que encajan, ordenados por score |
| Demora de horas o días | Cruce en segundos tras detectar la nueva propiedad |
| Sin criterio objetivo | Score numérico basado en zona, precio, tipología, metros, habitaciones |

---

## Cómo funciona

### Disparador

El sistema detecta una nueva propiedad (o una modificación relevante) mediante polling periódico. Al detectarla, emite un evento y lanza el cruce.

### Motor de Scoring (5 dimensiones)

Cada combinación propiedad-demanda se evalúa en 5 dimensiones independientes:

| Dimensión | Qué evalúa | Score |
|---|---|---|
| **Zona** | ¿La propiedad está en una zona que busca el comprador? Match exacto, parcial (contenida), por ciudad, o sin zona definida | 0 – 1.0 |
| **Precio** | ¿El precio cae dentro del rango presupuestario? Centro del rango = 1.0, bordes = penalización gradual, tolerancia configurable | 0 – 1.0 |
| **Tipología** | ¿Coincide el tipo de inmueble? Match exacto, sinónimos (piso=apartamento, chalet=casa), múltiples tipos aceptados | 0 – 1.0 |
| **Superficie** | ¿Los metros encajan con lo que busca? Tolerancia ±20% | 0 – 1.0 |
| **Habitaciones** | ¿Cumple el mínimo de habitaciones requerido? | 0 – 1.0 |

El **score final** es un promedio ponderado configurable. Solo se generan matches por encima de un umbral mínimo.

### Salida

Por cada match generado:
- Identificador de la demanda y la propiedad
- Score total y desglose por dimensión
- Evento inmutable registrado
- Notificación automática al comprador vía WhatsApp

### Ciclo de retroalimentación

Cuando el comprador responde al match (a través del Agente de Descubrimiento), sus nuevos criterios actualizan la demanda. El siguiente cruce ya usa los criterios refinados. **La demanda se afina sola con cada interacción.**

---

## Ejemplo

**Nueva propiedad:** Piso en Centro, 250.000€, 90m², 3 habitaciones

**Demanda activa:** Comprador busca piso en Centro o Macarena, 200-300k, mínimo 2 habitaciones

**Resultado del cruce:**
- Zona: 1.0 (match exacto "Centro")
- Precio: 1.0 (250k está en el centro del rango 200-300k)
- Tipología: 1.0 (piso = piso)
- Superficie: 0.8 (90m² dentro de tolerancia)
- Habitaciones: 1.0 (3 ≥ 2)
- **Score total: 0.96** → Match generado → WhatsApp al comprador

---

## Tecnología

- **Scoring:** Funciones puras en TypeScript (sin IA, determinista y predecible)
- **Sinónimos:** Tabla de equivalencias de tipología inmobiliaria española
- **Persistencia:** Evento `MATCH_GENERADO` en Event Store
- **Tests:** Suite E2E que crea demanda → propiedad → verifica match → actualiza demanda → verifica recruce
