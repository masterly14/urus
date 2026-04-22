# UI/UX System Blueprint: Directrices Generales de Diseño

## 1. Filosofía Global del Diseño
- **Estilo:** B2B SaaS de Alta Densidad (Enterprise).
- **Tema Base:** Claro (Light Theme).
- **Objetivo Visual:** Minimizar la fatiga visual en sesiones largas, maximizar la densidad de datos sin perder legibilidad, y establecer jerarquías claras a través del contraste tipográfico y el espaciado, no a través de colores estridentes.

## 2. Layout y Esqueleto Principal (App Shell)
Toda vista de la aplicación debe inyectarse en el siguiente contenedor estructural:
- **Navegación Lateral (Sidebar):** - Fija a la izquierda. Fondo blanco o gris ultra-claro.
  - Agrupación semántica (ej. "Navegación", "Procesos", "Herramientas").
  - Soporte para micro-etiquetas (Badges) a la derecha del ítem de menú (ej. "PRO", "IA") para denotar capacidades especiales.
- **Cabecera (Header) Global:**
  - Estructura de dos niveles o nivel único con alta densidad.
  - **Obligatorio:** Implementación de interfaz por Pestañas (Tabbed Workspace) para simular un navegador interno. Las vistas se abren como pestañas (ej. "Inicio", "Procesos") permitiendo multitarea.
  - Controles globales a la derecha: Búsqueda, Acciones rápidas ("+ Nuevo"), Accesos a Marketplace/Ajustes, y Perfil de Usuario.
- **Área de Contenido (Main Content):**
  - Fondo: Gris muy claro (ej. `#f4f5f7` o similar) para que las tarjetas blancas resalten.
  - Padding: Consistente en todo el contenedor (ej. 24px o 32px), excepto en vistas de datos de borde a borde (full-bleed).

## 3. Tokens de Diseño (Design Tokens)

### 3.1. Paleta de Colores
- **Fondos (Backgrounds):**
  - App Shell: Gris ultra-tenue.
  - Componentes/Contenedores: Blanco puro (`#ffffff`).
- **Texto (Typography):**
  - Primario (Títulos, Valores KPI, Nombres): Negro suave / Gris muy oscuro.
  - Secundario (Etiquetas, Metadatos, Subtítulos): Gris medio (contraste accesible pero claramente diferenciado del primario).
- **Acentos y Semántica:**
  - Interactivo/Primario: Azul oscuro o el color de marca definido.
  - Éxito/Positivo: Verde vibrante (usado en tendencias +, badges de completado).
  - Alerta/Advertencia: Naranja/Ámbar.
  - Peligro/Negativo: Rojo moderado (usado en tendencias -).
  - *Regla de Acentos:* Los colores semánticos en fondos deben usar una opacidad del 10-15% con el texto en el color sólido al 100% (ej. Fondo verde claro, texto verde oscuro).

### 3.2. Espaciado y Estructura (Spacing & Sizing)
- **Densidad:** Compacta. El sistema prioriza mostrar más información en pantalla.
- **Gaps (Espacios entre elementos):** Usar escalas consistentes (4px, 8px, 12px, 16px, 24px).
- **Bordes (Borders):** 1px sólido, color gris muy sutil. Usar para separar secciones lógicas dentro de un mismo contenedor.
- **Radios de Borde (Border Radius):** Suaves y modernos (ej. 8px a 12px para tarjetas, 6px para botones e inputs, 9999px para badges/píldoras).
- **Sombras (Shadows):** Extremadamente sutiles. Solo para dar un ligero despegue del fondo gris o para modales/popovers (elevación z-index).

## 4. Arquetipos de Componentes (Reglas de Construcción)

### 4.1. Tarjetas (Cards)
Cualquier bloque de información aislada (KPIs, listas, formularios) debe ir dentro de una Tarjeta.
- **Estructura base:** Fondo blanco, borde fino sutil, padding interno consistente (ej. 16px o 20px).
- **Cabecera de Tarjeta:** Opcional. Título en negrita, tamaño moderado, acompañado opcionalmente de un botón de acción secundario a la derecha.

### 4.2. Tablas y Listas de Datos
- **Filas:** Altura reducida. Sin padding excesivo.
- **Separadores:** Borde inferior sutil entre filas.
- **Alineación:** Datos numéricos e importes siempre alineados a la derecha. Texto descriptivo a la izquierda.
- **Estados vacíos:** Texto secundario centrado con iconografía sutil.

### 4.3. Badges (Insignias) y Etiquetas
- Uso intensivo para micro-estados.
- Variantes:
  - *Estado:* Verde (Activo/Éxito), Amarillo (Pendiente), Rojo (Error/Vencido).
  - *Entidad/Origen:* Píldoras pequeñas para indicar el origen de una acción (ej. un badge de "IA" en color morado o azul claro para acciones generadas automáticamente).

### 4.4. Tipografía y Jerarquía
- **Valores Principales (KPIs, Totales):** Fuente grande (ej. 24px-32px), peso Bold o Semi-Bold.
- **Títulos de Sección:** Peso Medium/Semi-Bold.
- **Datos Auxiliares:** Tamaño pequeño (ej. 12px-13px), color secundario.
- **Micro-copy:** Usar en descripciones bajo inputs o estados.

## 5. Reglas de Interacción e IA
- **Identificación de IA:** Cualquier componente, lista, sugerencia o tarea que sea orquestada o generada por agentes de IA debe llevar un indicativo visual claro (Badge "IA", ícono distintivo).
- **Feedback Visual:** Hover states en filas de tablas, botones e ítems clickeables deben tener un cambio de fondo sutil (gris muy claro).
- **Modales/Drawers:** Para procesos complejos de creación (ej. "+ Nuevo"), priorizar paneles deslizantes laterales (Drawers) o modales expansivos para no sacar al usuario de su contexto actual ni cerrar las pestañas activas.

## 6. Instrucción Estricta para Refactorización
Al generar código para nuevas vistas, el agente DEBE:
1. Envolver el contenido en un layout de Grid o Flexbox estructurado.
2. Usar tarjetas (`Card` base) para agrupar información.
3. No dejar datos flotando sobre el fondo principal del App Shell.
4. Aplicar el patrón de contraste tipográfico: Primario (Bold/Oscuro) vs Secundario (Regular/Claro).