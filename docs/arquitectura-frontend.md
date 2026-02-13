# URUS Capital — Arquitectura Frontend (Mockup Interactivo)

## 1. Visión General

Plataforma de gestión inmobiliaria integral para URUS Capital. El mockup presentará **datos simulados en tiempo real** usando `setInterval`, generadores de datos aleatorios y estados reactivos de React. El objetivo es que el CEO (Miguel) pueda ver absolutamente todo el ecosistema funcionando como si estuviera en producción.

**Stack:** Next.js 16 + Tailwind CSS 4 + Shadcn (radix-nova) + Lucide Icons

---

## 2. Layout Principal

```
┌──────────────────────────────────────────────────────┐
│  TopBar (Logo URUS, Notificaciones, Perfil, Rol)     │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  Sidebar   │          Contenido Principal            │
│  (Nav)     │          (Outlet / Router)              │
│            │                                         │
│            │                                         │
└────────────┴─────────────────────────────────────────┘
```

### Componentes de Layout
- **`AppShell`** — Wrapper principal con sidebar colapsable
- **`TopBar`** — Logo, buscador global, notificaciones en tiempo real (Badge con contador), selector de rol (CEO/Comercial), avatar
- **`Sidebar`** — Navegación con iconos Lucide, secciones agrupadas, indicadores de alertas activas
- **`BreadcrumbNav`** — Navegación contextual en cada página

### Selector de Rol (CEO / Comercial)
Un `Select` de Shadcn que cambia la vista completa según el rol seleccionado. El CEO ve todo; el Comercial ve solo su "espejo" y herramientas operativas.

---

## 3. Mapa de Rutas y Vistas

```
/                              → Dashboard Principal (CEO)
/coach                         → Coach & Soporte Emocional
/coach/chat                    → Chat con el Asistente IA
/coach/metricas                → Métricas de uso del Coach
/post-venta                    → Automatización Post-Venta
/post-venta/pipeline           → Pipeline visual de etapas
/post-venta/operacion/[id]     → Detalle de operación cerrada
/colaboradores                 → Gestión de Colaboradores Externos
/colaboradores/[id]            → Perfil del colaborador
/colaboradores/ranking         → Rankings y comparativas
/matching                      → Motor de Decisión (Matching)
/matching/cruces               → Cruces automáticos activos
/matching/feedback             → Feedback Loop del cliente
/pricing                       → Smart Pricing
/pricing/analisis/[id]         → Análisis de inmueble (Semáforo)
/pricing/mercado               → Vista de mercado comparativo
/legal                         → Automatización Legal
/legal/contratos               → Lista de contratos
/legal/contratos/[id]          → Editor de contrato + Voice
/legal/plantillas              → Gestión de plantillas
/bi                            → Business Intelligence
/bi/financiero                 → Capa 1: Estado Financiero
/bi/operativo                  → Capa 2: Rendimiento Operativo
/bi/capital-humano             → Capa 3: Riesgo Capital Humano
/bi/prescriptivo               → Capa 4: Analítica Prescriptiva
/bi/expansion                  → Capa 5: Motor de Expansión
/bi/reinversion                → Capa 6: Control Financiero
/rendimiento                   → Performance Management System
/rendimiento/equipo            → Vista de equipo completo
/rendimiento/comercial/[id]    → Perfil individual
/rendimiento/alertas           → Alertas y anomalías
/configuracion                 → Configuración general
```

---

## 4. Detalle de Cada Vista

### 4.1 Dashboard Principal (`/`)

**Propósito:** Vista ejecutiva para el CEO. Resumen en tiempo real de todo el ecosistema.

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| KPI Cards (4) | `Card` | Facturación, EBITDA, Cash Flow, Operaciones activas. Cada una con sparkline y variación % |
| Semáforo de Salud | `Badge` + custom | 🟢🟡🔴 Estado global de la empresa |
| Alertas Activas | `Card` + `Badge` | Lista de alertas críticas de todos los subsistemas |
| Operaciones Recientes | `Card` + tabla | Últimas 5 operaciones con estado |
| Equipo — Mapa de Calor | Custom grid | Estado emocional agregado del equipo (datos del Coach) |
| Actividad en Tiempo Real | Feed animado | Eventos entrando en tiempo real (simulados con setInterval) |
| Gráfico de Tendencia | Chart area | Facturación mensual últimos 12 meses |

