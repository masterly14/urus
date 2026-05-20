# Guía de UX para SaaS — Diseño centrado en el usuario

> Manual de referencia sobre el patrón de experiencia de usuario aplicado a aplicaciones SaaS, dashboards y herramientas internas. Independiente de stack o proyecto. Pensado como material de consulta para equipos de producto, diseño y desarrollo.

---

## Índice

1. [El principio rector: User-Centered Design](#1-el-principio-rector-user-centered-design)
2. [Las 10 heurísticas de Nielsen aplicadas a SaaS](#2-las-10-heurísticas-de-nielsen-aplicadas-a-saas)
3. [Jerarquía visual](#3-jerarquía-visual)
4. [Navegación e información](#4-navegación-e-información)
5. [Componentes interactivos](#5-componentes-interactivos)
6. [Feedback y estados del sistema](#6-feedback-y-estados-del-sistema)
7. [Prevención y manejo de errores](#7-prevención-y-manejo-de-errores)
8. [Accesibilidad](#8-accesibilidad)
9. [Performance percibida](#9-performance-percibida)
10. [Responsive y mobile](#10-responsive-y-mobile)
11. [Consistencia y design tokens](#11-consistencia-y-design-tokens)
12. [Antipatrones comunes](#12-antipatrones-comunes)

---

## 1. El principio rector: User-Centered Design

**El usuario no se adapta al sistema; el sistema se adapta al usuario.**

Este principio, formalizado por Don Norman en los años 80, es la base de prácticamente todos los frameworks modernos de diseño (Material Design, Apple Human Interface Guidelines, Microsoft Fluent, Nielsen Norman Group). La idea es simple pero radical: cada decisión de diseño debe partir de **lo que el usuario necesita hacer**, no de lo que es técnicamente conveniente o estéticamente atractivo.

### Las tres preguntas que toda pantalla debe responder en 3 segundos

Cuando un usuario abre cualquier vista de tu producto, en menos de tres segundos debe poder responder:

1. **¿Qué es esto?** — el propósito de la pantalla.
2. **¿Qué puedo hacer aquí?** — las acciones disponibles.
3. **¿Dónde estoy?** — su ubicación en el flujo completo.

Si una pantalla no comunica las tres cosas en ese tiempo, está mal diseñada, sin importar lo bonita que se vea.

### Criterios de validación de cada decisión

Toda decisión de UI debe poder justificarse con al menos uno de estos cinco criterios. Si no cumple ninguno, no se implementa:

- **Reduce la carga cognitiva** del usuario.
- **Acelera una tarea frecuente.**
- **Previene un error.**
- **Comunica el estado actual del sistema.**
- **Hace accesible la funcionalidad** a más personas.

**Ejemplo real:** Linear (gestor de proyectos) eliminó las animaciones decorativas de su interfaz porque ninguna cumplía estos criterios. El resultado: la app se siente más rápida y profesional. Notion, en cambio, añadió micro-animaciones solo donde comunican un cambio de estado (drag and drop, sincronización), no como adorno.

---

## 2. Las 10 heurísticas de Nielsen aplicadas a SaaS

Jakob Nielsen definió en 1994 diez heurísticas de usabilidad que siguen siendo el estándar. Aplicadas a SaaS:

### 2.1. Visibilidad del estado del sistema

El usuario siempre debe saber qué está pasando. Loading states, indicadores de sincronización, confirmaciones, contadores de progreso.

**Bien:** Gmail muestra "Guardando..." y luego "Guardado" cuando escribes un borrador. Slack indica con un punto si tu mensaje se envió, se entregó o falló.

**Mal:** Un formulario que tras click en "Guardar" no muestra nada hasta que la pantalla cambia. El usuario duda si hizo click correctamente y suele clickear de nuevo.

### 2.2. Coincidencia entre el sistema y el mundo real

Usa el lenguaje del usuario, no jerga técnica.

**Bien:** Stripe llama "Pagos" a lo que internamente son "Charges". Notion habla de "Páginas" y "Bloques", no de "Nodes" y "Entities".

**Mal:** Un CRM que muestra "Status: 200 OK" tras una acción exitosa, o errores del tipo "TypeError: cannot read property of undefined".

### 2.3. Control y libertad del usuario

Los usuarios cometen errores. Necesitan salidas claras: deshacer, cancelar, volver atrás.

**Bien:** Gmail tiene "Deshacer envío" durante 5-30 segundos. Figma tiene `Cmd+Z` infinito. Linear permite reabrir cualquier issue cerrado.

**Mal:** Un modal sin botón de cerrar. Una acción destructiva sin posibilidad de revertir. Un wizard de 5 pasos sin botón "Atrás".

### 2.4. Consistencia y estándares

El mismo concepto siempre se ve y se comporta igual.

**Bien:** En toda la suite de Google, "Compartir" es un botón con icono de persona+. En Atlassian, las prioridades de issue siempre usan los mismos colores (rojo = highest, gris = lowest).

**Mal:** En una misma app, el botón "Guardar" a veces es azul, a veces verde, a veces es un icono de disquete, a veces dice "Confirmar". El usuario nunca sabe qué buscar.

### 2.5. Prevención de errores

Mejor diseñar para que el error no ocurra que mostrarlo después.

**Bien:** GitHub deshabilita el botón "Merge" hasta que los checks pasan. Stripe valida el formato de la tarjeta mientras escribes. Notion pide confirmación al borrar una página con subpáginas ("Esto eliminará X subpáginas").

**Mal:** Un formulario que permite enviar con campos vacíos y luego muestra 7 errores. Un botón "Eliminar cuenta" sin confirmación.

### 2.6. Reconocer en vez de recordar

El usuario no debe memorizar nada. Las opciones deben estar visibles o sugeridas.

**Bien:** Slack autocompleta nombres de canales y usuarios al escribir `@` o `#`. VS Code sugiere comandos al apretar `Cmd+Shift+P`. Notion muestra plantillas en lugar de exigir que sepas qué crear.

**Mal:** Atajos de teclado críticos que solo aparecen en un manual oculto. Comandos que solo funcionan si recuerdas la sintaxis exacta.

### 2.7. Flexibilidad y eficiencia

Diseña para principiantes y power users a la vez. Atajos para los expertos, caminos guiados para los nuevos.

**Bien:** Linear se puede usar 100% con teclado (power users) o 100% con mouse (principiantes). Superhuman tiene atajos para todo pero también botones visibles.

**Mal:** Una app que obliga a todos a hacer clic en 5 menús para una acción frecuente, sin opción de atajo.

### 2.8. Diseño estético y minimalista

Cada elemento extra compite por la atención. Quita todo lo que no sume.

**Bien:** Stripe Dashboard muestra solo los 3-4 KPIs esenciales en la portada, el resto en secciones especializadas. Vercel solo muestra los deploys recientes; lo demás está a un click.

**Mal:** Dashboards con 20 widgets en la pantalla principal donde nada destaca. Sidebars con 30 ítems sin agrupar.

### 2.9. Ayudar al usuario a reconocer y recuperarse de errores

Mensajes de error claros, en lenguaje humano, con solución sugerida.

**Bien:** Stripe: "La tarjeta fue rechazada por fondos insuficientes. Intenta con otra tarjeta o contacta a tu banco." Incluye un botón de acción.

**Mal:** "Error 4032" sin más contexto. "Algo salió mal." sin indicar qué hacer.

### 2.10. Ayuda y documentación

Idealmente la interfaz se explica sola, pero cuando se necesita ayuda, debe ser fácil de encontrar y contextual.

**Bien:** Intercom y Linear tienen un buscador de ayuda integrado (`?` o `Cmd+/`). Tooltips contextuales en campos complejos.

**Mal:** Documentación en un sitio separado al que hay que salir de la app. Help icons que llevan a 50 páginas de FAQ sin estructura.

---

## 3. Jerarquía visual

La jerarquía visual es **cómo el ojo del usuario recorre la pantalla**. Define qué ve primero, qué después, y qué puede ignorar. Sin jerarquía, todo grita lo mismo y nada se entiende.

### Principios

**Lo más importante debe ser lo más visible.** Tamaño, color, contraste y posición son las herramientas. El CTA principal de una página debe destacar más que cualquier otro elemento. Los datos críticos (alertas, errores, vencimientos) deben tener más peso visual que los informativos.

**Reglas prácticas:**

- **Un solo CTA primario por pantalla.** Si hay dos, ninguno gana.
- **El ojo lee en zig-zag (patrón F o Z) en occidente.** Lo más importante va arriba a la izquierda y arriba a la derecha.
- **Tres niveles de jerarquía máximo en una vista.** Más de tres confunde.
- **Espacios en blanco son información.** Separan, agrupan y respiran.

### Escala tipográfica

Una escala consistente comunica jerarquía sin esfuerzo. Una propuesta estándar para SaaS:

| Nivel | Tamaño | Peso | Uso |
|---|---|---|---|
| Display | 32px+ | Bold | KPIs grandes, números destacados |
| Heading 1 | 24px | Semibold | Título de página (uno por vista) |
| Heading 2 | 20px | Semibold | Secciones dentro de la página |
| Heading 3 | 16px | Medium | Subsecciones, títulos de card |
| Body | 14px | Regular | Texto principal |
| Caption | 12px | Regular | Metadatos, hints, timestamps |

**Bien:** Stripe y Linear usan no más de 5 tamaños de texto en toda su app. La jerarquía es escaneable instantáneamente.

**Mal:** Apps con 12 tamaños de fuente distintos, donde no se sabe si un texto es título, subtítulo o body.

### KPIs y datos numéricos

En dashboards, los números son el contenido principal. Reglas:

- Número en grande (`text-3xl` o más), **bold**, con `tabular-nums` para evitar saltos al actualizar.
- Label arriba en pequeño y muted (`text-xs uppercase tracking-wider text-muted-foreground`).
- Delta o tendencia debajo con color semántico (verde sube, rojo baja) **pero también con icono** (flecha arriba/abajo) para no depender solo del color.
- Si el delta es 0%, no mostrarlo. Es ruido.

**Bien:** Plausible Analytics muestra el visitante actual gigante, con el delta en pequeño abajo y una sparkline contextual.

**Mal:** Un dashboard donde el número y el label tienen el mismo tamaño. O donde el delta de "+0%" aparece en todas las cards.

---

## 4. Navegación e información

La arquitectura de información es el esqueleto invisible del producto. Una buena navegación se nota cuando no se nota — el usuario simplemente llega donde quiere ir.

### Navegación primaria: sidebar vs topbar

**Sidebar (lateral):** Mejor para apps con muchas secciones (>5), donde el usuario salta entre ellas frecuentemente. Estándar en SaaS productivo: Linear, Notion, Asana, Slack.

**Topbar:** Mejor para apps con pocas secciones (<5) o para sitios con foco en contenido. Usa topbar Github, Vercel.

**Anti-patrón crítico: dos sistemas de navegación primaria simultáneos.** Sidebar + tabs persistentes encima es confuso. El usuario no sabe cuál es la navegación "real". Si necesitas ambos, uno debe ser claramente secundario.

### Item activo

El usuario debe saber siempre en qué sección está. Reglas:

- **Cambiar solo el color del texto no es suficiente.** Debe haber fondo, borde lateral, o ambos.
- Combinación recomendada: fondo sutil (`bg-accent`) + barra lateral de 2-3px en color primario.
- El icono también debe cambiar (relleno vs outline, o color).

**Bien:** Notion usa fondo gris claro + texto bold para el item activo del sidebar. Linear usa fondo gris + barra lateral de color.

**Mal:** Sidebars donde el item activo solo cambia el color del texto y se pierde entre los demás items.

### Breadcrumbs

Cuando hay jerarquía profunda (>2 niveles), los breadcrumbs son obligatorios. Ejemplo:

```
Inicio › Proyectos › Marketing Q4 › Tarea: Diseñar landing
```

Permiten al usuario:
- Saber dónde está.
- Navegar hacia arriba sin usar el botón "atrás" del navegador.
- Entender la estructura jerárquica del producto.

**Bien:** GitHub usa breadcrumbs en cada archivo (`org/repo/folder/file.tsx`). Notion los muestra arriba de cada página.

**Mal:** Apps con jerarquía profunda donde la única forma de volver es el botón atrás del navegador (que rompe si la app es SPA).

### Tabs (uso restringido)

Las tabs sirven para alternar entre vistas del mismo recurso, no como navegación general.

**Bien:** En GitHub, un repositorio tiene tabs: Code | Issues | Pull Requests | Actions. Todas son del mismo repo.

**Mal:** Tabs que parecen pestañas de navegador, persistentes, que el usuario puede cerrar. Es un patrón de IDE (VS Code, Cursor), no de SaaS. Confunde a usuarios no técnicos.

Reglas:
- Máximo 5 tabs. Más → usar dropdown.
- Si las tabs no son del mismo recurso, no son tabs: son navegación, va al sidebar.

### Buscador global

En productos con mucho contenido, un buscador global (`Cmd+K`) es esperado. Patrón estándar:

- Atajo de teclado universal (`Cmd+K` / `Ctrl+K`).
- Buscador unificado: usuarios, documentos, acciones, navegación.
- Resultados agrupados por tipo.

**Bien:** Linear, Notion, Slack, Figma, Vercel — todos tienen `Cmd+K` que busca de todo. Es el estándar de SaaS moderno.

---

## 5. Componentes interactivos

### Botones

La regla fundamental: **un botón debe parecer un botón**. Eso significa:

- Padding generoso (mínimo `h-10` / 40px de alto).
- Borde, fondo o sombra que lo separe del entorno.
- Texto en imperativo: "Crear proyecto", no "Crear un proyecto".
- Estado de hover visible.

**Jerarquía de variantes:**

| Variante | Uso | Cantidad por pantalla |
|---|---|---|
| Primary (sólido, color primario) | Acción principal de la pantalla | **Máximo 1** |
| Secondary (sólido suave o outline) | Acciones secundarias frecuentes | 2-3 |
| Tertiary / Ghost (sin fondo) | Acciones discretas, navegación, toggles | Sin límite |
| Destructive (rojo) | Eliminar, cancelar permanentemente | Solo cuando aplique |
| Link (texto subrayado) | Navegación contextual | Sin límite |

**Reglas:**

- **Solo un botón primario por pantalla.** Si hay dos, ninguno es primario.
- **Acciones destructivas siempre confirmadas** con un diálogo o modal.
- **Acciones asíncronas muestran loading inmediatamente**, no esperan respuesta.
- **Touch target mínimo: 44x44px** en mobile (estándar Apple HIG / Material).

**Bien:** Stripe Dashboard: en cada pantalla hay un único botón azul (el CTA primario). El resto son secundarios. Visualmente queda clarísimo qué hacer.

**Mal:** Pantallas con 5 botones del mismo color y tamaño, donde el usuario no sabe cuál es la acción esperada.

### Formularios

Los formularios son donde más se peca en SaaS. Reglas no negociables:

**Labels visibles encima del input.** Nunca usar placeholder como label. Cuando el usuario empieza a escribir, el placeholder desaparece y se pierde el contexto.

```
❌ MAL                          ✅ BIEN
┌─────────────────────┐         Nombre completo
│ Tu nombre completo  │         ┌─────────────────────┐
└─────────────────────┘         │ Tu nombre completo  │
                                └─────────────────────┘
```

**Validación al perder foco (`onBlur`), no en cada tecla.** Validar mientras escribe es agresivo y molesto. Validar al salir del campo es lo correcto. Excepciones: contadores de caracteres, validación de longitud máxima.

**Errores inline debajo del campo, en rojo, con icono.** Nunca en toast — el toast desaparece y el usuario no sabe qué corregir.

**Required fields marcados con asterisco en el label.** No con "(required)" en placeholder.

**Botón submit deshabilitado mientras el form esté incompleto o inválido.** Esto previene clicks frustrados y enseña al usuario que falta algo.

**Bien:** Stripe Checkout valida tarjetas al perder foco, muestra error inline con sugerencia clara ("La fecha de expiración debe ser futura"). El botón "Pagar" está deshabilitado hasta que todo esté correcto.

**Mal:** Forms que validan en cada tecla mostrando errores antes de terminar de escribir. Forms que aceptan submit con campos vacíos y luego muestran 7 errores en toasts simultáneos.

### Inputs y selects

- **Inputs claramente editables:** borde visible, fondo distinto del entorno, cursor de texto al hover.
- **Disabled state evidente:** opacidad reducida, cursor `not-allowed`, fondo más muted.
- **Selects para 4+ opciones, radio buttons para 2-4, toggle para booleanos.**
- **Comboboxes con búsqueda para listas > 10 opciones.**

### Tablas y listas

Las tablas son centrales en SaaS. Reglas:

- **Headers fijos al hacer scroll** si la tabla es larga.
- **Filas clickeables tienen hover visible** (`bg-muted/40`).
- **Acciones por fila al hover o en menú "...":** no llenar de botones cada fila.
- **Selección múltiple con checkboxes** en columna izquierda.
- **Ordenar por columna** con icono visible.
- **Paginación o virtualización** si > 50 filas.

**Bien:** Linear y Notion tienen tablas con filas que se expanden al hover mostrando acciones contextuales. Reduce ruido visual.

**Mal:** Tablas donde cada fila tiene 5 botones siempre visibles ("Editar", "Eliminar", "Duplicar", "Compartir", "..."). El ojo no encuentra los datos.

---

## 6. Feedback y estados del sistema

**Toda acción del usuario debe producir una respuesta visible en menos de 100 milisegundos.** Esto no significa que la operación deba completarse en 100ms — significa que **algo debe pasar visualmente** en ese tiempo, aunque sea un spinner o un cambio de estado.

### Los cuatro estados de toda vista que carga datos

Toda pantalla que muestre datos debe manejar **explícitamente** cuatro estados:

**1. Loading.** Mostrar skeleton loaders con la forma del contenido final. Nunca spinners en pantalla vacía si vas a mostrar una tabla; mejor el esqueleto de la tabla.

**2. Empty.** Cuando no hay datos, mostrar un mensaje contextual + CTA cuando aplique. Nunca dejar la pantalla en blanco o con un "0" pelado.

**3. Error.** Mensaje claro en lenguaje humano + botón "Reintentar" + opción de reportar o contactar soporte.

**4. Success (con datos).** El estado normal.

**Bien:** Notion muestra skeletons al cargar páginas, empty states ilustrados al crear una página nueva ("Esta página está vacía. Empieza escribiendo o usa /"), y errores con "Reintentar" cuando falla la sincronización.

**Mal:** Apps que muestran pantalla en blanco mientras cargan, o que tras un error dejan al usuario sin saber qué hacer.

### Toasts (notificaciones temporales)

Para feedback no crítico que no requiere acción:

| Tipo | Duración | Color | Uso |
|---|---|---|---|
| Success | 3s | Verde | Acción completada exitosamente |
| Info | 3s | Neutral / azul | Información secundaria (guardado automático) |
| Warning | 5s | Amarillo | Atención pero no error |
| Error | 5s o persistente | Rojo | Algo falló, con botón "Reintentar" |

**Reglas:**

- Posición consistente: bottom-right en desktop, top-center en mobile (no tapa el contenido).
- Máximo 3 toasts apilados; los siguientes esperan.
- Cerrables manualmente con X.
- Para errores críticos, **no usar toast**: usar banner o modal que no desaparezca.

### Skeleton loaders

Mejor que spinners porque comunican **qué va a aparecer**, no solo "espera".

```
❌ MAL                          ✅ BIEN
                                ┌──────────────────────┐
       ⟳                        │ ▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓     │
   Loading...                   │ ▓▓▓▓▓▓▓▓ ▓▓▓▓▓      │
                                │ ▓▓▓▓▓ ▓▓▓▓▓▓        │
                                └──────────────────────┘
```

Los skeletons reducen la **velocidad percibida** porque el usuario ya ve la estructura de la página.

### Optimistic UI

Para acciones frecuentes y reversibles, actualizar la UI **antes** de que el servidor responda. Si falla, revertir.

**Casos:**
- Marcar tarea como completada (checkbox).
- Toggle de favorito / estrella.
- Cambiar estado de un item.
- Reordenar listas con drag and drop.
- Aplicar filtros.

**Bien:** Linear, Todoist, Notion — todas las acciones se sienten instantáneas porque la UI cambia antes de que el servidor confirme.

**Mal:** Apps donde marcar una tarea como hecha implica esperar 800ms a que aparezca el check.

---

## 7. Prevención y manejo de errores

**Es mejor diseñar para que el error no ocurra que mostrarlo después.** Cada error que se previene es una fricción menos.

### Estrategias de prevención

**Validación inline en formularios.** Mostrar el error en el momento del campo, no al enviar.

**Botones deshabilitados cuando la acción no aplica.** Si no hay items seleccionados, el botón "Eliminar selección" está deshabilitado.

**Confirmaciones para acciones destructivas.** Pero solo para las realmente destructivas. Pedir confirmación para todo entrena al usuario a clickear "OK" sin leer.

**Defaults inteligentes.** Pre-rellenar campos con valores razonables. Stripe pre-selecciona el país basado en la IP. Las apps de email pre-seleccionan el remitente más usado.

**Constraints visuales.** Si un campo solo acepta números, el teclado en mobile debe ser numérico (`inputmode="numeric"`).

### Cuando el error ocurre

Mensajes de error deben cumplir:

- **Lenguaje humano**, no técnico. "No pudimos guardar tus cambios" en lugar de "Error 500".
- **Decir qué pasó.** "La conexión con el servidor se perdió."
- **Decir qué hacer.** "Intenta de nuevo en unos segundos."
- **Ofrecer una salida.** Botón "Reintentar", "Reportar problema", "Volver al inicio".

**Estructura recomendada:**

```
┌─────────────────────────────────────────┐
│ ⚠️  No pudimos crear el proyecto         │
│                                          │
│ El nombre "Marketing Q4" ya existe en   │
│ tu workspace. Elige otro nombre.        │
│                                          │
│ [ Reintentar ]  [ Cancelar ]            │
└─────────────────────────────────────────┘
```

**Bien:** Stripe en errores de pago indica exactamente qué falló y qué hacer. GitHub al fallar un push muestra el comando exacto para resolver el conflicto.

**Mal:** "Algo salió mal." Sin más. El usuario queda atrapado sin saber qué hacer.

### Confirmaciones destructivas

Para acciones que no se pueden deshacer fácilmente (eliminar cuenta, borrar proyecto, cancelar suscripción):

- Modal explícito, no toast.
- Pedir que el usuario **tipee** algo ("Escribe el nombre del proyecto para confirmar") para acciones muy destructivas.
- Mostrar consecuencias claras: "Esto eliminará 47 tareas y 12 documentos asociados."
- Botón de confirmación con texto explícito: "Sí, eliminar proyecto" — no solo "OK".

**Bien:** GitHub al eliminar un repo pide tipear el nombre completo. Stripe al cancelar suscripción muestra qué se pierde y ofrece alternativas (pausar, downgrade).

**Mal:** Botón "Eliminar" con confirmación de "¿Estás seguro? OK / Cancelar". Demasiado fácil de pasar.

---

## 8. Accesibilidad

**La accesibilidad no es un extra; es la base.** Diseñar accesible mejora la experiencia de todos, no solo de personas con discapacidad.

### Mínimos no negociables (WCAG AA)

**Contraste:**
- Texto normal: 4.5:1 mínimo contra el fondo.
- Texto grande (18px+ regular, o 14px+ bold): 3:1 mínimo.
- Elementos UI (bordes, iconos): 3:1 mínimo.

Herramientas para verificar: [Contrast Ratio](https://contrast-ratio.com/), axe DevTools, Lighthouse.

**Touch targets:** 44x44px mínimo en mobile (Apple), 48x48dp en Android (Material). En desktop, mínimo 32x32px.

**Focus visible:** todo elemento interactivo debe mostrar focus claramente al navegar con teclado. Nunca `outline: none` sin alternativa.

**Navegación por teclado:** la app debe ser usable 100% sin mouse. Tab, Shift+Tab, Enter, Esc, flechas, deben funcionar.

### ARIA (Accessible Rich Internet Applications)

ARIA permite que screen readers entiendan componentes complejos. Reglas:

- **Iconos sin texto:** `aria-label` obligatorio. `<button aria-label="Cerrar modal"><X /></button>`.
- **Estados dinámicos:** `aria-live="polite"` en notificaciones, `aria-busy="true"` durante loading.
- **Roles correctos:** `role="dialog"` en modales, `role="navigation"` en nav, etc.
- **Formularios:** `<label htmlFor>` o `aria-labelledby` en todo input.

### Color nunca es el único indicador

Aproximadamente el 8% de hombres y 0.5% de mujeres tienen alguna forma de daltonismo. Otros usuarios pueden estar en condiciones de baja visibilidad (sol, pantalla mala). Reglas:

- Estados (success, error, warning) siempre acompañados de **icono o texto**, no solo color.
- Gráficos: usar patrones, formas o etiquetas, no solo colores.
- Enlaces: subrayados o con peso distinto, no solo color azul.

**Bien:** Datadog y Grafana en sus gráficos usan patrones de línea distintos (sólida, punteada, dasheada) además de color. GitHub marca conflictos de merge con icono además de color.

**Mal:** Un dashboard donde "todo bien" es verde y "alerta" es rojo, sin más distinción. Un daltónico no distingue.

### Modales y diálogos

- **Trap focus:** el foco se queda dentro del modal hasta cerrarlo.
- **Cerrar con Esc.**
- **Click fuera cierra** (excepto modales críticos como confirmaciones destructivas).
- **Retornar foco** al elemento que abrió el modal al cerrarlo.

---

## 9. Performance percibida

La velocidad **sentida** importa más que la real. Una app que tarda 2 segundos en cargar pero muestra estructura inmediata se siente más rápida que una que tarda 800ms en pantalla blanca.

### Técnicas principales

**Skeleton loaders:** ya cubierto. La pantalla se llena instantáneamente con la estructura.

**Optimistic UI:** ya cubierto. La acción del usuario tiene efecto inmediato.

**Prefetching:** cargar datos antes de que el usuario los pida. Ejemplo: al hover sobre un link, empezar a cargar la siguiente página (Next.js, Linear).

**Lazy loading:** cargar lo que no se ve después. Imágenes fuera del viewport, sección de comentarios, contenido por debajo del fold.

**Transiciones cortas:** hover < 200ms, expand/collapse 200-300ms. Más largo se siente lento.

### Métricas a vigilar

- **First Contentful Paint (FCP):** < 1.8s.
- **Largest Contentful Paint (LCP):** < 2.5s.
- **Cumulative Layout Shift (CLS):** < 0.1.
- **First Input Delay (FID):** < 100ms.
- **Interaction to Next Paint (INP):** < 200ms.

Estas son las **Core Web Vitals** de Google. Herramientas: PageSpeed Insights, Lighthouse.

### Animaciones

Cada animación debe comunicar un cambio de estado, no decorar. Reglas:

- **Duración corta:** 150-300ms para la mayoría.
- **Easing apropiado:** `ease-out` para entradas (rápido al inicio, suave al final), `ease-in` para salidas.
- **Respetar `prefers-reduced-motion`:** algunos usuarios desactivan animaciones por mareo.
- **No animaciones gratuitas:** rotar un icono al hover sin razón distrae.

**Bien:** Linear anima la transición entre estados de un issue (200ms), comunicando el cambio. Stripe anima la confirmación de pago sutilmente.

**Mal:** Apps con animaciones de entrada de 600ms en cada elemento (parallax, fade-in masivo). Se siente lento aunque sea rápido.

---

## 10. Responsive y mobile

**Mobile-first** significa diseñar primero para la pantalla más restrictiva. Obliga a priorizar lo esencial.

### Breakpoints estándar (Tailwind como referencia)

| Breakpoint | Ancho | Dispositivo |
|---|---|---|
| (default) | < 640px | Mobile vertical |
| `sm` | 640px+ | Mobile landscape, tablets pequeñas |
| `md` | 768px+ | Tablets |
| `lg` | 1024px+ | Desktop pequeño, laptops |
| `xl` | 1280px+ | Desktop estándar |
| `2xl` | 1536px+ | Desktops grandes |

### Patrones de adaptación

**Sidebar → drawer.** En mobile, el sidebar se convierte en drawer (cajón lateral) que se abre con un botón hamburguesa. Al abrirse, overlay oscuro detrás.

**Tablas → cards.** Las tablas con muchas columnas no funcionan en mobile. Convertir cada fila en una card vertical con los datos clave.

```
DESKTOP                              MOBILE
┌────────────────────────────┐       ┌──────────────────┐
│ Name  │ Status │ Amount    │       │ Acme Corp        │
│ Acme  │ Active │ $1,200    │       │ Active · $1,200  │
│ Beta  │ Pending│ $850      │       └──────────────────┘
└────────────────────────────┘       ┌──────────────────┐
                                     │ Beta Inc         │
                                     │ Pending · $850   │
                                     └──────────────────┘
```

**KPI grids:** 1 columna mobile, 2 tablet, 3-4 desktop.

**Forms:** un campo por fila en mobile, dos columnas posibles en desktop si los campos están relacionados (city + zip code).

**Modales → full screen en mobile:** los modales que en desktop son centrados, en mobile ocupan toda la pantalla.

### Touch targets

Mínimo 44x44px, idealmente 48x48px. Separación entre elementos clickeables mínima de 8px para evitar clicks accidentales.

### Gestos

En mobile, considerar gestos nativos:
- **Swipe horizontal** para revelar acciones en listas (estilo iOS Mail).
- **Pull to refresh** para refrescar listas.
- **Swipe down to dismiss** para cerrar modales.

Pero **siempre con alternativa visible** — gestos invisibles son inaccesibles.

---

## 11. Consistencia y design tokens

La consistencia es el factor que más eleva la calidad percibida de un producto. Y el secreto de la consistencia son los **design tokens**.

### Qué son los design tokens

Son variables que centralizan decisiones de diseño: colores, espaciados, tipografía, sombras, radios, etc. En lugar de escribir `color: #2563eb` por todos lados, escribes `color: var(--color-primary)`.

**Ventajas:**
- Cambiar un valor afecta toda la app.
- Modo claro/oscuro fácil (solo cambian los valores de los tokens).
- Consistencia automática: si todos usan los mismos tokens, todo se ve coherente.

### Categorías típicas de tokens

**Colores:**
- Primarios y secundarios (marca).
- Semánticos: `success`, `warning`, `danger`, `info`.
- Neutros: `background`, `foreground`, `muted`, `border`.
- Cada uno con variante para modo oscuro.

**Espaciado:** escala consistente (`4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px`). Nunca valores arbitrarios como `13px` o `27px`.

**Tipografía:** familias, tamaños, pesos, alturas de línea.

**Radios:** `sm`, `md`, `lg`, `xl` con valores fijos.

**Sombras:** `shadow-card`, `shadow-elevated`, `shadow-modal` — no usar shadows arbitrarias.

### Componentes reutilizables

El siguiente nivel: encapsular patrones en componentes únicos.

**Mínimo recomendado para SaaS:**

- `<Button />` con todas las variantes.
- `<Input />`, `<Select />`, `<Textarea />`, `<Checkbox />`, `<Radio />`, `<Switch />`.
- `<Badge />` para estados semánticos.
- `<Card />` para contenedores.
- `<Dialog />` / `<Modal />`.
- `<Tooltip />` y `<Popover />`.
- `<Toast />` para notificaciones.
- `<Table />` o `<DataTable />`.
- `<Skeleton />` para loading.
- `<EmptyState />` para vistas vacías.
- `<PageHeader />` con título, descripción y acciones.

**Regla clave:** si un patrón se repite tres veces, debe ser un componente. Si no es componente, garantizas inconsistencia.

**Bien:** Vercel, Linear, Stripe — todas usan design systems con tokens y componentes. Cualquier pantalla nueva se construye en horas usando piezas existentes.

**Mal:** Apps donde cada pantalla tiene su propio CSS, sus propios colores ad-hoc, sus propios layouts. Inevitablemente divergen.

### Sistemas de componentes recomendados

Si empiezas desde cero, no reinventes la rueda. Sistemas probados:

- **shadcn/ui:** componentes copiables, basados en Radix UI + Tailwind. Estándar actual en React.
- **Radix UI:** primitivas accesibles sin estilos. Base de muchos design systems.
- **Mantine, Chakra UI, MUI:** sistemas completos con componentes pre-estilizados.
- **Tailwind UI, Headless UI:** componentes de Tailwind Labs.

---

## 12. Antipatrones comunes

Patrones que se repiten en muchas SaaS y deben evitarse. Si los encuentras en tu producto, hay deuda de UX.

### Navegación

❌ **Sidebar + tabs persistentes simultáneos.** Confusión de jerarquía.

❌ **Item activo del sidebar solo distinguido por color de texto.** Pasa desapercibido.

❌ **Tabs que cambian de posición entre pantallas.** Rompe el modelo mental.

❌ **Breadcrumbs ausentes en jerarquías profundas.** El usuario se pierde.

### Color y estética

❌ **Colores hardcoded en componentes** (`#FF5733`). Imposible cambiar de tema.

❌ **Estados representados solo por color.** Inaccesible.

❌ **Más de 2 colores de marca compitiendo.** Cacofonía visual.

❌ **Dark mode mal probado:** contrastes que solo funcionan en uno de los modos.

### Componentes

❌ **Tablas construidas con `<table>` raw** sin componente reutilizable. Inevitable divergencia.

❌ **Múltiples implementaciones de "card de KPI"** entre pantallas.

❌ **Botones con clases custom de color en lugar de variantes.** Rompe el sistema.

❌ **Headers de página inventados pantalla por pantalla.** Sin patrón claro.

### Estados

❌ **Placeholders tipo `███████` o `---`** como si fueran datos. Parece bug.

❌ **Pantallas en blanco mientras cargan.** Sin skeleton.

❌ **Empty states con solo "0" o "No hay datos".** Sin contexto ni CTA.

❌ **Acciones asíncronas sin loading state.** El usuario duda y clickea de nuevo.

❌ **Errores como toasts que desaparecen.** Sin posibilidad de releer.

### Formularios

❌ **Placeholders usados como labels.** Inaccesible y se pierden al escribir.

❌ **Validación agresiva en cada keystroke.**

❌ **Errores en toast en lugar de inline.**

❌ **Botones submit habilitados con form incompleto.**

❌ **Required fields sin indicar visualmente.**

### Accesibilidad

❌ **Botones con solo icono sin `aria-label`.**

❌ **Modales sin trap focus ni cierre con Esc.**

❌ **Contrastes por debajo de WCAG AA.**

❌ **Estados solo por color.**

❌ **`outline: none` sin alternativa de focus.**

### Densidad y respiración

❌ **Más de 4 KPI cards en una fila.** No se priorizan.

❌ **Tablas con más de 8 columnas visibles.** Imposible escanear.

❌ **Barras de filtros con todos los filtros abiertos.** Abrumador.

❌ **Sidebars con más de 7 ítems por grupo sin agrupación.** Difícil de escanear.

❌ **Espaciado arbitrario** (`mt-[13px]`, `p-[27px]`). Inconsistente.

### Acciones destructivas

❌ **Botón eliminar sin confirmación.**

❌ **Confirmaciones con solo "OK / Cancelar"** sin explicar consecuencias.

❌ **Acciones irreversibles sin posibilidad de deshacer ni "tipear para confirmar".**

---

## Apéndice: Productos de referencia

Productos a estudiar como ejemplo de buen UX en SaaS:

| Producto | Lo que hace excepcionalmente bien |
|---|---|
| **Linear** | Velocidad percibida, atajos de teclado, jerarquía visual |
| **Notion** | Empty states, onboarding, flexibilidad principiante/experto |
| **Stripe Dashboard** | Densidad de información, errores claros, formularios |
| **Vercel** | Dark mode, performance, deploy UI |
| **Figma** | Colaboración real-time, accesibilidad, gestión de complejidad |
| **Slack** | Notificaciones, búsqueda, modelo mental del producto |
| **Superhuman** | Velocidad, atajos, onboarding 1-on-1 |
| **Plausible** | Simplicidad de dashboards analíticos |
| **Raycast** | Command palette, extensibilidad, polish |
| **Height / Asana** | Vistas alternativas del mismo dato |

Recomendación práctica: cuando diseñes una pantalla, busca cómo Linear, Stripe o Notion resolvieron un problema similar. Casi siempre hay un patrón probado.

---

## Checklist final antes de marcar una pantalla como hecha

- [ ] Hay un único `<PageHeader />` con título, descripción y acción primaria.
- [ ] La pantalla responde las 3 preguntas en menos de 3 segundos: qué es, qué puedo hacer, dónde estoy.
- [ ] Hay un único CTA primario claramente identificable.
- [ ] Maneja los 4 estados explícitamente: loading, empty, error, success.
- [ ] Todos los colores vienen de tokens semánticos, no hardcoded.
- [ ] Funciona en modo claro y oscuro.
- [ ] Funciona en mobile (probar a 375px de ancho).
- [ ] Navegable solo con teclado.
- [ ] Contraste WCAG AA en todos los textos.
- [ ] Estados representados por color + icono o texto.
- [ ] Acciones asíncronas con loading state inmediato.
- [ ] Acciones destructivas con confirmación clara.
- [ ] Formularios con labels visibles, validación al blur, errores inline.
- [ ] Empty states con contexto y CTA cuando aplique.
- [ ] Sin placeholders tipo `███` ni datos vacíos sin explicación.
- [ ] Tipografía sigue la escala definida.
- [ ] Espaciado usa la escala de tokens, sin valores arbitrarios.
- [ ] Componentes reutilizables (no construir desde cero lo que ya existe).
- [ ] Animaciones cortas (< 300ms) y con propósito comunicativo.
- [ ] Microcopy en lenguaje humano, no técnico, en imperativo.

---

> **Reflexión final:** la mejor UX es la que el usuario no nota. Cuando una persona usa tu producto y simplemente logra lo que vino a hacer, sin preguntas, sin dudas, sin manual, sin ayuda — has ganado.