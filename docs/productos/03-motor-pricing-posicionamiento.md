# Motor de Pricing y Posicionamiento de Mercado

> Sistema que analiza automáticamente cada inmueble contra el mercado real, calcula su posición competitiva, y genera recomendaciones estratégicas accionables para el comercial.

---

## Qué problema resuelve

Un comercial necesita saber si el precio de un inmueble es competitivo. Hoy eso implica buscar manualmente propiedades similares en portales, comparar precios, estimar posicionamiento, y preparar un argumento para el propietario. Eso toma 45-90 minutos por inmueble y depende de la experiencia subjetiva del comercial.

Este motor **automatiza el análisis completo**: consulta el mercado real, construye un cluster de comparables, calcula estadísticas, asigna un semáforo de posicionamiento, y genera un diagnóstico con recomendaciones concretas.

---

## Qué aporta

| Métrica | Manual | Con el sistema |
|---|---|---|
| Buscar competencia | 20–40 min | 0 (automático) |
| Comparar precios y calidades | 15–30 min | 0 (automático) |
| Preparar argumento para propietario | 10–20 min | 3–5 min (revisión) |
| **Total por inmueble** | **45–90 min** | **3–5 min** |

**Ahorro: ~70–85% por inmueble.**

Además:
- Argumento objetivo basado en datos, no en opinión
- Detección temprana de inmuebles "quemándose" (sin actividad)
- El propietario recibe un informe profesional, no una sensación

---

## Cómo funciona

### Disparadores

**Reactivos** — cuando algo cambia en el inmueble:
- Alta de nuevo inmueble
- Cambio de precio, metros, habitaciones o baños

**Proactivos** — cuando el inmueble lleva tiempo sin actividad:
- 14+ días sin ningún comprador interesado
- 3+ visitas realizadas pero ninguna oferta

### Pipeline de análisis

```
1. Extraer variables del inmueble (precio, zona, metros, tipología, extras)
      ↓
2. Consultar mercado real: propiedades similares en la misma zona
      ↓
3. Filtrar comparables: ±20% metros, tipología similar, segmentar particular vs profesional
      ↓
4. Calcular estadísticas del cluster:
   - Precio medio €/m²
   - Mediana €/m²
   - Rango (mín – máx)
   - Desviación estándar
   - Media por tipo de anunciante (particular vs profesional)
      ↓
5. Calcular gap: diferencia % entre el inmueble y la media del cluster
      ↓
6. Asignar semáforo
      ↓
7. Generar diagnóstico textual + recomendaciones estratégicas (IA)
      ↓
8. Notificar al comercial por WhatsApp con enlace al informe
```

### Semáforo

| Color | Condición | Significado |
|---|---|---|
| **VERDE** | Gap ≤ 5% | Bien posicionado. Monitorear semanalmente. |
| **AMARILLO** | Gap 5–12% | Riesgo comercial. Priorizar mejoras no-precio o ajuste ligero. |
| **ROJO** | Gap > 12% | Fuera de mercado. Ajustar precio o reposicionar urgentemente. |

### Recomendaciones del motor IA

No solo dice "baja el precio". Genera alternativas concretas:

> "El inmueble está un 8,7% por encima del precio medio del mercado para su zona y tipología."

> "Para competir con los 5 primeros anuncios del portal, el precio óptimo sería –5%."

> "Reposicionar el anuncio destacando terraza + orientación sur como argumento diferencial."

> "Cambiar orden de fotos y primera imagen antes de considerar ajuste de precio."

Incluye: argumentos comerciales (extras superiores al cluster), riesgos (tiempo en mercado, pérdida de visibilidad), y rango de precio sugerido cuando aplica.

### Protecciones en análisis masivos

Cuando el sistema evalúa proactivamente todo el stock (cron diario), aplica protecciones para no saturar recursos:
- Máximo 100 propiedades por ejecución
- Cooldown de 7 días entre análisis de la misma propiedad
- Menos páginas de consulta al mercado por propiedad
- Sin IA textual por defecto (solo semáforo y estadísticas)
- Jobs escalonados en el tiempo (30s entre cada uno)

### Informe visual

El comercial accede a un informe completo en el panel interno:
- Header con semáforo, gap, KPIs del inmueble
- Diagnóstico IA con acción recomendada y confidence
- Recomendaciones detalladas con cifras
- Argumentos comerciales y riesgos
- Gráfico visual del gap vs cluster
- Tabla de comparables con precio/m², tipo de anunciante, extras
- Metadata de la consulta (fuentes, fechas, filtros)

---

## Tecnología

- **Fuente de mercado:** API REST de datos inmobiliarios de portales (solo lectura)
- **Estadísticas:** Cálculo propio en TypeScript (media, mediana, desviación, segmentación)
- **IA:** LangGraph con structured output para diagnóstico y recomendaciones
- **Notificación:** WhatsApp Cloud API al comercial asignado
- **Persistencia:** Eventos inmutables (análisis + recomendación)
