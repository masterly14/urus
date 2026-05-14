# Informe ejecutivo: solución de imágenes en comparables (Statefox/Idealista)

**Fecha:** 6 de mayo de 2026  
**Objetivo de negocio:** garantizar que el equipo comercial vea siempre fotos válidas en comparables, evitando imágenes caducadas o en blanco.

---

## 1) Respuesta corta a dirección

### ¿Dónde corre el servicio hoy?

- **Aplicación principal (plataforma, APIs, dashboards):** **Vercel**.
- **Base de datos y cola de trabajo:** **Neon**.
- **Programación de tareas automáticas (cron):** **Upstash QStash**.
- **Servicio auxiliar 24/7 de sesión Inmovilla:** **Railway** (no “Runway”).

En resumen: **el core corre en Vercel**; Railway es un servicio complementario puntual.

---

## 2) Problema de negocio que resolvimos

### Situación inicial

- Statefox entrega muchas URLs de imágenes ya vencidas (caducadas).
- Esto provocaba que el comercial viera imágenes rotas o faltantes.
- El caso más crítico era Idealista, protegido por DataDome (antibot), que devolvía bloqueos 403 al intentar recuperar imágenes.

### Impacto

- Pérdida de calidad visual en informes y comparables.
- Menor confianza comercial en la herramienta.
- Riesgo de decisiones de pricing con contexto visual incompleto.

---

## 3) Qué se implementó (versión no técnica)

### Decisión clave

Se dejó de depender de URLs temporales de terceros y se pasó a un esquema de **cache propia de imágenes**.

### Flujo nuevo

1. Cuando llega un comparable con imágenes vencidas, el sistema toma el link original del anuncio.
2. Recupera las fotos reales del anuncio usando el servicio de desbloqueo de Bright Data.
3. Filtra ruido visual (iconos/logos) y conserva fotos reales del inmueble.
4. Sube las imágenes útiles a Cloudinary (CDN propio).
5. Guarda referencia en base de datos para reuso inmediato.

### Resultado actual

- Se eliminó el bloqueo 403 para el caso probado.
- El proceso completo ya logra estado **IMPORTED** en ejecución real (`--upload`).
- Las imágenes quedan en infraestructura controlada por Urus (estables y reutilizables).

---

## 4) Dependencias operativas involucradas

- **Vercel:** app y APIs.
- **Neon:** persistencia y job queue.
- **Upstash QStash:** disparo de tareas automáticas.
- **Railway:** servicio auxiliar de sesión Inmovilla.
- **Bright Data Web Unlocker:** desbloqueo anti-bot para recuperar HTML del anuncio.
- **Cloudinary:** almacenamiento y entrega final de imágenes.
- **Statefox / Inmovilla:** fuentes de datos de negocio.

---

## 5) Estimación de costos del enfoque actual

> Nota: los valores exactos dependen del volumen real mensual y de si el dominio aplica tarifa premium en Bright Data. El panel de Bright Data muestra coste estimado por zona en tiempo real.

### Costes base de infraestructura (ya existentes)

- **Vercel (Pro + uso):** ~USD 20+/mes
- **Neon:** según plan/uso
- **Railway (servicio auxiliar):** ~USD 5–10/mes
- **Upstash QStash:** ~USD 10/mes

### Coste incremental por solución de imágenes

- **Bright Data Web Unlocker:** modelo por request exitoso.
- **Cloudinary:** almacenamiento/transformación/egreso según uso.

### Escenarios orientativos (Web Unlocker)

Para dirección, usar esta regla simple:

- **Costo mensual Unlocker ≈ (requests exitosos/1000) × tarifa por 1000**

Ejemplos orientativos:

- **Escenario bajo:** 15,000 requests/mes → ~USD 22.5/mes (si tarifa 1.5/1000)
- **Escenario medio:** 30,000 requests/mes → ~USD 45/mes (si tarifa 1.5/1000)
- **Escenario alto:** 60,000 requests/mes → ~USD 90/mes (si tarifa 1.5/1000)

Si el dominio entra en tarifa premium, aplicar multiplicador según panel de Bright Data.

### Lectura ejecutiva de ROI

- El coste incremental es moderado frente al beneficio directo: comparables con fotos confiables, mejor soporte de pricing y menos fricción comercial.
- Además, al guardar en Cloudinary, se evita reintentar continuamente contra portales externos (menor riesgo operativo).

---

## 6) Riesgos y controles

### Riesgos

- Cambios futuros en protección anti-bot de portales.
- Variación de coste por volumen o tarifa premium.
- Dependencia de servicios externos (Bright Data / Cloudinary).

### Controles aplicados

- Fallback y circuit breaker por portal.
- Cache propia (reduce dependencia de reintentos).
- Monitoreo de estado de importación y errores.
- Posibilidad de ajustar topes (`max-images`) para controlar coste por comparable.

---

## 7) Recomendación para junta

1. **Aprobar este enfoque como estándar para Idealista** (ya probado en ejecución real).
2. **Monitorear 30 días**: volumen de requests, coste real y ratio de éxito.
3. **Definir presupuesto mensual objetivo** para Unlocker + Cloudinary.
4. **Escalar gradualmente** a otros portales solo si el ratio beneficio/coste lo justifica.

---

## 8) Estado actual

- **Estado del incidente de imágenes:** mitigado para el flujo probado.
- **Estado operativo:** funcional con carga real de ejemplo.
- **Siguiente hito recomendado:** seguimiento de coste real y KPI de “fotos válidas por comparable” durante el primer mes.