**Datos Simulados:**
```typescript
// Generador de KPIs que fluctúan cada 5 segundos
const kpis = {
  facturacion: { valor: 847500, variacion: +12.3, tendencia: 'up' },
  ebitda: { valor: 234100, variacion: +8.7, tendencia: 'up' },
  cashFlow: { valor: 156800, variacion: -2.1, tendencia: 'down' },
  operacionesActivas: { valor: 23, variacion: +4, tendencia: 'up' }
}
```

---

### 4.2 Coach & Soporte Emocional (`/coach`)

#### 4.2.1 Dashboard del Coach (`/coach`)

**Propósito:** El CEO ve el estado emocional agregado sin revelar información sensible.

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Nivel de Estrés del Equipo | `Card` + gauge | Indicador visual agregado (bajo/medio/alto) |
| Comerciales que Necesitan Apoyo | `Card` + `Badge` | Lista con alertas (sin revelar contenido) |
| Métricas de Uso por Comercial | Tabla con `Badge` | Frecuencia, última sesión, tendencia |
| Gráfico de Uso Semanal | Bar chart | Uso del coach por día de la semana |

#### 4.2.2 Chat del Asistente (`/coach/chat`)

**Propósito:** Interfaz de chat con el asistente IA motivacional/coach.

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Lista de Conversaciones | Sidebar panel | Historial de chats anteriores |
| Área de Chat | Custom | Burbujas de mensaje estilo WhatsApp |
| Input de Mensaje | `Input` + `Button` | Campo de texto con envío |
| Indicador de Typing | Animación dots | El bot "escribiendo..." |
| Sugerencias Rápidas | `Badge` clickables | "¿Cómo me siento?", "Tips de cierre", "Motivación" |

**Simulación:** Respuestas del bot con delay de 1-3 segundos. Mensajes predefinidos de coaching.

---

### 4.3 Automatización Post-Venta (`/post-venta`)

#### 4.3.1 Pipeline Visual (`/post-venta/pipeline`)

**Propósito:** Visualizar todas las operaciones cerradas y su progreso por las 5 etapas.

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Kanban de 5 columnas | Custom + `Card` | Etapa 1→5, cada tarjeta es una operación |
| Tarjeta de Operación | `Card` + `Badge` | Nombre, fecha cierre, etapa actual, tipo cliente |
| Filtros | `Select` + `Combobox` | Por comercial, tipo, fecha, estado |
| Timeline de Eventos | Lista vertical | Mensajes enviados, respuestas recibidas |
| Contador por Etapa | `Badge` | Número de operaciones en cada etapa |

**Etapas del Pipeline:**
1. **Cierre Inmediato** — Agradecimiento + Email resumen + Checklist
2. **Soporte Temprano** — Validación + Mini guía
3. **Reputación** — Petición de reseña + Recordatorio
4. **Referidos** — Invitación + Enlace directo
5. **Recaptación** — Segmentación (Comprador/Inversor/Vendedor)

#### 4.3.2 Detalle de Operación (`/post-venta/operacion/[id]`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Header con Info | `Card` | Propiedad, precio, partes, fecha firma |
| Progress Steps | Stepper custom | Las 5 etapas con estado visual |
| Checklist de Cierre | Checkboxes | "Operación cerrada correctamente" |
| Historial de Mensajes | Timeline | Cada mensaje enviado con timestamp y respuesta |
| Documentación | Lista archivos | PDFs adjuntos de la operación |
| Segmentación del Cliente | `Badge` | Comprador / Inversor / Vendedor |

---

### 4.4 Gestión de Colaboradores Externos (`/colaboradores`)

