# 🧠 Sistema: Motor Inteligente de Pricing

# y Posicionamiento Inmobiliario

_(Bot estratégico de comparación automática de mercado y recomendación comercial)_

## 1 ⃣ Principio del sistema (igual que los anteriores)

● **CRM central (cerebro): Inmovilla**
● **Motor externo de mercado y competencia: Statefox**
👉 Inmovilla **ordena y decide**
👉 Statefox **observa el mercado y compara**
👉 El sistema **recomienda** , el comercial **decide**

## 2 ⃣ Objetivo del bot

Cuando se **sube o modifica un inmueble** en Inmovilla, el sistema:

1. vuelca automáticamente las características a Statefox
2. analiza el mercado real (particulares + agencias + portales)
3. compara precio, calidades, posicionamiento y visibilidad
4. devuelve al comercial un **diagnóstico claro** :
    ○ sobreprecio / infraprecio / precio óptimo
    ○ riesgos comerciales
    ○ recomendaciones estratégicas de posicionamiento
📌 No es una tasación
📌 Es **inteligencia comercial en tiempo real**


## 3 ⃣ Disparadores (triggers)

El bot se activa cuando ocurre **cualquiera** de estos eventos en Inmovilla:
● Alta de nuevo inmueble
● Cambio de precio
● Cambio de estado (publicado / relanzado)
● Inmueble sin leads X días
● Inmueble con muchas visitas pero sin ofertas

## 4 ⃣ Flujo completo del sistema (diagrama lógico)

flowchart TD
A[Alta o modificación de inmueble en Inmovilla] --> B[Extracción
de variables clave]
B --> C[Sync automático Inmovilla -> Statefox]
C --> D[Statefox: búsqueda de competencia directa]
D --> E[Cluster comparativo por zona/distrito]
E --> F[Análisis de precios vs mercado]
F --> G[Análisis de calidades y extras]
G --> H[Análisis de posicionamiento en portales]
H --> I[Motor de recomendación estratégica]
I --> J[Informe automático al comercial]
J --> K{Decisión comercial}
K -->|Mantener| L[Seguimiento automático]
K -->|Ajustar precio| M[Propuesta de nuevo precio]
K -->|Reposicionar| N[Recomendaciones de mejora]


## 5 ⃣ Qué datos se vuelcan desde Inmovilla

### Variables mínimas del inmueble

● Precio
● Zona / distrito / barrio
● Metros construidos y útiles
● Tipología
● Estado (obra nueva, reformado, origen)
● Planta / ascensor
● Extras (terraza, parking, trastero)
● Año construcción (si existe)
📌 Si faltan datos → el sistema **avisa** , no analiza mal.

## 6 ⃣ Qué hace Statefox (motor de mercado)

### 6.1 Búsqueda de comparables reales

Statefox rastrea automáticamente:
● Propiedades de particulares
● Propiedades de otras agencias
● Stock activo en portales
Y crea **clusters comparativos** :
● misma zona/distrito


```
● ±15–20% metros
● tipología similar
● estado comparable
```
### 6.2 Análisis que realiza el bot

🔹 **Precio**
● Precio medio €/m² del cluster
● Rango bajo / medio / alto
● Desviación del inmueble vs mercado (%)
🔹 **Calidades**
● Qué extras tiene tu inmueble vs competencia
● Qué te falta para justificar precio
● Qué tienes de más (argumento comercial)
🔹 **Posicionamiento en portales**
● En qué tramo aparece (alto, medio, bajo)
● Si compite con inmuebles “mejor percibidos”
● Si queda enterrado por precio/fotos/orden

## 7 ⃣ Motor de recomendación (la clave)

El sistema **no solo analiza** , **recomienda**.
Ejemplos reales de output al comercial:

### 📊 Diagnóstico automático


```
“El inmueble está un 8,7% por encima del precio medio del mercado para su
zona y tipología.”
```
### 🎯 Recomendaciones estratégicas

```
● “Para competir con los 5 primeros anuncios del portal, el precio óptimo sería –5% .”
● “Si se mantiene el precio actual, el inmueble pasará a competir con propiedades
reformadas.”
● “Bajar 3.000–5.000 € mejora visibilidad sin devaluar.”
```
### 🧠 Alternativas (no solo bajar precio)

● “Reposicionar el anuncio destacando terraza + orientación.”
● “Cambiar orden de fotos y primera imagen.”
● “Subir ligeramente el precio (+2%) para reposicionar en otro tramo menos saturado.”
📌 Esto es **oro para el comercial frente al propietario**.

## 8 ⃣ Entrega al comercial (formato claro)

El comercial recibe automáticamente:
● Informe resumen (1 página)
● Semáforo:
○ 🟢 bien posicionado
○ 🟡 riesgo comercial
○ 🔴 fuera de mercado
● Recomendación accionable:
○ mantener
○ ajustar precio (con rango)
○ reposicionar anuncio


Todo queda **registrado en Inmovilla** como nota estratégica.

## 9 ⃣ SOP interno (cómo lo usa el equipo)

### Comercial

```
● Revisa el informe (2–3 min)
● Decide:
○ seguir igual
○ proponer ajuste al propietario
● Usa el informe como argumento objetivo , no opinión
```
### Dirección / Coordinación

```
● Detecta inmuebles “quemándose”
● Decide relanzamientos estratégicos
● Controla pricing del stock total
```
## 10 ⃣ Herramientas técnicas necesarias

### A) Automatización

```
● Make (ideal por lógica condicional y escenarios)
```
### B) Integración CRM

```
● Webhooks o export programado desde Inmovilla
● API / scraping estructurado en Statefox
```
### C) Motor de análisis


```
● Reglas estadísticas (medianas, percentiles)
● LLM para:
○ traducir datos en recomendaciones comerciales
○ generar texto claro para el agente
```
### D) Visualización

```
● Informe PDF / dashboard simple
● Nota automática en ficha del inmueble (Inmovilla)
```
## 11 ⃣ Tiempo ahorrado (realista)

### Proceso manual habitual

```
● Buscar competencia: 20–40 min
● Comparar precios y calidades: 15–30 min
● Preparar argumento para propietario: 10–20 min
Total: 45–90 min por inmueble
```
### Con este sistema

● Análisis automático: 2–5 min (sistema)
● Revisión comercial: 3–5 min
**Total humano:** 5–10 min
✅ **Ahorro: 40–80 min por inmueble**
En porcentaje: **~70%–85%**

## 12 ⃣ Qué favorece estratégicamente

```
● Mejor captación (argumento objetivo al propietario)
```

● Menos inmuebles quemados
● Más leads cualificados
● Mejor ratio visitas → ofertas
● Imagen de agencia **data-driven** (muy diferencial)


