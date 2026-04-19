# Suite de Evaluación de Calidad IA

> Sistema automatizado que mide la calidad del agente de comprensión de lenguaje natural sin depender de pruebas manuales, usando un patrón AI-to-AI: un agente simula al comprador, el sistema real procesa, y un juez evalúa.

---

## Qué problema resuelve

El agente que interpreta mensajes de compradores es el corazón del sistema. Si malinterpreta "no me cuadra, es caro" como "me interesa", todo el flujo se rompe. Pero probar manualmente cada caso es lento, sesgado, y no escala. Cada cambio en el agente podría romper algo que antes funcionaba.

Esta suite **automatiza la evaluación de calidad**: ejecuta decenas de escenarios, mide 6 dimensiones de precisión, detecta regresiones, y genera un dashboard con scores.

---

## Qué aporta

| Sin suite | Con suite |
|---|---|
| "Parece que funciona bien" | Score numérico por dimensión (0-1) |
| Se rompe algo y nadie se entera | Regresión detectada automáticamente |
| Pruebas manuales sesgadas | Escenarios reproducibles y deterministas |
| Sin baseline de calidad | Histórico de scores por versión del agente |
| Cambiar un prompt da miedo | Cambiar un prompt y medir el impacto en minutos |

---

## Cómo funciona

### El patrón AI-to-AI

```
Escenario (caso de prueba con expectativas)
    ↓
Agente Comprador Sintético (LLM que simula al comprador)
    → Genera un mensaje "realista" dado el escenario y una persona
    ↓
Agente NLU Real (el sistema bajo test)
    → Procesa el mensaje como si fuera un comprador real
    ↓
Juez (LLM que evalúa la salida)
    → Compara la salida del NLU con las expectativas del escenario
    → Genera scores por dimensión
    ↓
Persistencia (base de datos)
    → Scores, latencia, fallos, razonamiento del juez
    ↓
Dashboard (/eval)
    → Visualización de resultados por categoría, persona, y dimensión
```

### Escenarios

Cada escenario define:
- Una situación (ej. "comprador dice que le gusta la primera propiedad pero la segunda es cara")
- Una persona sintética (ej. "María, 35 años, busca primera vivienda, presupuesto ajustado")
- Propiedades de contexto (las que se mostraron al comprador)
- Expectativas (qué debería producir el NLU)

**6 categorías de escenarios:**

| Categoría | Qué evalúa | Ejemplo |
|---|---|---|
| **Resolución de propiedad** | ¿Identifica a qué propiedad se refiere? | "La del centro" → Propiedad A |
| **Precisión de sentimiento** | ¿ME_INTERESA o NO_ME_ENCAJA correcto? | "Me encanta" → ME_INTERESA |
| **Extracción de variables** | ¿Extrae precio, zona, metros, extras? | "Menos de 280k con terraza" → precioMax=280k, extras=[terraza] |
| **Quiere más opciones** | ¿Detecta "quiero ver más"? | "¿Tenéis algo más?" → wantsMore=true |
| **Ambigüedad** | ¿Maneja referencias vagas? | "Esa que está bien" sin contexto claro |
| **Multi-turno** | ¿Coherencia en conversación larga? | Tercer mensaje que refina lo dicho antes |

### Personas sintéticas

7 perfiles de comprador con personalidades distintas:
- Directo y decidido
- Indeciso y vago
- Técnico y detallista
- Emocional
- Inversor analítico
- Primer comprador nervioso
- Comprador experimentado exigente

Cada persona genera mensajes con estilo diferente para el mismo escenario, probando la robustez del NLU.

### Dimensiones de evaluación

El juez puntúa cada resultado en 6 dimensiones (0 a 1):

| Dimensión | Qué mide |
|---|---|
| Resolución de propiedad | ¿Identificó la propiedad correcta? |
| Precisión de sentimiento | ¿Clasificó bien interesa/no interesa? |
| Extracción de variables | ¿Extrajo las variables esperadas? |
| Intención general | ¿Entendió la intención del mensaje? |
| Detección de "quiero más" | ¿Detectó correctamente si quiere más opciones? |
| Penalización por alucinación | ¿Fabricó datos que no estaban en el mensaje? |

El **score global** es un promedio ponderado de las 6 dimensiones.

### Ejecución

```bash
npm run eval:nlu
```

Ejecuta todos los escenarios (o filtrados por categoría/persona), persiste resultados, y muestra resumen:

```
Categoría              | Score medio | Escenarios
-----------------------|-------------|----------
property-resolution    | 0.92        | 12
sentiment-accuracy     | 0.88        | 10
variable-extraction    | 0.85        | 8
wants-more             | 0.95        | 6
ambiguity              | 0.78        | 8
multi-turn             | 0.82        | 6
-----------------------|-------------|----------
TOTAL                  | 0.87        | 50
```

### Dashboard visual

Panel interno (`/eval`) con:
- Lista de ejecuciones con score promedio y estado
- Detalle por escenario: scores, latencia, fallos, razonamiento del juez
- Gráfico de barras por categoría
- KPIs: score medio, latencia media, tokens consumidos

---

## Cuándo se usa

- **Antes de cada cambio en el agente NLU:** ejecutar la suite, comparar scores con la versión anterior
- **Periódicamente:** detectar degradación por cambios en el modelo LLM subyacente
- **Al añadir nuevos escenarios:** cubrir edge cases descubiertos en producción

---

## Tecnología

- **Agente comprador:** LLM que genera mensajes sintéticos
- **NLU bajo test:** El mismo grafo LangGraph que se usa en producción
- **Juez:** LLM con structured output que genera scores y razonamiento
- **Persistencia:** Tablas dedicadas (EvalRun, EvalResult) con scores por dimensión
- **UI:** Panel con tabla de resultados, KPIs, y gráficos por categoría