#### 4.4.1 Vista General (`/colaboradores`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Tabla de Colaboradores | Tabla + `Badge` | Nombre, tipo, ciudad, SLA, operaciones, score |
| Filtros | `Select` + `Combobox` | Por tipo, ciudad, especialidad, rendimiento |
| KPIs Globales (3 cards) | `Card` | Total colaboradores, SLA promedio, operaciones bloqueadas |
| Alertas de SLA | `Card` rojo | Colaboradores que exceden su SLA |
| Estado de Hitos | `Badge` semáforo | Tiempo real: En proceso / Retrasado / Completado |

**Datos en Tiempo Real (Triggers):**
- Estado actual de hitos (actualización cada 10s)
- Alertas críticas
- Operaciones bloqueadas HOY

**Datos Agregados (CRON):**
- Rankings, tendencias mensuales, impacto económico

#### 4.4.2 Perfil del Colaborador (`/colaboradores/[id]`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Header con Info | `Card` | Nombre, tipo, ciudad, especialidad, SLA esperado |
| Métricas Históricas | Charts | Tiempo medio de respuesta, tasa de éxito |
| Operaciones Asociadas | Tabla | Lista de operaciones con estado |
| Score de Rendimiento | Gauge | Puntuación general con tendencia |
| Comparativa vs Media | Bar chart | Su rendimiento vs promedio del tipo |

#### 4.4.3 Rankings (`/colaboradores/ranking`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Tabla Ranking | Tabla ordenable | Posición, nombre, score, tendencia |
| Top 3 Destacados | `Card` premium | Los mejores colaboradores con métricas |
| Bottom 3 Problemáticos | `Card` alerta | Los que restan rentabilidad |
| Comparativas | Chart barras | Comparativas personalizadas |
| Exportar | `Button` | Exportación de reportes (simulado) |

---

### 4.5 Motor de Decisión — Matching (`/matching`)

#### 4.5.1 Cruces Automáticos (`/matching/cruces`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Feed de Cruces | Lista animada | Nuevos matches entrando en tiempo real |
| Tarjeta de Match | `Card` | Propiedad ↔ Comprador, variables que coinciden, % match |
| Variables de Filtro | `Badge` | Precio ✓, Zona ✓, Metros ✓, Habitaciones ✓ |
| Estado del Mensaje | `Badge` | Enviado / Me encaja / No me encaja / Busco diferente |
| Mapa de Zonas | Placeholder mapa | Distribución geográfica de matches |
| Preview WhatsApp | `Card` estilo WA | Vista previa del mensaje con botones |

**Simulación:** Cada 15 segundos aparece un nuevo match con animación slide-in.

#### 4.5.2 Feedback Loop (`/matching/feedback`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Historial de Feedback | Timeline | Respuestas del cliente con interpretación IA |
| Actualización Automática | `Card` highlight | "El sistema actualizó: Presupuesto máximo → 280.000€" |
| Métricas de Aprendizaje | Charts | Mejora en precisión de matches con el tiempo |
| Cola de Validación | Lista + botones | Propiedades pre-filtradas para que el agente valide (Sí/No) |

---

### 4.6 Smart Pricing (`/pricing`)

#### 4.6.1 Vista General (`/pricing`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Grid de Propiedades | Cards grid | Cada propiedad con su semáforo (🟢🟡🔴) |
| Filtros | `Select` | Por zona, estado, semáforo, días sin llamadas |
| Resumen Global | 3 `Card` | Total por cada color de semáforo |
| Alertas de Precio | `Card` rojo | Propiedades "quemadas" que necesitan acción urgente |

#### 4.6.2 Análisis de Inmueble (`/pricing/analisis/[id]`)

