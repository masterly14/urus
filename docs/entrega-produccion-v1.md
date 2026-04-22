# Urus Capital — Documentación de Entrega a Producción v1.0

> **Fecha de publicación:** 19 de abril de 2026
> **Destinatarios:** Dirección de Urus Capital Group
> **Tipo:** Documento de referencia para la reunión de entrega y operación diaria

---

## Índice de la Presentación

1. [Resumen Ejecutivo — ¿Qué es lo que se ha construido?](#1-resumen-ejecutivo)
2. [Lo que Urus Capital puede hacer AHORA MISMO](#2-lo-que-urus-capital-puede-hacer-ahora-mismo)
3. [¿Cómo funciona el sistema en el día a día?](#3-cómo-funciona-el-sistema-en-el-día-a-día)
4. [Mapa de Pantallas y Accesos](#4-mapa-de-pantallas-y-accesos)
5. [Plan de las Próximas 4 Semanas — Observación y Ajuste](#5-plan-de-las-próximas-4-semanas)
6. [¿Qué debo vigilar? — Métricas y Señales Clave](#6-qué-debo-vigilar)
7. [Preguntas Frecuentes (FAQ)](#7-preguntas-frecuentes)
8. [¿Cómo reportar problemas o incongruencias?](#8-cómo-reportar-problemas)
9. [Glosario — Términos que aparecerán en el sistema](#9-glosario)
10. [Dependencias Pagas — Servicios y Costes del Sistema](#10-dependencias-pagas)
11. [Hoja de ruta futura](#11-hoja-de-ruta-futura)

---

## 1. Resumen Ejecutivo

### ¿Qué se ha construido?

Se ha construido un **sistema de automatización integral** que envuelve el CRM actual (Inmovilla) y lo convierte en el centro de un ecosistema inteligente. El sistema no reemplaza Inmovilla — lo potencia. Inmovilla sigue siendo donde viven los datos y definitivos. Lo que se ha añadido encima es un "cerebro" que:

- **Lee automáticamente** todo lo que pasa en Inmovilla (propiedades nuevas, cambios de precio, demandas, contactos).
- **Piensa y decide** (cruza compradores con propiedades, puntúa leads, analiza precios de mercado).
- **Actúa** (envía WhatsApp a compradores, genera contratos, envía recordatorios, notifica al comercial).
- **Aprende** (cada interacción afina la demanda del comprador sin intervención humana).
- **Informa** (dashboards para el CEO, para comerciales, para gestión de colaboradores).

### ¿Cuánto tiempo se desarrolló?

8 semanas de desarrollo intensivo (4 sprints de 2 semanas cada uno), con demo cada sábado y ajustes continuos basados en el feedback.

### ¿Qué problema resuelve?


| Antes (sin sistema)                               | Después (con sistema)                                            |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| El comercial persigue leads manualmente           | El sistema prioriza, asigna y hace seguimiento automático        |
| Se pierden leads por falta de seguimiento         | El sistema nunca olvida un cliente                               |
| Decisiones por intuición o "sensaciones"          | Decisiones basadas en datos reales                               |
| Escalar = contratar más gente sin control         | Escalar = replicar un sistema probado                            |
| 45-90 minutos para analizar precio de un inmueble | 3-5 minutos (el sistema hace el análisis)                        |
| 45-100 minutos para preparar un contrato          | 7-20 minutos (generación automática + revisión por voz)          |
| Post-venta inexistente o manual                   | Cadencia automática: agradecimiento, soporte, reseñas, referidos |


### Tiempo liberado por perfil


| Quién              | Ahorro semanal estimado | ¿En qué puede invertir ese tiempo?                 |
| ------------------ | ----------------------- | -------------------------------------------------- |
| **Comercial**      | 15–20 horas             | Llamadas de calidad, visitas, cierres              |
| **Jefe de equipo** | 15–20 horas             | Mejorar al equipo, detectar problemas, optimizar   |
| **CEO**            | Sale de la microgestión | Control global, expansión, estrategia, reinversión |


---

## 2. Lo que Urus Capital puede hacer AHORA MISMO

### 2.1. Captación automática de propiedades y compradores

**¿Qué pasa?** Cada vez que alguien da de alta una propiedad en Inmovilla, el sistema la detecta automáticamente (los crons ya están sincronizando). No hay que hacer nada especial — solo seguir trabajando en Inmovilla como siempre.

**¿Qué hace el sistema?** Cruza esa propiedad nueva contra todos los compradores activos y busca compatibilidades reales (zona, precio, metros, tipo de vivienda, preferencias).

**Página relacionada:** `/platform/matching` — Aquí se ven los cruces automáticos generado2.2. Notificaciones automáticas por WhatsApp

**¿Qué pasa?** Cuando el sistema detecta que un comprador encaja con una propiedad nueva, le envía un WhatsApp automáticamente. El mensaje incluye la información de la propiedad y le pregunta si le interesa.

**¿Qué hace el comercial?** Nada, salvo que el sistema marque una respuesta como "ambigua" — en ese caso, el comercial interviene con una llamada rápida o un par de preguntas por WhatsApp.

**¿Qué pasa si el comprador responde?** El sistema interpreta la respuesta automáticamente:

- Si dice "me encaja" → se propone una visita.
- Si dice "no me encaja, es caro" → el sistema entiende que el precio es el problema y ajusta la demanda.
- Si dice "quiero otra zona" → el sistema actualiza la zona de búsqueda.
- Si dice "busco algo diferente" → el sistema captura las nuevas preferencias.

Todo esto ocurre sin intervención humana. La demanda del comprador se va afinando con cada interacción.

---

### 2.3. Priorización inteligente de leads (Scoring)

**¿Qué pasa?** Cada lead que entra recibe una puntuación automática de 0 a 100 basada en:

- Probabilidad de cierre (55% del peso)
- Valor económico esperado (30% del peso)
- Urgencia (15% del peso)

**¿Qué significa cada rango?**


| Puntuación  | ¿Qué implica?                 | Tiempo máximo de respuesta                  |
| ----------- | ----------------------------- | ------------------------------------------- |
| 80-100      | Lead caliente, alta prioridad | Menos de 5 minutos                          |
| 60-79       | Lead con potencial            | Menos de 30 minutos                         |
| 40-59       | Lead en cola                  | Menos de 2 horas                            |
| Menos de 40 | Lead frío                     | Seguimiento automático, sin urgencia humana |


**Página relacionada:** El score aparece automáticamente en las notificaciones al comercial.

---

### 2.4. Motor de Pricing — Análisis de mercado automático

**¿Qué pasa?** Cuando se sube un inmueble o se cambia su precio en Inmovilla, el sistema automáticamente:

1. Busca propiedades similares en el mercado real (a través de Statefox).
2. Compara precio por metro cuadrado, calidades y posicionamiento.
3. Genera un informe con semáforo:
  - **VERDE** — Bien posicionado frente al mercado.
  - **AMARILLO** — Riesgo comercial, considerar ajustes.
  - **ROJO** — Fuera de mercado.

Además, el sistema hace **reevaluaciones automáticas**: si un inmueble lleva 14 días sin generar ningún match, o si ha tenido 3 o más visitas sin que llegue una oferta, el sistema reanaliza automáticamente el precio.

**Página relacionada:** `/platform/pricing` — Listado de análisis de pricing. `/platform/pricing/informe/{código}` — Informe detallado por inmueble.

**¿Cómo se usa?** El comercial recibe el informe y lo usa como argumento objetivo con el propietario. No es una opinión — son datos del mercado real.

---

### 2.5. Microsite de selección para compradores

**¿Qué pasa?** Cuando un comprador tiene interés real (ha hecho una visita o tiene un score alto), el sistema busca propiedades del mercado externo que encajen con lo que busca y genera un **portal web personalizado** con esas propiedades.

**¿Cómo funciona?**

1. El sistema genera la selección de propiedades.
2. El comercial recibe un WhatsApp con un enlace para **validar la selección** (30-60 segundos, aprobar o rechazar).
3. Si aprueba, el comprador recibe por WhatsApp el enlace a su portal personalizado.
4. El comprador navega las propiedades y responde por WhatsApp con su feedback.
5. El sistema interpreta ese feedback y ajusta la búsqueda.

**Páginas relacionadas:**

- `/validar-seleccion/{token}` — Pantalla del comercial para validar.
- `/seleccion/{token}` — Portal del comprador (ficha de propiedades con imágenes, precios, detalles).

---

### 2.6. Contratos inteligentes (Smart Closing)

**¿Qué pasa?** Cuando una operación llega a fase de "Reserva/Señal" o "Arras" en Inmovilla:

1. El sistema detecta el cambio automáticamente.
2. Verifica que todos los datos estén completos (comprador, vendedor, inmueble, precios, plazos).
3. Genera un borrador de contrato con todos los campos rellenados automáticamente.
4. El gestor puede revisarlo **hablando** (dice "cambia honorarios a 3% + IVA" y el sistema aplica el cambio).
5. Se envía a firma digital.
6. Si no se firma, se envían recordatorios automáticos al día +1, +3 y +5. Si a los 5 días no se ha firmado, se escala al comercial y al gestor.

**Páginas relacionadas:**

- `/platform/legal/contratos` — Gestión de contratos.
- `/platform/legal/plantillas` — Plantillas de documentos.
- `/firma/{token}` — Página de firma digital (la ve el firmante).

---

### 2.7. Post-venta automática

**¿Qué pasa?** Cuando se cierra una operación, se activa una cadencia automática:


| Momento            | ¿Qué se envía?                                                                                     | Canal    |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| **Día 0** (cierre) | Mensaje de agradecimiento personalizado + formulario de datos (nombre, email, fecha de nacimiento) | WhatsApp |
| **Día 10-14**      | Solicitud de reseña (solo si no hay incidencias abiertas)                                          | WhatsApp |
| **Día 21-30**      | Activación de referidos: "Si conoces a alguien..."                                                 | WhatsApp |
| **Día 90-180**     | Re-captación según perfil (comprador, inversor, vendedor)                                          | WhatsApp |
| **Anual**          | Felicitación de cumpleaños y Navidad (si se recogieron los datos el Día 0)                         | WhatsApp |


**Página relacionada:** `/platform/post-venta` — Panel de control post-venta con estado de cada operación.

---

### 2.8. Dashboards — Visión global en tiempo real

#### Para el CEO

**Página:** `/platform/bi`

El Dashboard de Business Intelligence incluye:

- **Visión ejecutiva** (`/platform/bi/vision-ejecutiva`) — Facturación, objetivos vs real, semáforos por área.
- **Análisis operativo** (`/platform/bi/operativo`) — Estado del pipeline, tiempos medios, cuellos de botella.
- **Capital humano** (`/platform/bi/capital-humano`) — Estado del equipo, carga por comercial, riesgo de burnout.
- **Análisis financiero** (`/platform/bi/financiero`) — Costes, márgenes, ROI.
- **Motor prescriptivo** (`/platform/bi/prescriptivo`) — Recomendaciones automáticas ("Contratar en Córdoba", "Aumentar captación en Málaga").
- **Expansión** (`/platform/bi/expansion`) — Análisis de ciudades candidatas para expansión.
- **Reinversión** (`/platform/bi/reinversion`) — Cuánto se puede reinvertir y en qué.

#### Para el comercial

**Página:** `/platform/rendimiento`

- Ranking de comerciales (`/platform/rendimiento/comerciales`).
- Detalle individual (`/platform/rendimiento/comercial/{id}`).
- Alertas (`/platform/rendimiento/alertas`).
- Vista de equipo (`/platform/rendimiento/equipo`).

Cada comercial ve su rendimiento vs la media, su objetivo mensual y qué métrica concreta debe mejorar.

#### Colaboradores externos

**Página:** `/platform/colaboradores`

Gestión interna de bancos, abogados, tasadores, arquitectos:

- Tracking de hitos y tiempos.
- Ranking por impacto (`/platform/colaboradores/ranking`).
- Detalle por colaborador (`/platform/colaboradores/{id}`).
- El sistema clasifica automáticamente a cada colaborador como: Partner estratégico, Funcional, Lento o Crítico.

---

### 2.9. Bot de soporte para comerciales (Coach)

**Página:** `/platform/coach`

Un asistente conversacional privado y confidencial para comerciales, accesible por WhatsApp. El comercial puede escribir cosas como "estoy bloqueado con un cierre" o "tengo miedo de decir el precio" y recibe técnicas concretas, simulaciones de conversación y ejercicios de enfoque.

**Importante para la dirección:** Las conversaciones son 100% confidenciales. El CEO solo ve datos agregados (nivel de uso del bot, patrones generales) — nunca el contenido de las conversaciones.

- Métricas del coach: `/platform/coach/metricas`

---

### 2.10. Configuración

**Página:** `/platform/configuracion`

Configuración general del sistema, usuarios, roles y permisos.

---

## 3. ¿Cómo funciona el sistema en el día a día?

### Para el comercial


| Momento del día                                | ¿Qué pasa?                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mañana**                                     | El comercial abre su dashboard y ve sus leads priorizados. Los más urgentes están arriba.                                                                      |
| **Cuando entra un lead caliente (score 80+)**  | Recibe un WhatsApp inmediato. Tiene menos de 5 minutos para contactar.                                                                                         |
| **Cuando un comprador responde a un WhatsApp** | El sistema procesa la respuesta automáticamente. Si todo está claro, no necesita hacer nada. Si el sistema marca "ambiguo", interviene con una llamada rápida. |
| **Después de una visita**                      | Tiene 3 minutos para marcar en el formulario post-visita: nivel de interés (alto/medio/bajo) y 1-2 notas breves. Nada más.                                     |
| **Cuando sale una selección de mercado**       | Recibe un WhatsApp con el enlace para validar la selección. 30-60 segundos: aprobar o rechazar.                                                                |
| **Cuando llega una operación a firma**         | Si los datos están completos, el contrato se genera solo. Solo revisa y aprueba.                                                                               |


### Para el CEO


| Necesidad                                     | ¿Dónde está?                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| ¿Cómo va la empresa?                          | `/platform/bi/vision-ejecutiva` — Semáforos, facturación, estado general en 2 minutos |
| ¿Quién rinde y quién no?                      | `/platform/rendimiento/comerciales` — Ranking con datos reales                        |
| ¿Qué colaborador está bloqueando operaciones? | `/platform/colaboradores/ranking`                                                     |
| ¿Debo expandirme? ¿Dónde?                     | `/platform/bi/expansion`                                                              |
| ¿Cuánto puedo reinvertir?                     | `/platform/bi/reinversion`                                                            |
| ¿Qué debo hacer ahora?                        | `/platform/bi/prescriptivo` — Recomendaciones automáticas con justificación           |


### Para el gestor (backoffice)


| Necesidad                   | ¿Dónde está?                                                |
| --------------------------- | ----------------------------------------------------------- |
| Contratos en curso          | `/platform/legal/contratos`                                 |
| Documentos y plantillas     | `/platform/legal/documentos` y `/platform/legal/plantillas` |
| Estado de firmas pendientes | `/platform/legal/contratos/{id}`                            |


### ¿Qué sigue haciendo Inmovilla?

Inmovilla **sigue siendo la fuente de verdad** para:

- Datos de propiedades (fichas, precios, fotos)
- Datos de contactos (compradores, vendedores)
- Facturación

**Lo que NO hay que hacer en Inmovilla:** Cambiar manualmente estados del pipeline de leads. El estado del pipeline (en qué fase está cada lead: Nuevo, Contactado, En selección, Visita pendiente, etc.) lo gestiona el sistema automáticamente.

**Lo que SÍ hay que seguir haciendo en Inmovilla:**

- Dar de alta propiedades con datos completos y de calidad.
- Mantener fichas actualizadas.
- Registrar operaciones cuando llegan a fase de reserva/arras.

> **Regla de oro:** Si no está en Inmovilla, no existe para el sistema. La calidad de los datos en Inmovilla es directamente proporcional a la calidad de las automatizaciones.

---

## 4. Mapa de Pantallas y Accesos

### Plataforma interna (requiere login)


| Sección                      | URL                                    | ¿Quién la usa?         | ¿Para qué?                                             |
| ---------------------------- | -------------------------------------- | ---------------------- | ------------------------------------------------------ |
| Inicio                       | `/platform`                            | Todos                  | Dashboard general                                      |
| Matching (cruces)            | `/platform/matching`                   | Comerciales, CEO       | Ver cruces automáticos entre propiedades y compradores |
| Cruces detallados            | `/platform/matching/cruces`            | Comerciales            | Lista de cruces generados                              |
| Feedback de compradores      | `/platform/matching/feedback`          | Comerciales            | Respuestas de compradores a los matches                |
| Demandas                     | `/platform/demandas`                   | Comerciales            | Gestión de demandas activas                            |
| Pricing                      | `/platform/pricing`                    | Comerciales, CEO       | Análisis de pricing de propiedades                     |
| Informe de pricing           | `/platform/pricing/informe/{código}`   | Comerciales            | Informe detallado de una propiedad                     |
| Mercado                      | `/platform/pricing/mercado`            | Comerciales            | Vista del mercado (Statefox)                           |
| BI - Visión ejecutiva        | `/platform/bi/vision-ejecutiva`        | CEO                    | Vista estratégica global                               |
| BI - Operativo               | `/platform/bi/operativo`               | CEO                    | Análisis operativo                                     |
| BI - Capital humano          | `/platform/bi/capital-humano`          | CEO                    | Estado del equipo                                      |
| BI - Financiero              | `/platform/bi/financiero`              | CEO                    | Análisis financiero                                    |
| BI - Prescriptivo            | `/platform/bi/prescriptivo`            | CEO                    | Recomendaciones automáticas                            |
| BI - Expansión               | `/platform/bi/expansion`               | CEO                    | Análisis de expansión                                  |
| BI - Reinversión             | `/platform/bi/reinversion`             | CEO                    | Análisis de reinversión                                |
| Rendimiento                  | `/platform/rendimiento`                | CEO, Jefes de zona     | Vista general de rendimiento                           |
| Ranking comerciales          | `/platform/rendimiento/comerciales`    | CEO, Jefes de zona     | Ranking por rentabilidad                               |
| Detalle comercial            | `/platform/rendimiento/comercial/{id}` | CEO, Jefes de zona     | Evolución y métricas individuales                      |
| Alertas                      | `/platform/rendimiento/alertas`        | CEO, Jefes de zona     | Alertas de bajo rendimiento                            |
| Equipo                       | `/platform/rendimiento/equipo`         | Jefes de zona          | Vista de equipo                                        |
| Colaboradores                | `/platform/colaboradores`              | CEO, Comerciales       | Gestión de colaboradores externos                      |
| Ranking colaboradores        | `/platform/colaboradores/ranking`      | CEO                    | Ranking por impacto                                    |
| Detalle colaborador          | `/platform/colaboradores/{id}`         | CEO, Comerciales       | Historial y métricas                                   |
| Contratos                    | `/platform/legal/contratos`            | Gestor, CEO            | Gestión de contratos                                   |
| Detalle contrato             | `/platform/legal/contratos/{id}`       | Gestor                 | Versiones y estado de firma                            |
| Documentos                   | `/platform/legal/documentos`           | Gestor                 | Gestión documental                                     |
| Plantillas                   | `/platform/legal/plantillas`           | Gestor                 | Plantillas de contratos                                |
| Post-venta                   | `/platform/post-venta`                 | Comerciales, CEO       | Pipeline post-venta                                    |
| Detalle operación post-venta | `/platform/post-venta/operacion/{id}`  | Comerciales            | Detalle de cadencia post-venta                         |
| Referidos                    | `/platform/post-venta/referidos`       | Comerciales            | Referidos recibidos                                    |
| Coach                        | `/platform/coach`                      | Comerciales            | Bot de soporte mental                                  |
| Métricas del coach           | `/platform/coach/metricas`             | CEO (datos agregados)  | Uso del bot por el equipo                              |
| Post-visita                  | `/platform/post-visita/{demandaId}`    | Comerciales (en campo) | Formulario rápido post-visita                          |
| Agenda                       | `/platform/agenda/{demandaId}`         | Comerciales            | Agendar visitas                                        |
| Configuración                | `/platform/configuracion`              | CEO, Admin             | Configuración del sistema                              |


### Pantallas públicas (sin login, con token)


| Sección                | URL                                 | ¿Quién la usa? | ¿Para qué?                      |
| ---------------------- | ----------------------------------- | -------------- | ------------------------------- |
| Microsite de selección | `/seleccion/{token}`                | Compradores    | Ver propiedades seleccionadas   |
| Detalle de propiedad   | `/seleccion/{token}/propiedad/{id}` | Compradores    | Ficha completa de una propiedad |
| Firma digital          | `/firma/{token}`                    | Firmantes      | Firmar contratos                |
| Referidos              | `/referidos/{código}`               | Clientes       | Formulario de referidos         |


### Validación comercial (con token)


| Sección           | URL                          | ¿Quién la usa?     |
| ----------------- | ---------------------------- | ------------------ |
| Validar selección | `/validar-seleccion/{token}` | Comercial asignado |


---

## 5. Plan de las Próximas 4 Semanas

> **Objetivo:** Observar, medir y ajustar. El sistema está vivo y necesita calibrarse con datos reales.

### Semana 1 (19-25 abril) — Estabilización y Observación Inicial

**Foco:** Verificar que todo funciona correctamente con datos reales de producción.


| Qué observar                                | ¿Dónde?                         | ¿Qué buscar?                                      |
| ------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| ¿Los crons están sincronizando propiedades? | `/platform/matching`            | ¿Aparecen propiedades nuevas?                     |
| ¿Las demandas se están leyendo?             | `/platform/demandas`            | ¿Están las demandas activas?                      |
| ¿Los cruces son correctos?                  | `/platform/matching/cruces`     | ¿Los matches tienen sentido (zona, precio, tipo)? |
| ¿Los WhatsApp se envían y llegan?           | Verificar en el teléfono        | ¿Los compradores reciben mensajes?                |
| ¿Los dashboards muestran datos?             | `/platform/bi/vision-ejecutiva` | ¿Se ven números reales, no ceros?                 |


**Acción requerida de la dirección:**

- Reportar cualquier dato que no cuadre (una propiedad que no aparece, un cruce que no tiene sentido, un WhatsApp que no llegó).
- No modificar configuraciones por cuenta propia.

---

### Semana 2 (26 abril - 2 mayo) — Calibración de Inteligencia

**Foco:** Ajustar la calidad de los cruces, el scoring y las respuestas de la IA.


| Qué observar                                          | ¿Dónde?                       | ¿Qué buscar?                                     |
| ----------------------------------------------------- | ----------------------------- | ------------------------------------------------ |
| ¿El scoring de leads es realista?                     | Notificaciones al comercial   | ¿Los leads con score 80+ realmente son urgentes? |
| ¿La IA interpreta bien las respuestas de compradores? | `/platform/matching/feedback` | ¿Entiende bien "quiero más metros" o "es caro"?  |
| ¿Los informes de pricing son acertados?               | `/platform/pricing`           | ¿El semáforo refleja la realidad del mercado?    |
| ¿Las cadencias post-venta se disparan bien?           | `/platform/post-venta`        | ¿Se envían en los días correctos?                |


**Acción requerida de la dirección:**

- Si un comercial dice "la IA no entendió bien esta respuesta", documentar el caso exacto (qué dijo el comprador y qué hizo el sistema). Esto es oro para mejorar.
- Si un informe de pricing parece desacertado, indicar por qué (precio real de mercado vs lo que dice el sistema).

---

### Semana 3 (3-9 mayo) — Flujos Completos y Edge Cases

**Foco:** Verificar que los flujos completos funcionan de principio a fin (lead → visita → oferta → contrato → post-venta).


| Qué observar                              | ¿Dónde?                     | ¿Qué buscar?                               |
| ----------------------------------------- | --------------------------- | ------------------------------------------ |
| ¿Los formularios post-visita son fáciles? | Comerciales en campo        | ¿Les lleva más de 3 minutos?               |
| ¿La generación de contratos es correcta?  | `/platform/legal/contratos` | ¿Los datos están bien rellenados?          |
| ¿La firma digital funciona?               | `/firma/{token}`            | ¿El firmante recibe el SMS y puede firmar? |
| ¿Los recordatorios de firma llegan?       | WhatsApp                    | ¿Se envían al día +1, +3, +5?              |
| ¿Los colaboradores se están trackeando?   | `/platform/colaboradores`   | ¿Los hitos y tiempos son correctos?        |


**Acción requerida de la dirección:**

- Intentar completar al menos 1 operación completa usando todos los módulos del sistema.
- Listar cualquier paso donde el flujo "se rompe" o no es intuitivo.

---

### Semana 4 (10-16 mayo) — Análisis de Resultados y Ajustes Estratégicos

**Foco:** Analizar los primeros datos reales y decidir ajustes.


| Qué analizar                      | ¿Dónde?                             | Decisión a tomar                                     |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| Tiempo medio de respuesta a leads | `/platform/bi/operativo`            | ¿Se cumple el SLA? ¿Necesitamos más comerciales?     |
| Conversión lead → visita          | `/platform/rendimiento/comerciales` | ¿Hay comerciales que necesitan apoyo?                |
| Calidad de los cruces             | `/platform/matching`                | ¿Hay que ajustar los criterios de matching?          |
| Uso del bot de coaching           | `/platform/coach/metricas`          | ¿Los comerciales lo están usando? ¿Les ayuda?        |
| Rendimiento de colaboradores      | `/platform/colaboradores/ranking`   | ¿Hay colaboradores que estén bloqueando operaciones? |


**Reunión de cierre del primer mes:** Revisar todos los datos, decidir ajustes prioritarios y definir objetivos para el mes 2.

---

## 6. ¿Qué debo vigilar?

### Señales de que todo va bien

- Las propiedades nuevas aparecen en el sistema en minutos.
- Los compradores reciben WhatsApp y responden.
- Los cruces que genera el sistema son razonables.
- Los informes de pricing reflejan el mercado real.
- Los dashboards muestran datos actualizados.
- Los comerciales sienten que tienen menos carga administrativa.

### Señales de alerta — Reportar inmediatamente


| Señal                                                                                         | ¿Qué puede significar?                     | ¿Qué hacer?                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Una propiedad nueva no aparece en el sistema después de 30 minutos                            | Problema con la sincronización             | Reportar el código de la propiedad              |
| Un comprador no recibió el WhatsApp                                                           | Problema con la mensajería o con el número | Reportar el nombre del comprador y la propiedad |
| Un cruce es absurdo (ej: ofrece un ático en Málaga a alguien que busca un estudio en Córdoba) | Error en los criterios de matching         | Reportar los datos exactos del cruce            |
| Un informe de pricing dice VERDE pero el inmueble está claramente caro                        | Problema con los datos de mercado          | Reportar la propiedad y lo que debería decir    |
| Un contrato se generó con datos incorrectos                                                   | Datos incompletos o erróneos en Inmovilla  | Verificar la ficha en Inmovilla y reportar      |
| El dashboard muestra ceros o datos de hace días                                               | Problema con la sincronización             | Reportar qué pantalla y cuándo                  |
| Un comercial no recibe notificaciones                                                         | Problema con la configuración del usuario  | Reportar el nombre del comercial                |


---

## 7. Preguntas Frecuentes

### Sobre el funcionamiento general

**¿El sistema reemplaza a Inmovilla?**
No. Inmovilla sigue siendo la fuente de verdad para todos los datos legales y definitivos. El sistema lee de Inmovilla, piensa, actúa y escribe de vuelta cuando es necesario. Inmovilla es la "bóveda" donde viven los datos; el sistema es el "cerebro" que los usa.

**¿Qué pasa si Inmovilla se cae?**
Las operaciones se acumulan en una cola y se ejecutan automáticamente cuando Inmovilla vuelva a estar disponible. No se pierde ningún dato.

**¿Necesito aprender algo nuevo?**
Los comerciales solo necesitan:

1. Seguir usando Inmovilla como siempre (dar de alta propiedades con datos completos).
2. Responder a las notificaciones que les llega por WhatsApp.
3. Usar el formulario post-visita (3 minutos después de cada visita).
4. Validar selecciones de mercado cuando se lo pida el sistema (30-60 segundos).

**¿Puedo seguir trabajando aunque no entienda el sistema?**
Sí. El sistema funciona en segundo plano. Si sigues dando de alta propiedades bien en Inmovilla y atiendes las notificaciones, el sistema hace el resto.

---

### Sobre la calidad de los datos

**¿Por qué la calidad de los datos en Inmovilla es tan importante?**
El sistema toma decisiones basándose en los datos de Inmovilla. Si una propiedad tiene el precio mal, el cruce será incorrecto. Si falta la zona, no se podrá comparar con el mercado. Datos basura = automatización basura.

**¿Hay un checklist de calidad al dar de alta una propiedad?**
Sí. Al dar de alta cada propiedad verificar:

- Precio correcto
- Dirección/zona correcta
- Tipología correcta
- Extras bien marcados (terraza, ascensor, parking, etc.)
- Fotos cargadas
- Datos del propietario completos (DNI, contacto)

---

### Sobre WhatsApp

**¿Los mensajes de WhatsApp los envía una persona o el sistema?**
Los envía el sistema automáticamente a través de la API oficial de WhatsApp (Meta). Son mensajes con plantillas aprobadas por Meta.

**¿Puede un comprador hablar libremente por WhatsApp?**
Sí. El sistema usa inteligencia artificial para interpretar respuestas de texto libre. No necesita respuestas estructuradas (aunque también ofrece botones de respuesta rápida).

**¿Qué pasa si el sistema no entiende una respuesta?**
El sistema marca la respuesta como "ambigua" y crea una tarea para que el comercial intervenga. Nunca se pierde un mensaje.

---

### Sobre contratos y firma digital

**¿Es legal la firma digital del sistema?**
El sistema utiliza firma electrónica simple con verificación por código SMS (OTP), lo cual tiene validez legal en España para este tipo de documentos. Cada firma incluye pista de auditoría (hash del documento, IP, fecha, hora, dispositivo).

**¿Puedo modificar un contrato generado?**
Sí. El gestor puede revisar y pedir cambios hablando (por voz) o indicando las modificaciones. El sistema genera una nueva versión y guarda historial de cambios.

**¿Qué pasa si el firmante no firma a tiempo?**

- Día +1: Recordatorio automático por WhatsApp.
- Día +3: Segundo recordatorio.
- Día +5: Último recordatorio automático.
- Pasados 5 días sin firma: Se escala automáticamente al comercial y al gestor.

---

### Sobre los dashboards y métricas

**¿Las métricas son en tiempo real?**
Sí, se actualizan con cada evento que ocurre en el sistema. No hay que esperar al cierre de mes.

**¿Un comercial puede ver los datos de otro comercial?**
No. Cada comercial solo ve su propio rendimiento y la media del equipo. El CEO ve todo.

**¿Las conversaciones del bot de coaching son privadas?**
100%. El CEO solo ve datos agregados (cuánto se usa el bot, patrones generales). Nunca el contenido de las conversaciones.

---

### Sobre precios y mercado

**¿De dónde saca el sistema los datos del mercado?**
De Statefox, que rastrea propiedades publicadas en Idealista, Fotocasa, Pisos.com y Habitaclia. Son datos de propiedades reales en el mercado, no estimaciones.

**¿El sistema sugiere bajar precios automáticamente?**
No baja precios por sí solo. Genera un informe con datos objetivos y recomendaciones. El comercial decide. El sistema recomienda, el comercial decide.

---

## 8. ¿Cómo reportar problemas?

### Protocolo de reporte de incongruencias

Es **fundamental** que durante las primeras semanas se reporten todas las incongruencias, errores o comportamientos extraños. Esto permite calibrar y mejorar el sistema rápidamente.

### ¿Qué reportar?

1. **Datos incorrectos:** Una propiedad muestra un precio distinto al de Inmovilla, un comprador aparece con datos erróneos, etc.
2. **Cruces erróneos:** El sistema cruza a un comprador con una propiedad que claramente no encaja.
3. **Mensajes no enviados o no recibidos:** Un WhatsApp que debería haber llegado pero no llegó.
4. **Interpretaciones incorrectas de la IA:** El comprador dijo una cosa y el sistema entendió otra.
5. **Contratos con errores:** Datos mal rellenados, cláusulas incorrectas.
6. **Pantallas que no cargan o muestran errores.**
7. **Cualquier cosa que "no cuadre"** — si algo le parece raro, repórtelo. Es mejor reportar de más que de menos.

### ¿Cómo reportar?

Para cada reporte, incluir:

1. **¿Qué pantalla o función?** (ej: "Pricing de la propiedad REF-123")
2. **¿Qué esperaba que pasara?** (ej: "Debería decir ROJO porque está 20% por encima del mercado")
3. **¿Qué pasó realmente?** (ej: "Dice VERDE")
4. **¿Cuándo pasó?** (fecha y hora aproximada)
5. **Captura de pantalla** si es posible.

---

## 9. Glosario

Estos son los términos que aparecerán en el sistema. No es necesario memorizarlos — este glosario es para consulta rápida.


| Término                | ¿Qué significa?                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Match / Cruce**      | Cuando el sistema detecta que un comprador encaja con una propiedad.                                                                         |
| **Score**              | Puntuación de 0 a 100 que indica la calidad y urgencia de un lead.                                                                           |
| **SLA**                | Tiempo máximo que tiene el comercial para responder a un lead según su score.                                                                |
| **Pipeline**           | Las fases por las que pasa un lead: Nuevo → Contactado → En selección → Visita pendiente → Visita realizada → Negociación → Firma → Cerrado. |
| **Lead**               | Un potencial comprador o vendedor que entra al sistema. En Inmovilla se traduce como un Contacto + una Demanda.                              |
| **Demanda**            | La búsqueda activa de un comprador (qué zona, qué precio, qué tipo de vivienda).                                                             |
| **Microsite**          | El portal web personalizado que se genera para que un comprador vea propiedades seleccionadas.                                               |
| **Semáforo (Pricing)** | VERDE = bien posicionado. AMARILLO = riesgo. ROJO = fuera de mercado.                                                                        |
| **Smart Matching**     | El módulo de IA que interpreta respuestas de compradores y ajusta automáticamente sus demandas.                                              |
| **Smart Closing**      | El módulo de generación automática de contratos con revisión por voz y firma digital.                                                        |
| **Post-venta**         | La cadencia automática de mensajes después de cerrar una operación.                                                                          |
| **Cadencia**           | Secuencia automática de mensajes programados (ej: día +1, +3, +7).                                                                           |
| **Bot de coaching**    | Asistente conversacional privado para apoyar a los comerciales.                                                                              |
| **Cron**               | Tarea automática que el sistema ejecuta periódicamente (ej: sincronizar propiedades cada X minutos).                                         |
| **Ingestion**          | El proceso de leer datos de Inmovilla y traerlos al sistema.                                                                                 |
| **Proyección**         | El estado actual calculado a partir de todos los eventos (ej: "esta propiedad vale X, tiene Y demandas activas").                            |
| **Escalado**           | Cuando un problema o un retraso se comunica automáticamente a un nivel superior (ej: del comercial al jefe de zona o al CEO).                |
| **Referido**           | Un contacto que llega a través de un cliente existente.                                                                                      |


---

## 10. Dependencias Pagas — Servicios y Costes del Sistema

> **IMPORTANTE:** Durante las próximas 4 semanas (19 de abril – 16 de mayo de 2026), todos los costes de servicios descritos a continuación serán asumidos por el equipo de desarrollo como parte del período de estabilización y observación. **A partir del 17 de mayo de 2026, la responsabilidad y el pago de todos estos servicios pasará a ser de Urus Capital Group.**

### Resumen de servicios de pago

El sistema utiliza los siguientes servicios externos de pago para funcionar. Cada uno cumple una función específica y no puede eliminarse sin perder funcionalidad.

---

### Infraestructura y Hosting


| Servicio              | ¿Para qué se usa?                                                                                                                                                                                           | Plan recomendado        | Coste estimado mensual                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| **Vercel**            | Hosting de la aplicación web (plataforma, dashboards, APIs, microsites, firma digital). Donde vive todo el sistema.                                                                                         | Pro                     | ~$20/mes + uso                             |
| **Neon (PostgreSQL)** | Base de datos principal. Almacena todos los eventos, la cola de trabajos, las proyecciones, los análisis, las métricas y los documentos del sistema. Es el cerebro operativo.                               | Scale (o Pro según uso) | ~$19–69/mes según almacenamiento y cómputo |
| **Railway**           | Ejecuta el servicio de renovación automática de sesión de Inmovilla (necesario para que el sistema pueda escribir demandas). Un contenedor Docker pequeño que corre 24/7.                                   | Starter/Developer       | ~$5–10/mes                                 |
| **Upstash (QStash)**  | Orquestador de tareas automáticas (crons). Dispara la sincronización de propiedades, los recordatorios, las cadencias post-venta, las alertas y las reevaluaciones de pricing en los horarios configurados. | Pro                     | ~$10/mes                                   |


---

### Inteligencia Artificial


| Servicio                                  | ¿Para qué se usa?                                                                                                                                                                                                                                              | Detalles                                                                           | Coste estimado mensual                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| **OpenAI**                                | Motor de inteligencia artificial de todo el sistema. Interpreta respuestas de compradores (NLU), genera recomendaciones de pricing, clasifica leads, transcribe voz para contratos (Whisper), opera el bot de coaching, y genera recomendaciones estratégicas. | Modelos: GPT-4o-mini (principal), Whisper (voz). Pago por uso (tokens consumidos). | ~$20–100/mes según volumen de operaciones |
| **LangSmith** (opcional pero recomendado) | Trazabilidad y monitoreo de la IA. Permite ver qué decidió la IA y por qué, detectar errores y mejorar.                                                                                                                                                        | Plan Developer/Plus                                                                | ~$0–39/mes                                |


---

### Comunicaciones


| Servicio                      | ¿Para qué se usa?                                                                                                                                                                                  | Detalles                                                                                                                                                                | Coste estimado mensual                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **WhatsApp Cloud API (Meta)** | Canal principal de comunicación con compradores, comerciales y firmantes. Envía notificaciones de matches, microsites, recordatorios de firma, cadencias post-venta, agendamiento de visitas, etc. | Requiere: Cuenta Meta Business Manager + WABA (WhatsApp Business Account). Coste por conversación (modelo de precios de Meta: ~€0.04–0.09 por conversación según tipo). | ~$30–150/mes según volumen de conversaciones |
| **Vonage**                    | Envío de SMS para códigos OTP (verificación de identidad) en la firma digital. Cada vez que alguien firma un contrato, recibe un SMS con un código.                                                | Pago por SMS enviado (~€0.05–0.07/SMS)                                                                                                                                  | ~$5–20/mes según firmas                      |
| **Resend**                    | Email transaccional para invitaciones de usuario al sistema (cuando se da de alta un nuevo comercial, jefe de zona, etc.).                                                                         | Plan gratuito cubre hasta 100 emails/día. Plan Pro si se necesita más.                                                                                                  | $0–20/mes                                    |
| **Pusher Channels**           | Notificaciones en tiempo real dentro de la plataforma (alertas instantáneas en pantalla sin necesidad de recargar).                                                                                | Plan Starter/Pro según conexiones simultáneas.                                                                                                                          | ~$0–49/mes                                   |


---

### Almacenamiento y Documentos


| Servicio       | ¿Para qué se usa?                                                                                                                                                                                       | Detalles                                                | Coste estimado mensual         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| **Cloudinary** | Almacenamiento de documentos legales: contratos generados, contratos firmados, audit trails, adjuntos de operaciones. La API de Inmovilla no permite adjuntar documentos, por lo que se almacenan aquí. | Plan gratuito generoso (25 GB). Plan Plus si se supera. | $0–89/mes según almacenamiento |


---

### Integración con CRM


| Servicio     | ¿Para qué se usa?                                                                                                                                                                                                                           | Detalles                             | Coste estimado mensual |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------- |
| **Composio** | Automatiza la obtención del código 2FA de Inmovilla a través de Gmail (lee el correo automáticamente para extraer el código de verificación de 6 dígitos). También gestiona la conexión de Google Calendar para el agendamiento de visitas. | Plan Hobby/Growth según ejecuciones. | ~$0–29/mes             |


---

### Datos de Mercado


| Servicio     | ¿Para qué se usa?                                                                                                                                                                                                    | Detalles                                                           | Coste estimado mensual      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| **Statefox** | Proveedor de datos del mercado inmobiliario real. El Motor de Pricing y los Microsites de selección para compradores dependen de estos datos (propiedades publicadas en Idealista, Fotocasa, Pisos.com, Habitaclia). | Suscripción con Bearer token. Consultar con proveedor condiciones. | Según contrato con Statefox |


---

### Mapas


| Servicio                  | ¿Para qué se usa?                                                                                            | Detalles                                                              | Coste estimado mensual |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------- |
| **Google Maps** (API key) | Muestra mapas estáticos en las fichas de propiedades dentro de los microsites de selección para compradores. | Pago por uso. Google ofrece $200/mes gratuitos que cubren uso típico. | $0–20/mes              |


---

### Resumen consolidado de costes estimados


| Categoría                                            | Rango mensual estimado |
| ---------------------------------------------------- | ---------------------- |
| Infraestructura (Vercel + Neon + Railway + Upstash)  | $55–110                |
| Inteligencia Artificial (OpenAI + LangSmith)         | $20–140                |
| Comunicaciones (WhatsApp + Vonage + Resend + Pusher) | $35–240                |
| Almacenamiento (Cloudinary)                          | $0–89                  |
| Integraciones (Composio)                             | $10                    |
| Datos de mercado (Statefox)                          | Según contrato         |
| Mapas (Google Maps)                                  | $0                     |
| **TOTAL ESTIMADO (sin Statefox)**                    | **$110–630/mes**       |


> **Nota:** Los costes reales dependerán del volumen de operaciones. Con un volumen bajo-medio de actividad (5-15 operaciones/mes, 50-200 leads/mes), el coste total estará más cerca del rango bajo (~$150-250/mes). A medida que el volumen crezca, los costes subirán proporcionalmente al crecimiento del negocio.

> **Nota 2:** Algunos servicios tienen planes gratuitos generosos (Cloudinary, Resend, Google Maps, Pusher). Con uso normal, varios pueden mantenerse en plan gratuito durante los primeros meses.

---

### Calendario de transición de costes


| Período                                 | ¿Quién paga?         | Notas                                                               |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| **19 abril – 16 mayo 2026** (4 semanas) | Equipo de desarrollo | Período de estabilización y calibración incluido en el proyecto     |
| **A partir del 17 mayo 2026**           | Urus Capital Group   | Todos los servicios listados arriba pasan a facturación del cliente |


Al final del período de 4 semanas, se entregarán:

- Las credenciales de acceso a todos los servicios (o se transferirán las cuentas).
- Instrucciones para gestionar la facturación de cada servicio.
- Contacto de soporte para dudas técnicas durante la transición.

---

## 11. Hoja de ruta futura

El sistema publicado es la **versión 1.0**. A partir de aquí, cada mejora se basa en datos reales de uso. Las posibles áreas de evolución incluyen:


| Área                            | Descripción                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Refinamiento de IA**          | Mejorar la precisión del Smart Matching y el NLU basándose en casos reales                      |
| **Expansión geográfica**        | Cuando los datos del dashboard validen la oportunidad, el sistema ya soporta múltiples ciudades |
| **Integraciones adicionales**   | Call tracking, nuevos portales, proveedores de servicios                                        |
| **App móvil**                   | Si los comerciales necesitan acceso más rápido en campo                                         |
| **Automatización de captación** | Ampliar la captación automática a más canales (Instagram, Facebook, web propia)                 |


Todas las decisiones de evolución se tomarán basándose en los datos que el sistema recopile durante las primeras semanas de operación.

---

## Resumen Final

**Lo que ya funciona:**

- Sincronización automática con Inmovilla (propiedades, demandas, contactos).
- Cruces automáticos entre compradores y propiedades.
- Notificaciones por WhatsApp a compradores y comerciales.
- Scoring y priorización de leads.
- Análisis de pricing con datos de mercado real.
- Generación automática de contratos y firma digital.
- Cadencias de post-venta.
- Dashboards para CEO, comerciales y gestión de colaboradores.
- Bot de coaching para comerciales.
- Microsites personalizados para compradores.

**Lo que necesitamos de ustedes:**

1. Seguir usando Inmovilla con datos de calidad.
2. Atender las notificaciones del sistema.
3. Reportar toda incongruencia que encuentren.
4. Darnos feedback constante durante las primeras 4 semanas.

**El sistema aprende de cada interacción.** Cuanto antes empiecen a usarlo activamente, antes se calibra y mejor funciona.

---

> **Documento preparado para la reunión de entrega del 19 de abril de 2026.**
> **Próxima revisión:** 16 de mayo de 2026 (cierre del primer mes de observación).

