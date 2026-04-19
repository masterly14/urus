# Portal de Selección para el Comprador

> Microsite propio que presenta al comprador una selección curada de propiedades del mercado, con validación previa del comercial y feedback loop por WhatsApp.

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
| Sin control de calidad pre-envío | El comercial valida la selección antes de que el comprador la vea |

---

## Cómo funciona

### Paso 1 — Generación de la selección

**Disparador:** un comprador muestra interés real (visita completada con interés alto/medio, o demanda activa con engagement).

El sistema:
1. Traduce los criterios de la demanda a filtros de búsqueda de mercado (zona, tipología, rango de precio, metros)
2. Consulta la API de datos de mercado
3. Filtra y selecciona las propiedades más relevantes
4. Genera un portal con token único

### Paso 2 — Validación del comercial

**Antes de que el comprador vea nada**, el comercial recibe por WhatsApp un enlace a una vista interna de validación. En 30-60 segundos puede:
- **Aprobar** → el portal se envía al comprador
- **Rechazar** → no se envía nada, se puede regenerar con ajustes

**SLA de validación:** 2 horas. Si el comercial no valida, se escala automáticamente.

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
4. El comercial valida
5. Se envía al comprador

**El portal se regenera tantas veces como sea necesario**, cada vez más afinado.

---

## Tokens duales

| Token | Destinatario | Función |
|---|---|---|
| Token público | Comprador | Accede al portal de propiedades |
| Token de validación | Comercial | Aprueba o rechaza antes del envío |

Son independientes. El comprador nunca recibe el enlace hasta que el comercial aprueba.

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
- **Validación:** Micro-frontend interno con SLA de 2h
- **Persistencia:** Base de datos con selección, propiedades, feedback, tracking