**Propósito:** "Informe de 1 página" para toma de decisiones rápidas.

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Semáforo Grande | Indicador visual | 🟢 Bien posicionado / 🟡 Riesgo / 🔴 Fuera de mercado |
| Datos del Inmueble | `Card` | Dirección, precio, metros, habitaciones, estado |
| Cluster Comparativo | Tabla | 5-8 propiedades similares (misma zona, metros, tipología) |
| Gap de Precio | `Card` + barra | % diferencia vs media, posición en página de portales |
| Comparación de Extras | Tabla check | Terraza, garaje, ascensor, reforma — URUS vs Competencia |
| Recomendación IA | `Card` destacada | Texto persuasivo generado: "Para competir con los 5 primeros..." |
| Acción Recomendada | `Badge` grande | "Bajar precio" / "Mejorar fotos" / "Reposicionar" |
| Histórico de Posición | Line chart | Evolución de la posición en portales |

#### 4.6.3 Vista de Mercado (`/pricing/mercado`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Mapa de Calor por Zona | Grid visual | Precios medios por distrito con código de color |
| Tendencia de Precios | Line chart | Evolución de precios por zona |
| Competencia Directa | Tabla | Propiedades de competencia con comparativa |

---

### 4.7 Automatización Legal (`/legal`)

#### 4.7.1 Lista de Contratos (`/legal/contratos`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Tabla de Contratos | Tabla | Operación, tipo (Reserva/Arras), versión, estado, fecha |
| Filtros | `Select` | Por tipo, estado, comercial, fecha |
| Estado Visual | `Badge` | Borrador / Revisión Gestor / Enviado a Firma / Firmado |
| Acciones Rápidas | `Button` | Ver, Editar por Voz, Enviar a Firma |

#### 4.7.2 Editor de Contrato (`/legal/contratos/[id]`)

**Propósito:** Vista del contrato con edición por voz (Voice-to-Action).

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Visor de Contrato | Panel izquierdo | Documento renderizado con bloques dinámicos resaltados |
| Panel de Variables | Panel derecho | Variables del contrato editables (precio, fecha, partes) |
| Bloques Condicionales | Toggle visual | Activar/desactivar bloques (Anexo Mobiliario, Condición Hipotecaria) |
| Botón de Voz | `Button` circular | Micrófono para Voice-to-Action |
| Transcripción | `Card` | Texto interpretado por STT |
| Interpretación IA | `Card` highlight | "clausula_condicion_hipotecaria = TRUE" |
| Control de Versiones | Timeline lateral | v1_Borrador → v2_CambiosGestor → Firmado |
| Envío a Firma | `Button` + modal | Simulación de envío DocuSign/Signaturit |
| Historial de Cambios | Diff visual | Qué cambió entre versiones |

**Simulación Voice-to-Action:**
1. Click en micrófono → animación de grabación
2. Después de 3s → muestra transcripción simulada
3. La IA interpreta → muestra acción propuesta
4. El contrato se actualiza visualmente

#### 4.7.3 Gestión de Plantillas (`/legal/plantillas`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Grid de Plantillas | Cards | Reserva, Arras Penitenciales, Arras Confirmatorias |
| Editor de Plantilla | Panel dual | Bloques fijos vs condicionales |
| Variables Disponibles | Lista | Todas las variables inyectables desde CRM |

---

### 4.8 Business Intelligence (`/bi`)

#### 4.8.1 Capa 1: Estado Financiero (`/bi/financiero`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| 4 KPI Cards con Semáforo | `Card` + `Badge` | Facturación, EBITDA, Cash Flow, Coste Operativo |
| Semáforo Global | Visual grande | 🟢🟡🔴 Estado de salud financiera |
| Gráfico de Tendencia | Area chart | Evolución mensual de cada KPI |
| Umbrales Configurables | `Input` | El CEO define sus límites tolerables |
| Alertas de Umbral | Notificación | Cuando un indicador cruza un umbral |

#### 4.8.2 Capa 2: Rendimiento Operativo (`/bi/operativo`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Desglose por Ciudad | Tabs + tabla | Valencia, Madrid, etc. con métricas |
| Rentabilidad por Comercial | Tabla ranking | Ingresos, costes, margen neto por persona |
| Detección de Ineficiencias | `Card` alerta | Saturación o infrautilización de recursos |
| Comparativa entre Sedes | Bar chart | Rendimiento lado a lado |

