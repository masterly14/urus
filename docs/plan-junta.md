# Plan de Trabajo — Sistema de Automatización Urus Capital Group

> **Documento para el equipo (trazabilidad y presentación de avances)**  
> **Versión:** 1.0 · **Fecha:** Marzo 2026  
> **Duración:** 8 semanas (4 sprints de 2 semanas)  
> **Demo semanal:** Cada sábado se presenta el avance al equipo

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Mapa de Módulos y Dependencias](#mapa-de-módulos-y-dependencias)
4. [Plan de Ejecución: 8 Semanas](#plan-de-ejecución-8-semanas)
5. [Criterios de Aceptación por Sprint](#criterios-de-aceptación-por-sprint)
6. [Resumen de Entregables por Semana](#resumen-de-entregables-por-semana)
7. [Métricas de Progreso](#métricas-de-progreso)
8. [Gestión de Riesgos](#gestión-de-riesgos)
9. [Glosario](#glosario)

---

## Resumen Ejecutivo

### Qué se construye

Un sistema de automatización integral para Urus Capital Group que envuelve el CRM existente (Inmovilla) y lo conecta con Statefox, WhatsApp Business, firma digital, y un motor de IA — creando un ecosistema que transforma la operativa inmobiliaria de manual a autónoma.

### Por qué


| Antes                                                   | Después                                        |
| ------------------------------------------------------- | ---------------------------------------------- |
| Comerciales multitarea (vender + gestionar + perseguir) | El sistema prioriza, asigna y hace seguimiento |
| Leads perdidos por falta de seguimiento                 | El sistema nunca olvida un cliente             |
| Decisiones por intuición                                | Decisiones por datos                           |
| Escalar = contratar más sin control                     | Escalar = replicar un sistema probado          |


### Tiempo liberado por perfil


| Perfil         | Ahorro semanal       | Se destina a...                                    |
| -------------- | -------------------- | -------------------------------------------------- |
| Comercial      | 15–20 horas          | Llamadas de calidad, visitas, cierres              |
| Jefe de equipo | 15–20 horas          | Mejorar al equipo, detectar problemas, optimizar   |
| CEO            | Sale de microgestión | Control global, expansión, estrategia, reinversión |


### Hitos clave


| Semana | Hito                                                       |
| ------ | ---------------------------------------------------------- |
| S2     | Pipeline completo de leads funcionando end-to-end          |
| S4     | Smart Closing, Pricing, Dashboards y Post-venta operativos |
| S6     | Sistema integrado, IA refinada, seguridad y UI pulida      |
| S8     | Sistema en producción con datos reales (v1.0.0)            |


---

## Arquitectura del Sistema

### Las 4 Capas

- **Capa 1 — La Bóveda (Inmovilla CRM):** Fuente de verdad. Almacena datos finales y legales. El sistema lee y escribe de forma automatizada (API REST para clientes, propiedades y propietarios; proceso asistido para demandas y estados).
- **Capa 2 — Workers de Integración:** Procesos que leen datos de Inmovilla y de Statefox y los llevan al sistema; y que escriben en Inmovilla cuando el flujo lo requiere (nuevos clientes, propiedades, demandas, estados).
- **Capa 3 — Plano de Control:** El “cerebro” del sistema: base de datos de eventos, cola de tareas, reglas de negocio y motores de IA (scoring, matching, pricing, cierre).
- **Capa 4 — Interfaces:** Pantallas propias (formularios de post-visita, validación, dashboards), WhatsApp Business y notificaciones.

### Flujo de datos

Inmovilla y Statefox se integran vía APIs y procesos automatizados. Los cambios se registran como eventos; el sistema prioriza leads, asigna comerciales, envía mensajes por WhatsApp, genera microsites de selección para compradores, contratos, informes de pricing y dashboards para comercial, colaboradores y CEO.

---

## Mapa de Módulos y Dependencias


| ID  | Módulo                                                                       | Sprint |
| --- | ---------------------------------------------------------------------------- | ------ |
| M0  | Infraestructura base (base de datos, eventos, cola de tareas, proyecto)      | S1     |
| M1  | Worker de ingesta (lectura de propiedades y demandas desde Inmovilla)        | S1     |
| M2  | Worker de egestion (escritura en Inmovilla: clientes, propiedades, demandas) | S1     |
| M3  | Motor de scoring y priorización de leads                                     | S1     |
| M4  | Integración WhatsApp Business API                                            | S1     |
| M5  | Smart Matching (cruce demandas + ajuste por IA)                              | S1     |
| M6  | Statefox (datos de mercado) + Microsite de selección para comprador          | S1     |
| M7  | Motor de pricing y posicionamiento                                           | S2     |
| M8  | Smart Closing (contratos + voz + firma digital)                              | S2     |
| M9  | Cadencias post-venta                                                         | S2     |
| M10 | Dashboard Comercial (rentabilidad por persona)                               | S2     |
| M11 | Dashboard Colaboradores Externos                                             | S2     |
| M12 | Bot de Soporte Mental                                                        | S3     |
| M13 | Dashboard CEO (gobierno estratégico)                                         | S2     |
| M14 | Integración end-to-end y robustez                                            | S3–S4  |


### Correspondencia módulos ↔ flujo operativo


| Flujo operativo                             | Módulos                  |
| ------------------------------------------- | ------------------------ |
| Subida de propiedad y cruce automático      | M0, M1, M5               |
| Notificación automática al comprador        | M4, M5                   |
| Respuesta del comprador y ajuste de demanda | M2, M4, M5               |
| Visita y afinado humano                     | Capa 4 (micro-frontends) |
| Búsqueda de stock externo en mercado        | M6                       |
| Microsite de selección para compradores     | M6                       |
| Validación del comercial                    | Capa 4 + M4              |
| Motor de Pricing                            | M7                       |
| Smart Closing                               | M8                       |
| Dashboard de Rentabilidad por Comercial     | M10                      |
| Motor de Priorización de Leads              | M3                       |
| Control de Colaboradores Externos           | M11                      |
| Automatización Post-Venta                   | M9                       |
| Soporte Mental (Bot)                        | M12                      |
| Sistema de Gobierno del CEO                 | M13                      |


---

## Plan de Ejecución: 8 Semanas

### Vista general


| Mes       | Semanas | Foco                                    | Entregable clave                                                                              |
| --------- | ------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Mes 1** | S1–S4   | Infraestructura + lógica de negocio     | Workers operativos, leads en Inmovilla, WhatsApp, scoring, Smart Closing, Pricing, Dashboards |
| **Mes 2** | S5–S8   | Refinamiento IA + robustez + producción | Bot mental, IA v2, seguridad, integración E2E, staging, puesta en producción                  |


---

## Sprint 1 (Semanas 1–2): Cimientos del Orquestador

**Objetivo:** Infraestructura, integración con Inmovilla y Statefox, y pipeline de leads operativo con scoring, WhatsApp y Smart Matching.

### Semana 1 — Infraestructura Base + Integración APIs + Legacy

#### Lunes (Día 1) — M0: Event Store + Job Queue


| Tarea                                                                                          | Entregable                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Setup del proyecto: estructura, configuración base, `.env.example`                             | Repo con scaffolding completo                  |
| Configurar Neon: proyecto y conexión desde la aplicación                                       | Conexión a base de datos verificada            |
| Diseñar schema de Event Store: tablas de eventos, cola de trabajos, checkpoint de proyecciones | Migración v1 ejecutada en Neon                 |
| Implementar capa del Event Store: append, consulta por agregado y desde fecha                  | Funciones core con tests                       |
| Implementar Job Queue: encolar, desencolar, marcar completado/fallido con reintentos           | Job Queue funcional con test de ciclo completo |
| Documentar decisiones de arquitectura (Event Sourcing, Neon como cola). Actualizar README      | ADRs + README actualizado                      |


**Tipos de eventos:** PROPIEDAD_CREADA, PROPIEDAD_MODIFICADA, ESTADO_CAMBIADO, CONTACTO_INGESTADO, SLA_INICIADO, DEMANDA_ACTUALIZADA, MATCH_GENERADO.

**Nota:** En Inmovilla no existe entidad "Lead"; se trabaja con **Contacto** (persona) + **Demanda** (búsqueda activa). "Lead" en este plan es el concepto de negocio (potencial comprador/vendedor) materializado como Contacto + Demanda.

#### Martes (Día 2) — M1/M2: Integración API REST + Ingeniería inversa legacy


| Tarea                                                                                                                             | Entregable                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Implementar cliente API REST de Inmovilla: autenticación por token, base URL, tipado de respuestas. Probar listado de propiedades | Cliente REST tipado y funcional          |
| CRUD de propiedades y clientes vía REST: obtener, crear, buscar. Tests contra API real. Documentar límites de uso                 | CRUD REST funcional con tests            |
| Ingeniería inversa para demandas (no cubiertas por API): capturar peticiones de crear/modificar demanda y cambiar estado          | Documento de endpoints legacy (demandas) |
| Script de login silente para operaciones legacy: navegación a Inmovilla, credenciales, cookies y token CSRF                       | Script de login funcional                |
| Lectura de enums y catálogos vía REST (tipos, ciudades, zonas). Caché local por límites de uso                                    | Catálogos cacheados en Neon              |
| Documentación del día y descubrimientos                                                                                           | Documentación actualizada                |


#### Miércoles (Día 3) — M1 + M2: Workers de lectura y escritura


| Tarea                                                                                                                                                         | Entregable                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Worker de ingesta v1 para propiedades: listado vía API REST, detección de cambios, obtención de datos completos de los que cambiaron                          | Worker ejecutable con detección de cambios |
| Conectar ingesta al Event Store: emitir eventos al detectar cambios (PROPIEDAD_CREADA, etc.)                                                                  | Eventos fluyendo a Neon                    |
| Worker de ingesta para demandas (vía legacy): leer demandas activas, detectar cambios, emitir eventos                                                         | Lectura de demandas funcional              |
| Worker de egestion v1: escritura vía API REST para clientes/propiedades/propietarios; escritura vía legacy para demandas (login + CSRF + peticiones clonadas) | Función core de escritura dual             |
| Módulo de geocoding/polígonos para demandas: zona/barrio/municipio a polígonos en formato Inmovilla. MVP: mapeo por zona de catálogo                          | Módulo geo con estrategia por zona         |
| Prueba del Egestion: crear cliente vía REST y demanda vía legacy con polígono válido; verificar en Inmovilla                                                  | Escritura verificada end-to-end            |
| Documentación de limitaciones (límites de API, formato de polígonos)                                                                                          | —                                          |


#### Jueves (Día 4) — M0: API Routes + consumidor de eventos + proyecciones


| Tarea                                                                                                   | Entregable                   |
| ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| API Routes: recibir eventos de workers, consultar eventos por agregado                                  | API Routes funcionales       |
| API Route de health check y estado de workers                                                           | Endpoint de monitoreo        |
| Procesador de eventos: handler que procesa nuevos eventos en la cola con lógica de reintentos           | Consumer funcional con retry |
| Proyecciones básicas: estado actual de propiedades y demandas materializado desde eventos               | Proyecciones sincronizadas   |
| Tests de integración: ingesta detecta cambio → emite evento → consumer procesa → proyección actualizada | Test E2E del pipeline        |
| Cierre y documentación del día                                                                          | —                            |


#### Viernes (Día 5) — M6: Statefox + tipos de dominio + refactor


| Tarea                                                                                                    | Entregable                               |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Cliente API REST de Statefox: Bearer token, base URL. getProperties y getSnapshot con tipado completo    | Cliente REST Statefox tipado y funcional |
| Probar paginación y filtros; mapear tipos Property, SnapshotProperty, Meta                               | Paginación verificada con tests          |
| Tipos TypeScript para entidades del dominio: Property, Demand, Lead, Event, Job, Match, StatefoxProperty | types/domain completo                    |
| Refactor del código de la semana: utilidades comunes, imports limpios, tipado estricto                   | Codebase limpio                          |
| Tests unitarios para Event Store y Job Queue                                                             | Test suite con cobertura > 80% en core   |
| Preparar demo del sábado: secuencia y mensaje                                                            | Notas de demo                            |


#### Sábado (Día 6) — DEMO Semana 1


| Actividad                                                                                                                                                                            | Entregable |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| DEMO: Event Store funcionando; Worker de ingesta leyendo propiedades (API REST) y demandas (legacy); Worker de egestion creando cliente de prueba; lectura de Statefox API funcional | —          |
| Retrospectiva y documentación de feedback                                                                                                                                            | —          |
| Refactor, deuda técnica, documentación                                                                                                                                               | —          |
| Preparación semana 2: LangGraph, documentación WhatsApp Business                                                                                                                     | —          |


**Entregable semanal:**

- Event Store + Job Queue operativos en Neon.
- Worker de ingesta leyendo propiedades (API REST) y demandas (legacy) de Inmovilla.
- Worker de egestion escribiendo clientes/propiedades (API REST) y demandas (legacy).
- Cliente API REST de Statefox funcional con paginación y tipado.
- Estructura de proyecto con tipos, tests y ADRs.

---

### Semana 2 — Lead Scoring + WhatsApp + Smart Matching v1

#### Lunes (Día 7) — M4: WhatsApp Business API


| Tarea                                                                              | Entregable                       |
| ---------------------------------------------------------------------------------- | -------------------------------- |
| Configurar WhatsApp Business API: cuenta con proveedor, API keys, sandbox          | Cuenta WA Business configurada   |
| Servicio de envío de WhatsApp y API Route POST /api/whatsapp/send                  | Envío de mensajes funcional      |
| Webhook de recepción: parsear mensajes entrantes, emitir eventos WHATSAPP_RECIBIDO | Webhook funcional                |
| Plantillas de WhatsApp: match, seguimiento, validación. Envío a aprobación Meta    | Plantillas creadas y en revisión |
| Pruebas: enviar mensaje, recibir respuesta, verificar evento en Neon               | Ciclo WA completo verificado     |
| Cierre y documentación del día                                                     | —                                |


#### Martes (Día 8) — M3: Scoring + SLA + routing


| Tarea                                                                                                                                 | Entregable                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Motor de scoring MVP (reglas): calculateScore con pesos Pclose 0.55, Value 0.30, Urgency 0.15. Reglas para compradores y propietarios | Función de scoring con tests |
| SLA automático según score (≥80: <5 min, 60–79: <30 min, etc.) y job de seguimiento en cola                                           | SLAs funcionando             |
| Routing de leads: asignar comercial por ciudad, carga y rendimiento. Tabla de comerciales en Neon                                     | Routing funcional            |
| Conectar scoring al flujo: ingesta detecta lead → scoring → SLA → asignación → notificación WhatsApp al comercial                     | Flujo semi-automatizado      |
| Cadencias automáticas: cron para leads sin respuesta (D+1, D+3, D+7)                                                                  | Cadencias programadas        |
| Cierre y documentación del día                                                                                                        | —                            |


#### Miércoles (Día 9) — M5: Smart Matching + LangGraph


| Tarea                                                                                                                                                        | Entregable                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Setup LangGraph: dependencias, OpenAI, primer grafo de prueba                                                                                                | LangGraph operativo                    |
| Agente de clasificación de respuestas WhatsApp: texto libre → intención (me encaja / no encaja / busco diferente) + variables (precio, zona, metros, extras) | Agente de NLU funcional                |
| Smart Matching v1: cuando el agente clasifica "no me encaja" + variables → evento DEMANDA_ACTUALIZADA → Egestion escribe en Inmovilla                        | Smart Matching end-to-end              |
| Cruce de demandas: matchDemandsToProperty usando zona geoespacial (coordenada en polígono o key_zona), rango de precio, tipología y metros                   | Cruce funcional con lógica geoespacial |
| Tests del flujo: nueva propiedad → cruce → match → WhatsApp al comprador → respuesta → ajuste demanda → recruce                                              | Test E2E del módulo 5                  |
| Cierre y documentación del día                                                                                                                               | —                                      |


#### Jueves (Día 10) — Robustez de workers + micro-frontends


| Tarea                                                                                                                              | Entregable                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Robustez del Worker de ingesta: errores, reconexión, logging, métricas                                                             | Worker robusto y observable              |
| Robustez del Worker de egestion: retry con backoff, dead-letter para fallos permanentes, alertas                                   | Worker resiliente                        |
| Micro-frontend post-visita: formulario Next.js para interés (alto/medio/bajo) + notas → API → evento en Neon                       | Micro-frontend funcional                 |
| Micro-frontend de agenda: selección de hora de visita, integración básica con Google Calendar                                      | Formulario de booking                    |
| Conectar micro-frontends al flujo: visita → interés → scoring actualizado → consulta Statefox → traductor demanda→filtros Statefox | Flujo integrado + query builder Statefox |
| Cierre y documentación del día                                                                                                     | —                                        |


#### Viernes (Día 11) — M6: Microsite de selección + validación + refactor


| Tarea                                                                                                                                                                                                   | Entregable                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Microsite de selección para compradores v1: consulta Statefox por zona/tipo/precio/metros → página Next.js con token único /seleccion/{token}                                                           | Microsite funcional            |
| Backend del microsite: persistir qué propiedades se mostraron, a qué comprador, cuándo. Fichas con imágenes, precio, metros, zona. Botones "Me interesa" / "No me encaja" → eventos SELECCION_COMPRADOR | Backend + tracking funcional   |
| Flujo de validación: notificación al comercial → micro-frontend de aprobación (30–60 s) → evento SELECCION_VALIDADA → envío enlace al comprador por WhatsApp. SLA validación 2 h                        | Flujo de validación end-to-end |
| Refactor general Sprint 1: código limpio, utilidades, tipos                                                                                                                                             | Codebase limpio                |
| Tests de integración del Sprint 1 completo                                                                                                                                                              | Suite de tests robusta         |
| Preparar demo del sábado                                                                                                                                                                                | —                              |


#### Sábado (Día 12) — DEMO Semana 2


| Actividad                                                                                                                                                                                  | Entregable |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| DEMO: Flujo completo en vivo — lead entra → scoring → WhatsApp al comercial → respuesta comprador → Smart Matching → cruce → Statefox → microsite → validación → envío enlace al comprador | —          |
| Retrospectiva Sprint 1                                                                                                                                                                     | —          |
| Deuda técnica, documentación, preparación Sprint 2                                                                                                                                         | —          |


**Entregable Sprint 1:**

- Pipeline completo de leads (ingestión → scoring → asignación → WhatsApp).
- Smart Matching v1 (ajuste de demanda por IA).
- Statefox API integrada + Microsite de selección para compradores.
- Micro-frontends de post-visita y agenda.
- Workers resilientes con retry y logging.

---

## Sprint 2 (Semanas 3–4): Módulos Avanzados de Negocio

**Objetivo:** Smart Closing, Motor de Pricing, Post-Venta, Dashboard Comercial, Dashboard Colaboradores, Dashboard CEO.

### Semana 3 — Smart Closing + Motor de Pricing

#### Lunes (Día 13) — M8: Motor de plantillas de contratos


| Tarea                                                                                                                                 | Entregable                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Diseñar motor de plantillas de contratos: variables, bloques condicionales, tipos (señal, arras, anexo mobiliario). Tipos TypeScript  | types/contracts + diseño documentado |
| Generación programática de docx: plantilla de arras con variables inyectables                                                         | Generación de docx funcional         |
| Extracción de datos para contratos: comprador + vendedor + inmueble + operación desde Neon + Inmovilla → payload completo             | Función de extracción completa       |
| Validación de campos obligatorios: si faltan datos (DNI, domicilio, precio, plazos) → evento DATOS_INCOMPLETOS y tarea para comercial | Validación funcional                 |
| Prueba: cambio de estado en Inmovilla → ingesta detecta → extraer datos → generar borrador v1 → guardar en S3                         | Flujo de generación end-to-end       |


#### Martes (Día 14) — M8: Revisión por voz + STT + versionado


| Tarea                                                                                                                            | Entregable                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Integrar OpenAI Whisper: API Route que recibe audio → transcribe a texto                                                         | Endpoint STT funcional        |
| Intérprete de instrucciones verbales con LangGraph: transcripción → acciones (cambiar honorarios, tipo arras, plazos, cláusulas) | Agente de interpretación      |
| Conectar intérprete al motor de plantillas: instrucción → modificar variables/bloques → regenerar contrato v2                    | Ciclo voz→cambio→regeneración |
| Micro-frontend de revisión de contratos: gestor ve borrador, graba audio, ve cambios aplicados, aprueba                          | UI de Smart Closing           |
| Versionado de contratos: naming estándar, registro de versiones en Neon, diff entre versiones                                    | Versionado funcional          |
| Cierre y documentación del día                                                                                                   | —                             |


#### Miércoles (Día 15) — M8: Firma digital + M7: Motor de Pricing


| Tarea                                                                                                                                                                     | Entregable                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Firma digital **in-house**: envío, `/firma/{token}`, OTP por SMS, PDF sellado y eventos Neon; recordatorios y escalados **WhatsApp**; SLA 5 días naturales; cadencia +1/+3/+5; doc en `docs/firma-digital.md` y `docs/plan.md` Día 15 | Integración de firma + spec    |
| Flujo post-firma: guardar documento firmado → adjuntar en Inmovilla vía Egestion → actualizar estado operación                                                            | Flujo post-firma end-to-end    |
| Motor de Pricing v1: extraer variables del inmueble, consultar API Statefox por ciudad/tipo/precio/metros; usar precio €/m² ya calculado                                  | Extracción + consulta API      |
| Análisis de cluster comparativo: comparables de Statefox (misma zona ±15–20% metros, tipología similar, particular vs profesional) → precio medio €/m², desviación, rango | Análisis estadístico funcional |
| Motor de recomendación con LangGraph: análisis → diagnóstico textual + recomendaciones (mantener/ajustar/reposicionar)                                                    | Agente de pricing              |
| Cierre y documentación del día                                                                                                                                            | —                              |


#### Jueves (Día 16) — M7: UI de Pricing + M9: Post-Venta


| Tarea                                                                                                                                                 | Entregable               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Informe de pricing para el comercial: micro-frontend con semáforo (VERDE/AMARILLO/ROJO), diagnóstico, recomendaciones accionables                     | UI de informe de pricing |
| Conectar Motor de Pricing al flujo: ingesta detecta alta/cambio → análisis → informe al comercial vía WhatsApp + micro-frontend                       | Flujo automatizado       |
| Triggers adicionales de pricing: inmueble sin leads X días, visitas sin ofertas (cron de reevaluación)                                                | Triggers de reevaluación |
| Cadencias de post-venta (M9): cron según "días desde cierre" — D0 agradecimiento, D3–7 soporte, D10–14 reseña, D21–30 referidos, D90–180 re-captación | Cadencias programadas    |
| Micro-frontend post-venta: "Todo OK" / "Necesito ayuda" + mini-guía. Incidencias: pausa cadencia, tarea, reanudar al resolver                         | UI post-venta            |
| Cierre y documentación del día                                                                                                                        | —                        |


#### Viernes (Día 17) — M9: Reseñas/Referidos + M10: Dashboard Comercial


| Tarea                                                                                                                      | Entregable         |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Solicitud de reseñas: verificar no-incidencias → solicitud Google Review vía WhatsApp → recordatorio si no responde        | Flujo de reseñas   |
| Activación de referidos: mensaje + enlace a formulario. Segmentación comprador residencial / inversor / vendedor           | Flujo de referidos |
| Dashboard Comercial v1 (M10): schema de métricas en Neon, queries para KPIs (conversión, facturación, tiempo medio cierre) | Schema + queries   |
| API Routes para dashboard: datos por comercial y por id                                                                    | Endpoints de datos |
| Tests de integración Smart Closing y Motor de Pricing end-to-end                                                           | Tests suite        |
| Preparar demo sábado                                                                                                       | —                  |


#### Sábado (Día 18) — DEMO Semana 3


| Actividad                                                                                                                          | Entregable |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| DEMO: Smart Closing en vivo (generar contrato + revisión por voz + firma), Motor de Pricing con informe real, cadencias post-venta | —          |
| Retrospectiva, deuda técnica, documentación                                                                                        | —          |


---

### Semana 4 — Dashboards + Colaboradores Externos

#### Lunes (Día 19) — M10: Dashboard Comercial UI + clasificación


| Tarea                                                                                                                                                   | Entregable              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| UI Dashboard Comercial: micro-frontend con tabla de métricas por comercial, gráficos de conversión, ranking de rentabilidad                             | Dashboard funcional     |
| Clasificación automática de comerciales: perfil (top performer / productivo ineficiente / dependiente del lead caliente / bajo rendimiento estructural) | Clasificación funcional |
| Alertas del dashboard: cron que detecta caída 2 semanas, SLA incumplido, desviación vs media → notificación WhatsApp                                    | Alertas funcionales     |
| Vistas por rol: CEO ve todo, jefe de zona su equipo, comercial solo su perfil                                                                           | Control de acceso       |
| Cierre y documentación del día                                                                                                                          | —                       |


#### Martes (Día 20) — M11: Colaboradores externos


| Tarea                                                                                                                                                                | Entregable              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Schema de colaboradores externos en Neon: tipo (banco/abogado/tasador/arquitecto), ciudad, SLA, hitos, métricas                                                      | Schema + migraciones    |
| Panel interno de gestión de colaboradores: interfaz del dashboard donde el Comercial/CEO asigna colaboradores, sube documentos en su nombre y actualiza estados (kanban). Los colaboradores no acceden al sistema. Estado en Neon | Panel interno funcional |
| Tracking de hitos: cada cambio de estado registra timestamp. Tiempos calculados automáticamente. Hitos estándar por tipo                                             | Tracking funcional      |
| Alertas SLA de colaboradores: cron detecta retrasos → alerta jefe de zona o CEO según severidad                                                                      | Alertas funcionales     |
| Clasificación automática de colaboradores: partner estratégico / funcional / lento / crítico                                                                         | Clasificación funcional |
| Cierre y documentación del día                                                                                                                                       | —                       |


#### Miércoles (Día 21) — M11: Dashboard Colaboradores + M13: Dashboard CEO


| Tarea                                                                                                                              | Entregable             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Dashboard Colaboradores: UI con ranking por impacto en facturación, tiempos medios, semáforos, recomendaciones                     | Dashboard funcional    |
| Recomendaciones automáticas con LangGraph para colaboradores: concentrar en partners, reducir en lentos, alertar críticos          | Recomendaciones con IA |
| Dashboard CEO (M13): integrar datos de todos los módulos. Las 6 capas del gobierno estratégico. API Routes para datos consolidados | Schema + API Routes    |
| Capa 1 Dashboard CEO — Visión Ejecutiva: semáforos globales, facturación vs objetivo, EBITDA, cash, margen por operación           | UI ejecutiva v1        |
| Cierre y documentación del día                                                                                                     | —                      |


#### Jueves (Día 22) — M13: Dashboard CEO (Capas 2–6)


| Tarea                                                                                                                                                                          | Entregable               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Capa 2 — Rendimiento por ciudad: comparativa Córdoba/Málaga/Sevilla, comerciales, carga, propiedades activas, operaciones/mes, facturación, rentabilidad, coste de oportunidad | Vista por ciudad         |
| Capa 4 — Diagnóstico y recomendaciones con LangGraph: métricas → recomendaciones textuales justificadas (contratar, expandir, intervenir)                                      | Motor de recomendaciones |
| Capa 5 — Motor de expansión: criterios por ciudad candidata (facturación estable, margen, cash, liderazgo) → recomendación de expansión                                        | Evaluador de expansión   |
| Capa 6 — Control financiero: costes fijos/variables, coste por operación, ROI automatizaciones, reinversión                                                                    | Vista financiera         |
| Refactor de dashboards: componentes reutilizables, estilos consistentes, responsive                                                                                            | UI pulida                |
| Cierre y documentación del día                                                                                                                                                 | —                        |


#### Viernes (Día 23) — Integración Sprint 2 + feedback loop


| Tarea                                                                                                                                                                                          | Entregable               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Tests de integración de todos los dashboards. Verificar flujo de datos desde eventos hasta visualización                                                                                       | Tests suite              |
| Feedback loop del comprador: "Me interesa" / "No me encaja" en microsite → evento → LangGraph → actualiza demanda → Egestion escribe Inmovilla → nueva consulta Statefox → regenerar microsite | Feedback loop end-to-end |
| Integración end-to-end Sprint 2: verificar que todos los módulos interactúan. Flujo completo desde lead hasta cierre                                                                           | Flujo verificado         |
| Corregir bugs de integración. Hardening de manejo de errores                                                                                                                                   | Bugs resueltos           |
| Preparar demo + CHANGELOG                                                                                                                                                                      | —                        |


#### Sábado (Día 24) — DEMO Semana 4 (Fin Mes 1)


| Actividad                                                                                                                                        | Entregable |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| DEMO MES 1: Recorrido completo — dashboards CEO y comercial, Smart Closing con voz, Motor de Pricing, Gestión de colaboradores, cadencias post-venta | —          |
| Retrospectiva Sprint 2 + retrospectiva Mes 1                                                                                                     | —          |
| Deuda técnica, documentación del mes, planificación ajustada Mes 2                                                                               | —          |


**Entregable Sprint 2 (Mes 1 completo):**

- Smart Closing funcional (generación → voz → firma digital).
- Motor de Pricing con informes y recomendaciones IA.
- Post-venta con cadencias, incidencias y reseñas.
- Dashboard Comercial con clasificación y alertas.
- Dashboard Colaboradores con tracking y SLAs.
- Dashboard CEO v1 con visión ejecutiva y recomendaciones (6 capas).

---

## Sprint 3 (Semanas 5–6): Bot Mental + Refinamiento IA + Hardening

**Objetivo:** Bot de soporte mental, refinar flujos de IA, robustez, observabilidad, seguridad e integración end-to-end.

### Semana 5 — Bot de Soporte Mental + Refinamiento Smart Matching

#### Lunes (Día 25) — M12: Bot de Soporte Mental


| Tarea                                                                                                                                                                     | Entregable                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Diseñar grafo LangGraph del Bot: flujos de bloqueo (miedo/inseguridad/presión/ego/fatiga), preparación pre-cierre, simulación objeciones, descarga emocional, crecimiento | Diseño del grafo documentado |
| Grafo base: nodo raíz → clasificación estado mental (tipo bloqueo, energía, foco vs dispersión) → routing a subflujo                                                      | Grafo base funcional         |
| Subflujo preparación pre-cierre: 5 preguntas guiadas, anclajes, simulación objeciones, micro-rutinas pre-cierre                                                           | Subflujo funcional           |
| Subflujo de bloqueo: detección tipo (miedo, ego, fatiga), ejercicios de reencuadre 2–5 min, acción inmediata                                                              | Subflujo funcional           |
| Conectar bot a WhatsApp Business como canal privado. Comercial escribe al bot y recibe respuesta del grafo. Confidencialidad garantizada                                  | Bot accesible vía WhatsApp   |
| Cierre y documentación del día                                                                                                                                            | —                            |


#### Martes (Día 26) — M12: Desarrollo continuo + refinamiento IA


| Tarea                                                                                                                                                                      | Entregable              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Programas de desarrollo continuo: micro-ejercicios diarios, retos semanales (mentalidad alto ticket, gestión rechazo, disciplina emocional) → cadencia automática WhatsApp | Cadencias de desarrollo |
| Capa 5 del bot — Feedback estratégico: métricas agregadas de uso sin exponer conversaciones → alertas de riesgo al CEO (caída energía, bloqueo recurrente, sobrecarga)     | Reporting agregado      |
| Integrar bot con contexto CRM (sin invadir): sabe si hay cierres pendientes, operación perdida reciente, racha. Sin acceso a facturación individual                        | Contexto CRM integrado  |
| Refinar Smart Matching v2: mejores prompts para extracción de variables desde texto libre. Más edge cases                                                                  | Smart Matching v2       |
| Refinar scoring de leads v2: más señales (origen, tipo mensaje, historial), ajustar pesos con datos acumulados                                                             | Scoring v2              |
| Cierre y documentación del día                                                                                                                                             | —                       |


#### Miércoles (Día 27) — Refinamiento IA + observabilidad


| Tarea                                                                                                                                           | Entregable         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Refinar Motor de Pricing v2: mejores prompts, análisis de tendencia temporal, formato de informe                                                | Pricing v2         |
| Refinar Smart Closing v2: intérprete de instrucciones verbales, más cláusulas, fallback ante ambigüedad (preguntar al gestor si confianza baja) | Smart Closing v2   |
| Observabilidad: logging estructurado (JSON) en workers y API Routes, métricas de latencia, errores, throughput                                  | Sistema de logging |
| Panel de health: micro-frontend con estado de workers, último poll exitoso, errores recientes, cola de jobs                                     | Health panel       |
| Tests de carga: múltiples leads simultáneos, Job Queue maneja concurrencia sin duplicados                                                       | Tests de carga     |
| Cierre y documentación del día                                                                                                                  | —                  |


#### Jueves (Día 28) — Hardening de workers


| Tarea                                                                                                                                 | Entregable              |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Hardening Worker de ingesta: errores API REST (429, 401), fallback a caché. Legacy: cambios de UI, selectores alternativos            | Worker hardened         |
| Hardening Worker de egestion: circuit breaker (X fallos → pausar y alertar), verificación post-escritura. Reintentos ante rate limits | Worker hardened         |
| Idempotencia total: reprocesar eventos no causa duplicados ni inconsistencias                                                         | Idempotencia verificada |
| Dead-letter queue: jobs que fallan N veces → DLQ con contexto para debugging manual                                                   | DLQ funcional           |
| Documentar sistema de Workers: ingestion.md, egestion.md, diagramas de flujo                                                          | Docs de workers         |
| Cierre y documentación del día                                                                                                        | —                       |


#### Viernes (Día 29) — Auth + seguridad


| Tarea                                                                                                              | Entregable         |
| ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Autenticación y autorización en micro-frontends: login para comerciales, gestores, CEO. Roles y permisos por vista | Auth funcional     |
| Protección de API Routes: middleware de auth, rate limiting, validación de input (zod)                             | API segura         |
| Tests de seguridad: comercial no ve datos de otro, roles respetados, API no acepta payloads malformados            | Tests de seguridad |
| Refactor y cleanup Sprint 3                                                                                        | Codebase limpio    |
| Preparar demo                                                                                                      | —                  |


#### Sábado (Día 30) — DEMO Semana 5


| Actividad                                                                                                                   | Entregable |
| --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| DEMO: Bot de soporte mental en vivo, panel de health, mejoras de IA (Smart Matching v2, Pricing v2, Smart Closing v2), auth | —          |
| Retrospectiva, deuda técnica                                                                                                | —          |


---

### Semana 6 — Integración E2E + Refinamiento UI

#### Lunes (Día 31) — Test de integración E2E


| Tarea                                                                                                                                         | Entregable             |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Test de integración end-to-end completo: flujo real desde lead de Idealista hasta cierre, pasando por todos los módulos. Documentar cada paso | Reporte de integración |
| Corregir todos los bugs encontrados. Priorizar por criticidad                                                                                 | Bugs resueltos         |


#### Martes (Día 32) — UI final


| Tarea                                                                                                                        | Entregable                |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Pulir UI de todos los micro-frontends: diseño consistente, responsive, accesibilidad, estados loading/error                  | UI pulida                 |
| Pulir Dashboard CEO: visualizaciones claras, semáforos, drill-down desde visión ejecutiva hasta detalle por comercial/ciudad | Dashboard CEO final       |
| Pulir Dashboard Comercial: gráficos de tendencia, comparativa con media, objetivos mensuales visuales                        | Dashboard Comercial final |


#### Miércoles (Día 33) — Notificaciones + aprendizaje + documentación API


| Tarea                                                                                                                        | Entregable               |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Notificaciones unificadas: módulo central que decide cuándo y cómo notificar (WhatsApp, email, UI push). Sin sobre-notificar | Módulo de notificaciones |
| Feedback loop de aprendizaje del scoring: analizar leads cerrados vs no cerrados, recalcular pesos                           | Auto-calibración         |
| Documentación API: todos los endpoints con ejemplos request/response en docs/api/                                            | Documentación API        |


#### Jueves (Día 34) — Performance + arquitectura final


| Tarea                                                                                                               | Entregable                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Performance: queries Neon optimizadas (índices), caché donde convenga, lazy loading en UIs                          | Rendimiento optimizado        |
| Documentación de arquitectura final: diagrama actualizado, flujos de datos, decisiones técnicas, guía de despliegue | docs/architecture.md completo |
| Actualizar README: setup completo, variables de entorno, cómo ejecutar cada componente                              | README final                  |


#### Viernes (Día 35) — Tests completos + runbook


| Tarea                                                                                                                               | Entregable      |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Test suite completo: unit, integration, E2E. Corregir fallos. Cobertura > 70%                                                       | Tests verdes    |
| Runbook de operaciones: qué hacer si un worker falla, si Inmovilla cambia UI, si WhatsApp rechaza mensajes, si Neon tiene problemas | docs/runbook.md |
| Preparar demo                                                                                                                       | —               |


#### Sábado (Día 36) — DEMO Semana 6


| Actividad                                                              | Entregable |
| ---------------------------------------------------------------------- | ---------- |
| DEMO: Sistema completo integrado, UI final, performance, documentación | —          |
| Retrospectiva Sprint 3                                                 | —          |
| Planificación Sprint 4                                                 | —          |


**Entregable Sprint 3:**

- Bot de soporte mental funcional vía WhatsApp (5 capas).
- Módulos de IA refinados (v2).
- Observabilidad (logging, health panel).
- Workers hardened (circuit breaker, DLQ, idempotencia).
- Auth y seguridad en micro-frontends.
- Integración end-to-end verificada.
- UI pulida y consistente.
- Documentación API, arquitectura, runbook completos.

---

## Sprint 4 (Semanas 7–8): Producción + Documentación Final

**Objetivo:** Preparar para producción, testing exhaustivo, despliegue gradual, documentación final y v1.0.0.

### Semana 7 — Staging + Testing exhaustivo

#### Lunes (Día 37) — Deploy a Staging


| Tarea                                                                                                                                    | Entregable         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Entorno de staging: desplegar aplicación (Vercel o servidor), Neon de staging, variables de entorno                                      | Staging operativo  |
| Workers en staging: cron-jobs con API Inmovilla/Statefox contra datos reales en lectura. RPA legacy de demandas contra entorno de prueba | Workers en staging |
| Deploy completo a staging. Verificar funcionamiento fuera de localhost                                                                   | Sistema en staging |


#### Martes (Día 38) — Testing en Staging


| Tarea                                                                                                  | Entregable         |
| ------------------------------------------------------------------------------------------------------ | ------------------ |
| Testing exhaustivo en staging: todos los flujos con datos reales o cuasi-reales. Documentar cada fallo | Reporte de testing |
| Corregir bugs de staging. Diferencias entre local y producción                                         | Bugs resueltos     |


#### Miércoles (Día 39) — Edge cases + degradación + monitoreo


| Tarea                                                                                                                    | Entregable             |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Edge cases: Inmovilla caído, WhatsApp rechaza envío, LangGraph devuelve basura, lead sin datos mínimos                   | Edge cases cubiertos   |
| Graceful degradation: si un servicio externo falla, el sistema sigue operando lo posible y alerta                        | Degradación controlada |
| Monitoreo de producción: alertas por correo/WhatsApp si workers se detienen, errores > umbral, cola crece sin procesarse | Monitoreo funcional    |


#### Jueves (Día 40) — Seguridad final + performance + rollback


| Tarea                                                                                                                   | Entregable             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Revisión de seguridad final: credenciales rotadas, secrets en variables (no en código), HTTPS, sanitización de inputs   | Checklist de seguridad |
| Revisión de performance final: latencia en staging, optimizar queries lentas, verificar que polling no sature Inmovilla | Performance verificada |
| Plan de rollback: cómo revertir si algo sale mal en producción                                                          | Plan de rollback       |


#### Viernes (Día 41) — Dry run de producción


| Tarea                                                                                                     | Entregable         |
| --------------------------------------------------------------------------------------------------------- | ------------------ |
| Dry run de producción: simular un día completo con datos reales. Cronometrar, medir errores, validar SLAs | Reporte de dry run |
| Corregir últimos bugs del dry run                                                                         | Bugs resueltos     |
| Preparar demo + documentación de release                                                                  | —                  |


#### Sábado (Día 42) — DEMO Semana 7


| Actividad                                                                           | Entregable |
| ----------------------------------------------------------------------------------- | ---------- |
| DEMO: Sistema en staging con datos reales, métricas de performance, plan de go-live | —          |
| Retrospectiva, ajustes finales                                                      | —          |


---

### Semana 8 — Go-Live + Documentación final

#### Lunes (Día 43) — Deploy a producción


| Tarea                                                                             | Entregable            |
| --------------------------------------------------------------------------------- | --------------------- |
| Deploy a producción: aplicación, Neon de producción, activar workers              | Sistema en producción |
| Activación gradual: empezar con 1 comercial y 1 ciudad. Monitorear en tiempo real | Piloto activo         |
| Monitorear y corregir incidencias en tiempo real                                  | —                     |


#### Martes (Día 44) — Piloto + expansión


| Tarea                                                                | Entregable           |
| -------------------------------------------------------------------- | -------------------- |
| Monitorear el piloto. Ajustar configuraciones basado en datos reales | Ajustes documentados |
| Expandir piloto: activar más comerciales/ciudades si todo es estable | Expansión controlada |


#### Miércoles (Día 45) — Monitoreo + documentación final


| Tarea                                                                                             | Entregable   |
| ------------------------------------------------------------------------------------------------- | ------------ |
| Continuar monitoreo. Resolver incidencias prioritarias                                            | —            |
| Documentación final del proyecto: actualizar toda la documentación con lo aprendido en producción | Docs finales |


#### Jueves (Día 46) — Guías de mantenimiento + release final


| Tarea                                                                                                                          | Entregable                |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Guía de mantenimiento: cómo actualizar plantillas, añadir comerciales, cambiar pesos de scoring, ajustar SLAs, añadir ciudades | docs/maintenance-guide.md |
| Guía de troubleshooting: problemas comunes y cómo resolverlos                                                                  | docs/troubleshooting.md   |
| Release final: v1.0.0                                                                                                          | Versión v1.0.0            |


#### Viernes (Día 47) — Buffer + roadmap


| Tarea                                                                                        | Entregable      |
| -------------------------------------------------------------------------------------------- | --------------- |
| Buffer: incidencias pendientes, documentación faltante                                       | —               |
| Roadmap post-lanzamiento: mejoras futuras, features pendientes, optimizaciones identificadas | docs/roadmap.md |
| Preparar demo final                                                                          | —               |


#### Sábado (Día 48) — DEMO FINAL


| Actividad                                                                                                  | Entregable |
| ---------------------------------------------------------------------------------------------------------- | ---------- |
| DEMO FINAL: Sistema en producción, métricas reales, dashboards con datos vivos, recorrido de todo el flujo | —          |
| Retrospectiva final del proyecto                                                                           | —          |
| Celebración + planificación de fase 2                                                                      | —          |


**Entregable Sprint 4:**

- Sistema desplegado y operativo en producción.
- Piloto ejecutado con datos reales.
- Monitoreo y alertas activos.
- Documentación completa (mantenimiento, troubleshooting, roadmap).
- Release v1.0.0 publicado.

---

## Criterios de Aceptación por Sprint

### Sprint 1 — Cimientos del Orquestador


| #   | Criterio                                                  | Verificación                                                      |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Event Store persiste y recupera eventos correctamente     | Test: append + get devuelve datos consistentes                    |
| 2   | Job Queue procesa y reintenta jobs                        | Test: job falla → se reintenta → completa                         |
| 3   | Worker de ingesta lee propiedades y demandas de Inmovilla | Demostración en vivo: ejecutar worker y ver eventos en Neon       |
| 4   | Worker de egestion escribe en Inmovilla                   | Demostración: escribir campo de prueba, verificar en Inmovilla    |
| 5   | WhatsApp envía y recibe mensajes                          | Demo: enviar mensaje a sandbox, recibir respuesta, evento en Neon |
| 6   | Scoring asigna score y SLA correcto                       | Test: lead con preaprobación obtiene score ≥80, SLA <5 min        |
| 7   | Smart Matching extrae variables de texto libre            | Test: "quiero más metros y otra zona" → extrae metros y zona      |
| 8   | Cruce de demandas genera matches correctos                | Test: propiedad nueva → matches contra demandas compatibles       |
| 9   | Statefox API lee propiedades + microsite generado         | Demo: consulta API devuelve propiedades, microsite visible        |
| 10  | Pipeline lead-to-notification funciona E2E                | Demo: lead entra → scoring → asignación → WhatsApp                |


### Sprint 2 — Módulos Avanzados


| #   | Criterio                                           | Verificación                                                      |
| --- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Motor de plantillas genera contrato desde datos    | Test: datos completos → docx generado con variables correctas     |
| 2   | STT transcribe audio y extrae instrucciones        | Demo: grabar "cambia honorarios a 3%" → variable modificada       |
| 3   | Firma digital in-house envía y captura firma     | Test: enviar doc a firma, OTP y cierre vía `/api/firma/.../sign`   |
| 4   | Motor de Pricing genera informe con semáforo       | Demo: inmueble → análisis → informe con diagnóstico               |
| 5   | Post-venta ejecuta cadencias según fecha de cierre | Test: simular cierre → verificar mensajes en D0, D3, D10, D21     |
| 6   | Dashboard Comercial muestra métricas por persona   | Demo: datos → tabla con ranking y clasificación                   |
| 7   | Dashboard Colaboradores trackea hitos y tiempos    | Demo: operación con banco → tiempos calculados, alerta si retraso |
| 8   | Dashboard CEO muestra las 6 capas                  | Demo: semáforos, rendimiento por ciudad, recomendaciones IA       |
| 9   | Clasificación automática de comerciales funciona   | Test: comercial con conversión baja → clasificado correctamente   |
| 10  | Flujo completo lead→cierre funciona E2E            | Demo: recorrer todo el pipeline en vivo                           |


### Sprint 3 — Bot Mental + Hardening


| #   | Criterio                                   | Verificación                                               |
| --- | ------------------------------------------ | ---------------------------------------------------------- |
| 1   | Bot responde a comercial vía WhatsApp      | Demo: escribir "estoy bloqueado" → respuesta personalizada |
| 2   | Bot no expone conversaciones al CEO        | Verificar: dashboard CEO solo muestra datos agregados      |
| 3   | IA v2 mejora extracción de variables       | Test: comparar precisión v1 vs v2 con mismos inputs        |
| 4   | Workers resisten fallos de Inmovilla       | Test: simular fallo → circuit breaker activa → alerta      |
| 5   | Idempotencia verificada                    | Test: reprocesar eventos → sin duplicados                  |
| 6   | Auth funciona en todos los micro-frontends | Test: comercial no ve datos de otro comercial              |
| 7   | Panel de health muestra estado real        | Demo: parar un worker → panel lo refleja                   |
| 8   | UI responsive y consistente                | Demo: mostrar en mobile y desktop                          |
| 9   | Cobertura de tests > 70%                   | Ejecutar suite y verificar cobertura                       |
| 10  | Documentación API completa                 | Verificar: todos los endpoints documentados con ejemplos   |


### Sprint 4 — Producción


| #   | Criterio                                           | Verificación                                              |
| --- | -------------------------------------------------- | --------------------------------------------------------- |
| 1   | Sistema funciona en staging fuera de localhost     | Demo: acceder por URL pública                             |
| 2   | Edge cases manejados con graceful degradation      | Test: apagar servicio externo → sistema alerta y continúa |
| 3   | Monitoreo envía alertas correctamente              | Test: provocar error → recibir alerta por WhatsApp        |
| 4   | Dry run completa un día sin errores críticos       | Reporte de dry run                                        |
| 5   | Seguridad verificada (no secrets en código, HTTPS) | Checklist de seguridad completado                         |
| 6   | Piloto con datos reales exitoso                    | Métricas del piloto documentadas                          |
| 7   | Documentación de mantenimiento completa            | Verificar: guía cubre todos los escenarios                |
| 8   | Plan de rollback documentado y probado             | Verificar: procedimiento claro paso a paso                |
| 9   | Release v1.0.0 publicado                           | Versión en repositorio                                    |
| 10  | Roadmap post-lanzamiento definido                  | Documento con prioridades futuras                         |


---

## Resumen de Entregables por Semana


| Semana | Versión        | Entregable principal                                                                |
| ------ | -------------- | ----------------------------------------------------------------------------------- |
| S1     | v0.1.0-week-01 | Event Store + Workers (API REST + legacy) + Statefox API + Tipos de dominio         |
| S2     | v0.1.1-week-02 | Lead scoring + WhatsApp + Smart Matching + Microsite de selección + Micro-frontends |
| S3     | v0.2.0-week-03 | Smart Closing (plantillas + voz + firma) + Motor de Pricing + Post-venta            |
| S4     | v0.2.1-week-04 | Dashboards (Comercial + Colaboradores + CEO con 6 capas)                            |
| S5     | v0.3.0-week-05 | Bot Mental + IA refinada v2 + Auth + Hardening Workers                              |
| S6     | v0.3.1-week-06 | Integración E2E + UI final + Documentación completa                                 |
| S7     | v0.4.0-week-07 | Staging completo + Testing exhaustivo + Plan de rollback                            |
| S8     | v1.0.0         | Producción + Go-live gradual + Documentación final                                  |


---

## Métricas de Progreso

### Métricas de producto (post-lanzamiento)


| Métrica                                         | Objetivo    |
| ----------------------------------------------- | ----------- |
| Tiempo de primera respuesta a lead (score ≥80)  | < 5 minutos |
| Tasa de leads procesados automáticamente        | > 90%       |
| Uptime de workers                               | > 99%       |
| Tasa de errores de escritura en Inmovilla (API) | < 1%        |
| Tasa de errores de escritura (demandas legacy)  | < 5%        |
| Contratos generados sin intervención manual     | > 80%       |


---

## Gestión de Riesgos

### Riesgos técnicos


| Riesgo                                   | Prob. | Impacto | Mitigación                                                                                                      | Contingencia                                                           |
| ---------------------------------------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Inmovilla cambia UI/endpoints legacy     | Media | Alto    | API REST para clientes/propiedades no depende de UI. Demandas: selectores con fallback, alertas, modo degradado | Modo manual para demandas; cola acumula jobs. API REST sigue operando. |
| WhatsApp rechaza plantillas              | Media | Medio   | Plantillas alternativas pre-aprobadas, texto conservador                                                        | Usar plantillas genéricas mientras se resubmiten                       |
| LangGraph produce outputs inconsistentes | Media | Medio   | Validación de schema en outputs, fallback a reglas                                                              | Degradar a motor de reglas, alertar para revisión manual               |
| Neon tiene latencia alta                 | Baja  | Medio   | Connection pooling, queries optimizadas, caché local                                                            | Caché de lectura local, reintentos con backoff                         |
| Statefox API cambia contratos            | Baja  | Medio   | Versionado de cliente, tests de contrato, tipado estricto                                                       | Caché local, degradación a datos en Neon                               |
| API REST Inmovilla rate limits           | Media | Medio   | Listado+diff para minimizar llamadas. Caché de enums. Backoff ante 408.                                         | Fallback a polling legacy para lectura masiva                          |
| Token API REST Inmovilla caduca          | Baja  | Alto    | Monitoreo de expiración, health check del token                                                                 | Regenerar token en Ajustes; alertar al equipo                          |
| Composio/Gmail falla o cambia OAuth      | Media | Alto    | Health check periódico. Alertar si login legacy falla.                                                          | Login manual temporal para demandas urgentes. API REST no afectada.    |
| Polígonos geoespaciales incorrectos      | Media | Alto    | Validación antes de enviar a Inmovilla. Tests con zonas conocidas.                                              | Fallback a key_zona (menos preciso). Cruce por zona textual.           |


### Riesgos de proyecto


| Riesgo                                    | Prob. | Impacto | Mitigación                                  | Contingencia                                         |
| ----------------------------------------- | ----- | ------- | ------------------------------------------- | ---------------------------------------------------- |
| Bloqueo > 1 día                           | Media | Alto    | Documentar bloqueante, pivotar a otra tarea | Escalar al PM, replantear tarea, enfoque alternativo |
| Scope creep (requisitos nuevos)           | Alta  | Alto    | Backlog estricto, nuevas features a fase 2  | Priorizar por valor, negociar trade-offs             |
| Credenciales no disponibles a tiempo      | Media | Alto    | Lista de prerrequisitos en día 0            | Usar mocks/sandbox mientras se resuelve              |
| Rendimiento insuficiente con datos reales | Baja  | Medio   | Testing temprano con datos reales en S7     | Optimización, caching, query tuning                  |


---

## Glosario


| Término                    | Definición                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **La Bóveda**              | Inmovilla CRM. Repositorio de datos legales. API REST para clientes, propiedades y propietarios; demandas y estados requieren proceso legacy. |
| **Worker de ingesta**      | Proceso que lee datos de Inmovilla (API REST para propiedades, legacy para demandas) y de Statefox y emite eventos.                           |
| **Worker de egestion**     | Proceso que escribe en Inmovilla: API REST para clientes/propiedades/propietarios, legacy para demandas y estados.                            |
| **Event Store**            | Base de datos donde se guardan todos los eventos del sistema como registros inmutables.                                                       |
| **Job Queue**              | Cola de tareas con reintentos, idempotencia y dead-letter queue.                                                                              |
| **Proyección**             | Vista del estado actual calculada a partir de los eventos del Event Store.                                                                    |
| **Smart Matching**         | Módulo de IA que interpreta respuestas de texto libre y ajusta demandas automáticamente en Inmovilla.                                         |
| **Smart Closing**          | Generación de contratos con variables + revisión por voz (STT + IA) + firma digital.                                                          |
| **Motor de Pricing**       | Sistema que compara un inmueble contra el mercado (Statefox) y genera diagnóstico + recomendaciones.                                          |
| **SLA**                    | Tiempo máximo para atender un lead según su score (ej: ≥80 → <5 min).                                                                         |
| **Score**                  | Puntuación 0–100 de un lead. Fórmula: 0.55×Pclose + 0.30×Value + 0.15×Urgency.                                                                |
| **Cadencia**               | Secuencia automática de mensajes programados (ej: D+1, D+3, D+7 para follow-up).                                                              |
| **Circuit Breaker**        | Si X operaciones consecutivas fallan, el worker se pausa y alerta.                                                                            |
| **DLQ**                    | Cola donde van los jobs que fallan N veces; se preserva contexto para análisis.                                                               |
| **Micro-frontend**         | Interfaz web específica para una tarea (post-visita, validación, dashboard).                                                                  |
| **Microsite de selección** | Página propia que muestra propiedades de Statefox al comprador con branding Urus Capital.                                                     |
| **Contacto (Inmovilla)**   | Persona (comprador, vendedor, inversor). Accesible vía API REST. El "lead" se materializa como Contacto + Demanda.                            |
| **Demanda (Inmovilla)**    | Búsqueda activa de un comprador con criterios y polígono geoespacial. No accesible vía API REST; requiere proceso legacy.                     |
| **Statefox**               | Plataforma de análisis de mercado inmobiliario. Se consume por API para stock externo y comparables. Microsites se generan localmente.        |


---

> **Nota:** Este plan es un documento de referencia para trazabilidad y presentación de avances al equipo. Se actualiza según el progreso real y el feedback de las demos semanales.

