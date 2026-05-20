# Plan de Mejora de UI — Urus Capital Group

> Plan accionable para modernizar la plataforma interna y resolver los problemas de claridad, consistencia y experiencia identificados en el audit de UX.

---

## Resumen ejecutivo

La plataforma está funcionalmente completa pero sufre de **inconsistencia visual entre pantallas**, **navegación confusa por la coexistencia de sidebar + tabs**, y **falta de jerarquía clara en la información**. El stack ya está bien preparado (design tokens completos en `globals.css`, shadcn/ui instalado), por lo que la mejora es principalmente de **disciplina arquitectónica**, no de reescritura.

El plan se divide en **4 fases** con criterios de éxito claros. Cada fase es independiente y entrega valor por sí sola.


| Fase                                  | Objetivo                                           | Esfuerzo | Impacto |
| ------------------------------------- | -------------------------------------------------- | -------- | ------- |
| **1. Fundamentos**                    | Crear primitivas reutilizables y normalizar tokens | Alto     | Crítico |
| **2. Navegación**                     | Resolver conflicto sidebar/tabs, breadcrumbs       | Medio    | Alto    |
| **3. Refactor pantalla por pantalla** | Aplicar componentes nuevos a vistas existentes     | Alto     | Alto    |
| **4. Pulido y a11y**                  | Loading states, accesibilidad, mobile              | Medio    | Medio   |


---

## Fase 1 — Fundamentos (semana 1-2)

**Objetivo:** Eliminar la divergencia entre pantallas creando componentes únicos reutilizables. Sin esto, cualquier refactor posterior reintroduce inconsistencia.

### 1.1 Auditoría de tokens y limpieza

**Acciones:**

- Buscar en todo el codebase usos de colores hardcoded: `grep -r "#[0-9a-fA-F]\{6\}" components/ app/` y `grep -r "bg-\(red\|yellow\|green\|blue\)-[0-9]" components/ app/`.
- Reemplazar cada ocurrencia por el token semántico correspondiente (`urus-success`, `urus-warning`, etc.).
- Documentar en `docs/design-tokens.md` qué token usar para qué caso (success vs warning vs danger).
- Crear ESLint rule custom o regla de Tailwind para advertir sobre clases de color crudo.

**Criterio de éxito:** `grep` no encuentra colores hardcoded en componentes UI.

### 1.2 Componente `<PageHeader />`

**Acción:** Crear `components/ui/page-header.tsx`:

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}
```

- Implementar con estructura fija: breadcrumbs arriba, título + descripción a la izquierda, actions a la derecha.
- Documentar en Storybook (si existe) o en `/banco-de-pruebas`.
- **Migrar las 7 pantallas principales** (Panel, Demandas, Visitas, Operaciones, Conversaciones, Captación, Inmuebles) a usarlo.

**Criterio de éxito:** Todas las páginas de `/platform/`* tienen el mismo layout de header.

### 1.3 Componente `<KpiCard />`

**Acción:** Crear `components/ui/kpi-card.tsx` con la API definida en `ux-patterns.mdc` sección 5.

Variantes:

- Default: solo dato.
- Con delta: muestra cambio vs período anterior.
- Con estado semántico: borde lateral en color del estado si valor amerita atención.
- Clickeable: con chevron y hover state si tiene `href`.

**Reglas críticas:**

- Si delta es 0%, no mostrar el delta (ruido).
- Si valor es 0 y label es de algo accionable (Alertas, Firmas), mostrar empty state inline: "Sin alertas — todo OK ✓".
- `tabular-nums` siempre en el número grande para evitar saltos.

**Criterio de éxito:** Las cards del Panel, Demandas, Visitas y Captación son visualmente idénticas en estructura.

### 1.4 Componente `<StatusBadge />`

**Acción:** Crear `components/ui/status-badge.tsx`:

```tsx
type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "ai";