#### 4.8.3 Capa 3: Riesgo Capital Humano (`/bi/capital-humano`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Mapa de Presión por Zona | Heatmap | Zonas con alta presión/fatiga |
| Indicadores Agregados | `Card` | Sin datos individuales sensibles |
| Riesgo de Baja Laboral | `Badge` | Zonas con riesgo alto (datos del Coach) |
| Recomendación de Intervención | `Card` acción | Sugerencias preventivas |

#### 4.8.4 Capa 4: Analítica Prescriptiva (`/bi/prescriptivo`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Recomendaciones Automáticas | Lista `Card` | Contratar, Formar, Redistribuir leads |
| Reglas Condicionales | Tabla | Si Carga > X → Acción Y |
| Impacto Estimado | `Badge` | Estimación de mejora si se aplica |
| Historial de Recomendaciones | Timeline | Pasadas con resultado |

#### 4.8.5 Capa 5: Motor de Expansión (`/bi/expansion`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Checklist de Expansión | Progress steps | Métricas que deben cumplirse |
| Métricas Actuales vs Umbral | Barras de progreso | Margen estable, cash disponible, liderazgo |
| Mapa de Sedes | Visual | Actuales + potenciales |
| Simulador | `Input` + chart | "¿Qué pasa si abro en Barcelona?" |

#### 4.8.6 Capa 6: Control Financiero (`/bi/reinversion`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Tesorería Actual | `Card` grande | Saldo disponible con tendencia |
| ROI por Inversión | Tabla | Cada inversión con su retorno |
| Capital Reinvertible | Gauge | Cuánto se puede reinvertir sin riesgo |
| Simulador de Reinversión | `Input` + visual | Escenarios de inversión |

---

### 4.9 Performance Management System (`/rendimiento`)

#### 4.9.1 Vista de Equipo (`/rendimiento/equipo`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Tabla del Equipo | Tabla completa | Nombre, KPIs, arquetipo, tendencia |
| Clasificación por Arquetipo | 4 `Card` con color | Top Performer / Productivo Ineficiente / Dependiente Lead / Bajo Rendimiento |
| Filtros | `Select` | Por ciudad, periodo, arquetipo |
| Comparativa Equipo | Bar chart | Medias vs individuales |
| KPIs Globales | 3 `Card` | % Contacto Efectivo, Conversión Visita→Cierre, Facturación/Lead |

**Los 4 Arquetipos (con colores):**
1. 🟢 **Top Performer** — Alta conversión + Alta actividad
2. 🔵 **Productivo Ineficiente** — Mucha actividad, poco cierre → Necesita capacitación
3. 🟡 **Dependiente del Lead Caliente** — Solo cierra lo fácil → "Recogepedidos"
4. 🔴 **Bajo Rendimiento Estructural** — Malos números → Despido justificado

#### 4.9.2 Perfil Individual (`/rendimiento/comercial/[id]`)

**Vista CEO:**
| Componente | Shadcn | Descripción |
|---|---|---|
| KPIs del Comercial | `Card` | Conversión, actividad, facturación |
| Arquetipo Asignado | `Badge` grande | Con justificación |
| Tendencia Semanal | Line chart | Últimas 12 semanas |
| Coste de Oportunidad | `Card` rojo | Dinero perdido por leads mal gestionados |
| Recomendación | `Card` acción | Clonar métodos / Capacitar / Reasignar / Despedir |

**Vista Comercial ("Espejo"):**
| Componente | Shadcn | Descripción |
|---|---|---|
| Mis KPIs | `Card` | Mi rendimiento personal |
| Yo vs Media del Equipo | Bar chart | Comparativa anónima |
| Mi Tendencia | Line chart | Mi evolución en el tiempo |
| Objetivos | Progress bars | Progreso hacia metas |

#### 4.9.3 Alertas y Anomalías (`/rendimiento/alertas`)

