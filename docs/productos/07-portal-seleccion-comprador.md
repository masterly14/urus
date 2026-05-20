# Portal de Selección para el Comprador

> Microsite propio que presenta al comprador una selección curada de propiedades del mercado, con validación automática por IA y feedback loop por WhatsApp.

---

## Qué problema resuelve

Cuando un comprador tiene interés real (visitó, mostró engagement), hay que mostrarle propiedades del mercado que encajen con lo que busca. Antes eso implicaba buscar manualmente en portales, copiar enlaces, y enviarlos uno a uno. Sin control sobre qué se muestra, sin tracking de qué vio, y sin forma estructurada de recoger feedback.

Este portal **genera automáticamente una selección curada**, la presenta con branding propio, y recoge el feedback del comprador de forma estructurada para refinar la búsqueda.

---

## Qué aporta

| Antes | Después |
|---|---|
| Buscar propiedades manualmente en portales | Consulta automática al mercado con criterios de la demanda |
| Enviar enlaces sueltos sin contexto | Portal propio con fichas completas, imágenes, datos técnicos |
| Sin saber qué vio el comprador | Tracking de vistas: cuándo abrió, qué miró, cuántas veces |
| Feedback informal por mensaje | Feedback estructurado por propiedad (interesa / no interesa + motivo) |
| Sin control de calidad pre-envío | La IA valida y enriquece la selección antes del envío |

---

## Cómo funciona

### Paso 1 — Generación de la selección

**Disparador:** un comprador muestra interés real (visita completada con interés alto/medio, o demanda activa con engagement).

El sistema:
1. Traduce los criterios de la demanda a filtros de búsqueda de mercado (zona, tipología, rango de precio, metros)
2. Consulta la API de datos de mercado
3. Filtra y selecciona las propiedades más relevantes
4. Genera un portal con token único

### Paso 2 — Validación automática por IA

Antes del envío al comprador, la IA:
- mejora descripciones,
- aplica reglas de rebranding,
- marca la selección como aprobada.

Después se envía automáticamente el portal al comprador por WhatsApp.

### Paso 3 — El comprador explora

El comprador recibe por WhatsApp un enlace a su portal personalizado:

**Vista de listado:**
- Fichas de propiedades con imagen principal, precio, metros, zona, habitaciones
- Navegación entre propiedades

**Vista de detalle por propiedad:**
- Carrusel de imágenes
- Ficha técnica completa (precio, metros, habitaciones, baños, planta, extras)
- Certificado energético
- Datos del anunciante
- Navegación entre propiedades

### Paso 4 — Feedback por WhatsApp

El comprador **no tiene botones de valoración en la web**. Su feedback llega por WhatsApp, donde escribe naturalmente:

> "La primera me encanta, la segunda es cara, ¿tenéis algo con terraza?"

El Agente de Descubrimiento (ver documento 01) interpreta el mensaje con contexto de las propiedades mostradas y genera:
- Feedback por propiedad (interesa / no interesa)
- Variables de demanda actualizadas
- Decisión de regenerar el portal con nuevos criterios

### Paso 5 — Ciclo iterativo

Si el comprador quiere más opciones o cambia criterios:
1. Se actualizan los criterios de búsqueda
2. Se consulta de nuevo el mercado con los criterios ajustados
3. Se genera un nuevo portal
4. La IA valida automáticamente
5. Se envía al comprador

**El portal se regenera tantas veces como sea necesario**, cada vez más afinado.

---

## Token único

| Token | Destinatario | Función |
|---|---|---|
| Token público | Comprador | Accede al portal de propiedades |

### Nota histórica

En una etapa previa existió un token adicional de validación comercial y una ruta interna de aprobación manual. Ese flujo fue retirado para priorizar velocidad operacional con control IA.

---

## Tracking

El sistema registra:
- Primera vez que se abrió el portal
- Última vez que se vio
- Número total de vistas
- Feedback por propiedad (persistido como evento)

---

## Tecnología

- **Frontend:** Next.js con branding propio (SSR para SEO y velocidad)
- **Fuente de datos:** API REST de mercado inmobiliario
- **Feedback:** WhatsApp Cloud API → Agente NLU contextual
- **Validación:** Pipeline IA automático (sin compuerta manual)
- **Persistencia:** Base de datos con selección, propiedades, feedback, tracking