interface StatusBadgeProps {
  variant: Variant;
  children: React.ReactNode;
  icon?: React.ReactNode;
}
```

- Crear mapeo `leadStatusToBadge.ts` con los 10 estados de `LeadStatus` mapeados a variantes (ver tabla en `.mdc` sección 5).
- Reemplazar en `/platform/demandas` todos los badges manuales por `<StatusBadge>`.
- Idem en `/platform/operaciones`, `/platform/visitas`.

**Criterio de éxito:** Mismo estado se ve igual en todas las vistas (ej. "Nuevo" siempre azul claro, "Cancelada" siempre rojo claro).

### 1.5 Componente `<DataTable />`

**Acción:** Crear o consolidar `components/ui/data-table.tsx` basado en `@tanstack/react-table` + shadcn.

Features mínimas:

- Skeleton loaders durante carga (no `███`).
- Empty state integrado con `<EmptyState />`.
- Filas clickeables con `hover:bg-muted/40`.
- Paginación o virtualización para > 50 filas.
- Columnas configurables (mostrar/ocultar).
- Header con `text-xs uppercase tracking-wider text-muted-foreground`.

**Criterio de éxito:** Demandas, Operaciones, Inmuebles, Cruces usan la misma tabla.

### 1.6 Componente `<EmptyState />`

**Acción:** Crear `components/ui/empty-state.tsx` con icono, título, descripción y CTA opcional.

- Documentar variantes recomendadas: lista vacía, búsqueda sin resultados, error de carga, sin permisos.
- Reemplazar todos los "0" o "No hay datos" actuales por este componente.

**Criterio de éxito:** Captación ya no muestra "No hay sesiones de captación" plano, sino un estado con CTA "Crear la primera".

### 1.7 Componente `<FilterBar />`

**Acción:** Crear `components/ui/filter-bar.tsx` que estandarice la barra de filtros.

- Buscador a la izquierda, ancho disponible.
- Máximo 4 filtros visibles, resto en popover "Más filtros".
- Aplicar filtros automáticamente al cambiar (eliminar el botón "Aplicar filtros" de Inmuebles).
- Botón "Limpiar" solo cuando hay filtros activos.

**Criterio de éxito:** La pantalla de Inmuebles (imagen 7) pasa de 6 selects + 2 inputs visibles a 3-4 + "Más filtros".

---

## Fase 2 — Navegación (semana 3)

**Objetivo:** Dar al usuario claridad sobre dónde está.

### 2.2 Sidebar: estado activo y jerarquía

**Acciones:**

- Estado activo del item: fondo `bg-accent` + barra lateral izquierda de 3px en `bg-primary`, no solo cambio de color de texto.
- Headers de grupo (`NAVEGACIÓN`, `PROCESOS IA`, etc.): hacer que tengan más separación vertical (`mt-6`) y nunca sean clickeables.
- Items con submenú: chevron explícito, animación de rotación al expandir.
- Badge "IA" usando `<StatusBadge variant="ai">IA</StatusBadge>` para consistencia.

### 2.3 Breadcrumbs

**Acciones:**

- Crear `components/ui/breadcrumb.tsx` basado en shadcn breadcrumb.
- Integrar en `<PageHeader />` como prop opcional.
- Aplicar en todas las vistas de detalle: `Inicio › Demandas › DEM-1234`, `Inicio › Operaciones › OP-2026-0001`, etc.

### 2.4 Sidebar colapsable

- Verificar que el botón "Contraer menú" funciona correctamente.
- Cuando está contraído, mostrar solo iconos con tooltips al hover.
- Persistir el estado en `localStorage` o cookie.

---

## Fase 3 — Refactor pantalla por pantalla (semana 4-6)

**Objetivo:** Aplicar los componentes de Fase 1 y la navegación de Fase 2 a cada pantalla, resolviendo problemas específicos.

Cada pantalla tiene su checklist. Se pueden trabajar en paralelo si hay varios devs.

### 3.1 Panel (Dashboard principal)

**Problemas actuales:**

- 4 KPIs con cero diferenciación visual.
- Datos en `0` que no comunican nada útil.
- Cards inferiores (Inteligencia, Legal, Colaboradores, Análisis) parecen botones pero su affordance es ambigua.

**Acciones:**

- Migrar KPIs a `<KpiCard />` con estado semántico:
  - "Operaciones activas" → default.
  - "Cierres del mes" → success si > 0, neutral si = 0.
  - "Alertas abiertas" → danger si > 0, success si = 0 ("Sin alertas — todo OK ✓").
  - "Firmas pendientes" → warning si > 0.
- Eliminar deltas de `+0%`.
- Las cards inferiores: convertirlas en `<NavigationCard />` con chevron explícito y hover state.
- Empty state cuando el usuario es nuevo: "Bienvenido. Cuando lleguen leads, esto se llenará."

### 3.2 Demandas

**Problemas actuales:**

- Filtros por estado (`Nuevo 243 | Contactado 0 | ...`) con todos los estados igual de prominentes aunque tengan 0.
- Tabla con columnas densas, jerarquía visual débil.
- Estados representados solo con badges de 2 colores.

**Acciones:**

- Filtros de estado: atenuar (`text-muted-foreground opacity-60`) los que tienen 0 demandas.
- Migrar todos los badges a `<StatusBadge>` con los 10 colores semánticos correctos.
- Columna "Comprador" con avatar/iniciales + nombre + warning inline si falta teléfono.
- Columna "Estado Pipeline" con badge semántico + tooltip con "última actividad".
- Acción "Completar teléfono" como `variant="warning"` (no destructive).

### 3.3 Visitas

**Problemas actuales:**

- KPIs sin contexto ("0 pendientes de agenda" no dice nada).
- Panel derecho vacío con texto plano.

**Acciones:**

- KPI "Pendientes de agenda" = 0: mostrar "Todas las visitas tienen fecha ✓" en lugar del 0 grande.
- Panel derecho de detalle: estado vacío con ilustración + "Selecciona una visita del listado para ver los detalles".
- Lista de visitas: cards más espaciadas, badge de estado consistente, agrupar por día con headers sticky.
- Botón "Crear visita manual" en posición consistente con otras pantallas (sección actions del `<PageHeader />`).

### 3.4 Operaciones

**Problemas actuales:**

- Sin descripción de página.
- Columna "Etapa" con placeholders `███████` (parece bug).
- Solo 2 operaciones canceladas, ambas en rojo — no se entiende el flujo positivo.

**Acciones:**

- Agregar `<PageHeader />` con descripción: "Pipeline de operaciones inmobiliarias y su estado actual."
- Reemplazar `███████` por skeleton real o por una visualización honesta del pipeline (ej. progress bar con etapas).
- Crear visualización de etapas tipo stepper inline en la celda.
- Empty state cuando no hay operaciones: "Aún no hay operaciones activas. Las operaciones se crean al confirmarse una visita."

### 3.5 Conversaciones

**Problemas actuales:**

- Mensajes en amarillo brillante sobre fondo oscuro fatigan la vista.
- Todos los mensajes alineados igual — no se distingue "yo" vs "el otro".
- Audio reproductor flotando incómodamente.

**Acciones:**

- **Cambiar el fondo de los mensajes propios:** de `urus-gold` brillante a `bg-primary/10` (azul tenue) o `bg-muted` (gris suave).
- Alinear mensajes propios a la derecha, mensajes del contacto a la izquierda.
- Avatar/iniciales del contacto a la izquierda de su mensaje.
- Audio reproductor: estilizar con controles propios consistentes (no el reproductor nativo), embebido en la burbuja.
- Badge "IA Activa" usando `<StatusBadge variant="ai">`.

### 3.6 Captación

**Problemas actuales:**

- 4 KPIs en cero ocupan media pantalla sin aportar.
- "No hay sesiones de captación" en gris plano.

**Acciones:**

- Si todos los KPIs son 0, colapsar la sección de KPIs y mostrar un onboarding inline: "Crea tu primera nota de encargo para empezar a captar inmuebles."
- Empty state real con ilustración + descripción + CTA "Crear primera nota".

### 3.7 Inmuebles (Oportunidades)

**Problemas actuales:**

- Demasiados filtros visibles simultáneamente.
- Botones de acción desordenados en una fila (`Ayuda | Acciones | Filtro | Exportar | Actualizar | Mostrar mapa`).
- Mezcla de patrones (tabla + cards de inmueble en cada fila).

**Acciones:**

- Migrar a `<FilterBar />` con 3-4 filtros visibles + "Más filtros".
- Agrupar acciones: "Mostrar mapa" como toggle separado a la derecha, "Exportar" y "Actualizar" agrupados en un dropdown "Acciones", "Filtro" eliminado (ya hay filterbar), "Ayuda" como tooltip del título.
- Eliminar el botón "Aplicar filtros" — aplicar al cambiar.
- Tabla con foto + datos en formato consistente, mismo estilo que Demandas.

### 3.8 Cruces Automáticos

**Problemas actuales:**

- Todos los cruces en rojo (50-51%) — el rojo pierde significado.
- "Compatibilidad media: 59%" en rojo desincentiva al usuario.
- Panel derecho vacío con texto plano.

**Acciones:**

- Escala de color por porcentaje: < 40% rojo, 40-70% amarillo, > 70% verde. Aplicar consistentemente.
- KPI "Compatibilidad media" con color según valor.
- Empty state en panel derecho con ilustración + "Selecciona un cruce para ver el desglose".
- Lista de cruces: ordenar por compatibilidad descendente por defecto.

---

## Fase 4 — Pulido y accesibilidad (semana 7)

**Objetivo:** Cumplir estándares de a11y y rematar los detalles que separan una UI buena de una excelente.

### 4.1 Loading states

- Auditar todas las pantallas: ¿muestran skeleton durante carga? Reemplazar spinners y blancos por skeletons con la forma del contenido.
- Acciones asíncronas: todos los botones deshabilitan + muestran spinner durante la operación.
- Optimistic UI en cambios frecuentes: marcar visita como confirmada, cambiar estado de demanda, toggle de filtros.

### 4.2 Accesibilidad

- Auditar contraste de toda la paleta (claro y oscuro) con axe DevTools o Lighthouse.
- Verificar que toda la app sea navegable solo con teclado.
- Focus visible en todos los elementos interactivos (`focus-visible:ring-2 focus-visible:ring-ring`).
- Iconos sin texto: `aria-label` obligatorio.
- Modales con trap focus + cerrar con Esc.
- Estados nunca solo por color — siempre con texto o ícono.

### 4.3 Responsive y mobile

- Probar todas las vistas en 375px (mobile pequeño).
- Sidebar como drawer en `< lg`.
- Tablas: convertir a cards verticales en mobile, no scroll horizontal.
- KPI grids: 1 col mobile, 2 tablet, 4 desktop.
- Touch targets ≥ 44px verificados.

### 4.4 Modo claro

- Verificar visualmente cada pantalla en modo claro.
- Ajustar contrastes que no funcionen.
- Probar que los badges semánticos siguen siendo legibles.

### 4.5 Microinteracciones

- Transiciones de hover: `transition-colors duration-150`.
- Expand/collapse del sidebar: animación suave de 200ms.
- Cambios de estado en pipeline: animación al pasar de un estado al otro.
- Toasts: posición consistente (bottom-right desktop, top mobile).

---

## Criterios de éxito globales

Al terminar las 4 fases, la plataforma debe cumplir:

1. **Consistencia:** Cualquier pantalla nueva puede construirse en menos de 2 horas usando los componentes existentes.
2. **Claridad:** Un comercial nuevo entiende cada pantalla en < 30 segundos sin tutorial.
3. **Accesibilidad:** WCAG AA en todo el flujo crítico (ingreso → demandas → visitas → operaciones).
4. **Velocidad percibida:** Ninguna interacción se siente "lenta" — skeleton loaders, optimistic UI y feedback inmediato en todo.
5. **Mobile-ready:** El comercial puede usar la plataforma desde el teléfono durante una visita.

---

## Recomendaciones adicionales

### Documentación viva

- Crear `/platform/banco-de-pruebas` (ya existe) como showcase de todos los componentes del sistema. Es el "Storybook ligero" de Urus.
- Documentar cada componente con: API, ejemplos de uso, antipatrones a evitar.

### Onboarding de nuevos devs

- Cada nuevo desarrollador debe leer `ux-patterns.mdc` antes del primer PR.
- Code review obligatorio con checklist de UI (sección 14 del `.mdc`).

### Métricas de seguimiento

Para validar que la mejora funciona, medir:

- **Tiempo a primera acción:** desde que un usuario nuevo entra hasta que completa su primera tarea (crear demanda, confirmar visita).
- **Tasa de errores:** clicks en lugares equivocados, abandono de formularios.
- **Soporte interno:** preguntas tipo "¿dónde está X?" o "¿cómo hago Y?" en el bot de soporte.

Si estas métricas mejoran tras Fase 3, la inversión valió la pena.

---

## Anexo: Quick wins (si solo puedes hacer 5 cosas esta semana)

Si el tiempo es limitado, estos son los cambios de máximo impacto con mínimo esfuerzo:

1. **Cambiar el color de los mensajes propios en Conversaciones** (de amarillo brillante a gris/azul tenue). Mejora inmediata de fatiga visual.
2. **Eliminar los `███████` de Operaciones** y reemplazar por skeleton o por el dato real. Quita la sensación de bug.
3. **Atenuar los filtros con 0 demandas** en la pantalla de Demandas. Mejora escaneabilidad.
4. **Reforzar el estado activo del sidebar** con fondo + barra lateral. El usuario sabrá siempre dónde está.
5. **Empty state real en Captación e Inteligencia de Negocio** con CTA "Crear primera nota". Convierte vacío en acción.

Cada uno toma menos de 2 horas y cambia la percepción del producto inmediatamente.