**Componentes:**
| Componente | Shadcn | Descripción |
|---|---|---|
| Feed de Alertas | Lista con prioridad | Alertas activas con severidad |
| Anomalía: Caída de Rendimiento | `Card` rojo | "Top Performer X bajó rendimiento 2 semanas" |
| Coste de Oportunidad Global | `Card` | Dinero perdido por leads en comerciales de baja conversión |
| Acciones Sugeridas | `Button` | Intervenir / Reasignar / Monitorear |

---

## 5. Sistema de Notificaciones en Tiempo Real

Componente global que simula notificaciones de todos los subsistemas:

```typescript
type Notification = {
  id: string
  source: 'post-venta' | 'colaboradores' | 'matching' | 'pricing' | 'legal' | 'bi' | 'rendimiento' | 'coach'
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  timestamp: Date
  read: boolean
}
```

**Ejemplos simulados:**
- 🔴 "Colaborador 'Banco Santander' excede SLA en operación #45"
- 🟡 "Propiedad Calle Mayor 12 fuera de mercado — Semáforo Rojo"
- 🟢 "Nuevo match: Piso Valencia ↔ Cliente García (92% coincidencia)"
- 🔵 "Contrato #23 firmado por ambas partes"
- 🟡 "Comercial Ana López: caída de rendimiento 2 semanas consecutivas"

---

## 6. Datos Simulados — Estructura

### 6.1 Entidades Principales

```typescript
// Comerciales
interface Comercial {
  id: string; nombre: string; ciudad: string;
  kpis: { contactoEfectivo: number; conversionVisita: number; facturacionLead: number };
  arquetipo: 'top' | 'ineficiente' | 'dependiente' | 'bajo';
  tendencia: number[]; // últimas 12 semanas
  nivelEstres: 'bajo' | 'medio' | 'alto';
  sesionesCoach: number;
}

// Propiedades
interface Propiedad {
  id: string; direccion: string; precio: number; metros: number;
  habitaciones: number; zona: string; tipologia: string; estado: string;
  semaforo: 'verde' | 'amarillo' | 'rojo';
  diasSinLlamadas: number; posicionPortal: number;
  gapPrecio: number; // % vs media
}

// Operaciones Post-Venta
interface OperacionPostVenta {
  id: string; propiedad: string; fechaCierre: Date;
  etapaActual: 1 | 2 | 3 | 4 | 5;
  tipoCliente: 'comprador' | 'inversor' | 'vendedor';
  mensajesEnviados: Mensaje[];
  checklistCompleto: boolean;
}

// Colaboradores
interface Colaborador {
  id: string; nombre: string; tipo: string;
  ciudad: string; especialidad: string;
  slaEsperado: number; // días
  slaReal: number; // días
  operaciones: number; score: number;
  estado: 'ok' | 'retrasado' | 'critico';
}

// Contratos
interface Contrato {
  id: string; operacion: string; tipo: 'reserva' | 'arras';
  version: string; estado: 'borrador' | 'revision' | 'enviado' | 'firmado';
  variables: Record<string, string | number | boolean>;
  bloquesActivos: string[];
}

// Matches
interface Match {
  id: string; propiedad: Propiedad; comprador: string;
  porcentajeMatch: number;
  variablesCoincidentes: string[];
  estadoMensaje: 'enviado' | 'me_encaja' | 'no_encaja' | 'busco_diferente';
}
```

### 6.2 Generadores de Tiempo Real

```typescript
// Intervalos de actualización simulada
const INTERVALS = {
  kpiFluctuation: 5000,      // KPIs financieros cada 5s
  newMatch: 15000,            // Nuevo match cada 15s
  notification: 8000,         // Nueva notificación cada 8s
  hitoUpdate: 10000,          // Estado de hitos cada 10s
  chatResponse: 2000,         // Respuesta del coach 2s
  activityFeed: 3000,         // Actividad en dashboard cada 3s
}
```

---

## 7. Componentes Shadcn Necesarios

### Ya instalados:
`alert-dialog`, `badge`, `button`, `card`, `combobox`, `dropdown-menu`, `field`, `input-group`, `input`, `label`, `select`, `separator`, `textarea`

### Por instalar:
```bash
npx shadcn@latest add table tabs tooltip avatar progress dialog sheet scroll-area skeleton switch checkbox popover command toggle-group collapsible
```

### Componentes Custom a Crear:
| Componente | Uso |
|---|---|
| `Semaforo` | Indicador visual 🟢🟡🔴 reutilizable |
| `KpiCard` | Card con valor, variación, sparkline y semáforo |
| `TimelineEvent` | Evento en timeline con icono, timestamp y contenido |
| `ChatBubble` | Burbuja de mensaje (usuario/bot) |
| `VoiceRecorder` | Botón de micrófono con animación de grabación |
| `StepperProgress` | Indicador de pasos (5 etapas post-venta) |
| `ArquetipoCard` | Card con color de arquetipo y métricas |
| `MatchCard` | Card de match propiedad ↔ comprador |
| `ContratoViewer` | Visor de contrato con bloques resaltados |
| `NotificationFeed` | Feed de notificaciones en tiempo real |
| `GaugeChart` | Indicador circular de puntuación |
| `HeatmapGrid` | Grid de mapa de calor (estrés, precios) |
| `ActivityFeed` | Feed de actividad con animación |
| `SparklineChart` | Mini gráfico inline para KPIs |

---

## 8. Estructura de Archivos

```
app/
├── layout.tsx                    # AppShell + TopBar + Sidebar
├── page.tsx                      # Dashboard Principal
├── globals.css                   # Estilos globales + tema URUS
├── coach/
│   ├── page.tsx                  # Dashboard Coach
│   ├── chat/
│   │   └── page.tsx              # Chat con Asistente IA
│   └── metricas/
│       └── page.tsx              # Métricas de uso
├── post-venta/
│   ├── page.tsx                  # Redirect → pipeline
│   ├── pipeline/
│   │   └── page.tsx              # Pipeline Kanban
│   └── operacion/
│       └── [id]/
│           └── page.tsx          # Detalle operación
├── colaboradores/
│   ├── page.tsx                  # Vista general
│   ├── [id]/
│   │   └── page.tsx              # Perfil colaborador
│   └── ranking/
│       └── page.tsx              # Rankings
├── matching/
│   ├── page.tsx                  # Redirect → cruces
│   ├── cruces/
│   │   └── page.tsx              # Cruces automáticos
│   └── feedback/
│       └── page.tsx              # Feedback Loop
├── pricing/
│   ├── page.tsx                  # Grid con semáforos
│   ├── analisis/
│   │   └── [id]/
│   │       └── page.tsx          # Análisis "1 página"
│   └── mercado/
│       └── page.tsx              # Vista de mercado
├── legal/
│   ├── page.tsx                  # Redirect → contratos
│   ├── contratos/
│   │   ├── page.tsx              # Lista de contratos
│   │   └── [id]/
│   │       └── page.tsx          # Editor + Voice
│   └── plantillas/
│       └── page.tsx              # Gestión plantillas
├── bi/
│   ├── page.tsx                  # Overview BI (6 capas)
│   ├── financiero/
│   │   └── page.tsx              # Capa 1
│   ├── operativo/
│   │   └── page.tsx              # Capa 2
│   ├── capital-humano/
│   │   └── page.tsx              # Capa 3
│   ├── prescriptivo/
│   │   └── page.tsx              # Capa 4
│   ├── expansion/
│   │   └── page.tsx              # Capa 5
│   └── reinversion/
│       └── page.tsx              # Capa 6
├── rendimiento/
│   ├── page.tsx                  # Redirect → equipo
│   ├── equipo/
│   │   └── page.tsx              # Vista equipo
│   ├── comercial/
│   │   └── [id]/
│   │       └── page.tsx          # Perfil individual
│   └── alertas/
│       └── page.tsx              # Alertas y anomalías
└── configuracion/
    └── page.tsx                  # Configuración

components/
├── ui/                           # Shadcn (ya existe)
├── layout/
│   ├── app-shell.tsx
│   ├── top-bar.tsx
│   ├── sidebar.tsx
│   └── breadcrumb-nav.tsx
├── dashboard/
│   ├── kpi-card.tsx
│   ├── activity-feed.tsx
│   ├── semaforo.tsx
│   └── sparkline-chart.tsx
├── coach/
│   ├── chat-bubble.tsx
│   ├── stress-gauge.tsx
│   └── coach-metrics.tsx
├── post-venta/
│   ├── pipeline-kanban.tsx
│   ├── stepper-progress.tsx
│   └── operation-card.tsx
├── colaboradores/
│   ├── collaborator-card.tsx
│   ├── sla-indicator.tsx
│   └── ranking-table.tsx
├── matching/
│   ├── match-card.tsx
│   ├── whatsapp-preview.tsx
│   └── feedback-timeline.tsx
├── pricing/
│   ├── semaforo-grande.tsx
│   ├── cluster-table.tsx
│   └── gap-indicator.tsx
├── legal/
│   ├── contrato-viewer.tsx
│   ├── voice-recorder.tsx
│   ├── version-timeline.tsx
│   └── block-toggle.tsx
├── bi/
│   ├── layer-card.tsx
│   ├── threshold-config.tsx
│   └── expansion-checklist.tsx
├── rendimiento/
│   ├── arquetipo-card.tsx
│   ├── espejo-view.tsx
│   └── anomaly-alert.tsx
└── shared/
    ├── notification-feed.tsx
    ├── gauge-chart.tsx
    ├── heatmap-grid.tsx
    ├── timeline-event.tsx
    └── data-generators.ts       # Generadores de datos simulados

lib/
├── utils.ts                      # Ya existe
├── mock-data/
│   ├── comerciales.ts
│   ├── propiedades.ts
│   ├── operaciones.ts
│   ├── colaboradores.ts
│   ├── contratos.ts
│   ├── matches.ts
│   ├── financiero.ts
│   └── notificaciones.ts
└── hooks/
    ├── use-real-time.ts          # Hook para simular datos en tiempo real
    ├── use-notifications.ts     # Hook de notificaciones
    └── use-role.ts              # Hook del selector de rol
```

---

## 9. Tema y Diseño Visual

### Paleta de Colores
- **Primary:** Azul oscuro corporativo (#1a365d)
- **Secondary:** Dorado URUS (#c9a84c)
- **Background:** Gris muy oscuro (#0f1117) — Dark Mode
- **Surface:** Gris oscuro (#1a1d23) con glassmorphism
- **Success:** Verde esmeralda (#10b981)
- **Warning:** Ámbar (#f59e0b)
- **Danger:** Rojo (#ef4444)
- **Info:** Azul claro (#3b82f6)

### Tipografía
- **Headings:** Inter (600/700)
- **Body:** Inter (400)
- **Monospace:** JetBrains Mono (para datos numéricos)

### Animaciones
- Entrada de datos en tiempo real: `slide-in-right` + `fade-in`
- Cambios de KPI: `count-up` animation
- Notificaciones: `slide-down` desde TopBar
- Transiciones de página: `fade` suave
- Hover en cards: `scale(1.02)` + sombra elevada
- Semáforos: `pulse` suave en alertas activas

---

## 10. Navegación del Sidebar

```
📊 Dashboard
🧠 Coach Emocional
   ├── Dashboard
   ├── Chat
   └── Métricas
📦 Post-Venta
   ├── Pipeline
   └── Operaciones
👥 Colaboradores
   ├── Vista General
   ├── Rankings
   └── Perfiles
🔄 Matching
   ├── Cruces Automáticos
   └── Feedback Loop
💰 Smart Pricing
   ├── Semáforo General
   ├── Análisis
   └── Mercado
📄 Legal
   ├── Contratos
   └── Plantillas
📈 Business Intelligence
   ├── Financiero
   ├── Operativo
   ├── Capital Humano
   ├── Prescriptivo
   ├── Expansión
   └── Reinversión
🏆 Rendimiento
   ├── Equipo
   ├── Comerciales
   └── Alertas
⚙️ Configuración
```
