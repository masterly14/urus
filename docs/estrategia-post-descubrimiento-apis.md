# Estrategia post-descubrimiento de APIs REST

> **Contexto:** En el Día 4 se confirmó que Inmovilla y Statefox exponen APIs REST. Este documento recoge las recomendaciones para incorporar ese descubrimiento sin reescribir el historial de los días 1–3.

---

## 1. No retroceder a ramas de días anteriores

**No** se recomienda volver a las ramas del Día 1, 2 o 3 para rehacer commits “como si siempre hubiéramos tenido las APIs”.

### Motivos

- **Lo ya implementado sigue siendo válido:** Event Store, Job Queue, Egestion vía RPA para demandas, Ingestion legacy para demandas, login 2FA con Composio, etc. La API REST no cubre demandas; solo cambia *cómo* se leen/escriben clientes y propiedades.
- **Reescribir historia tiene coste:** Si ya hay PRs mergeados a `develop` o alguien tiene ramas basadas en eso, volver atrás implica `reset`/`rebase`/`force push` y complica a todo el equipo. El historial “primero RPA, luego descubrimos REST” documenta el descubrimiento.
- **Lo que falta es mayormente aditivo:** No hay que borrar trabajo anterior; hay que **añadir** clientes REST, uso de REST en Ingestion/Egestion donde aplique, y el módulo `lib/geo` para polígonos. Eso se hace en ramas nuevas desde el estado actual de `develop`.

---

## 2. Qué hacer desde el Día 4 (recomendación práctica)

Seguir hacia adelante desde el estado actual de `develop` e incorporar el descubrimiento en **ramas nuevas**:

### Ramas sugeridas (crear desde `develop`)

| Rama | Contenido |
|------|-----------|
| `feat/M1-inmovilla-rest-client` | Cliente REST Inmovilla (token, `GET /propiedades/?listado`, `GET /propiedades/?cod_ofer`, clientes, enums). Que Ingestion use REST para propiedades en lugar de (o además de) polling legacy. |
| `feat/M2-egestion-rest` | En Egestion: usar REST para crear/actualizar clientes y propiedades; dejar RPA legacy solo para demandas y estados. |
| `feat/lib-geo` | Módulo `lib/geo/` para generar polígonos (p. ej. por `key_zona` o geocoding) y usarlo al crear demandas vía Egestion. |
| `feat/M6-statefox-rest-client` | Cliente REST Statefox (`GET /properties`, `GET /snapshot`). Añadir cuando toque microsite o motor de pricing (Semana 2). |

### Orden de prioridad

1. **Primero:** Cliente REST Inmovilla + que Ingestion use REST para propiedades (así el Día 4 y el pipeline de eventos se apoyan en datos correctos).
2. **Segundo:** `lib/geo` y que Egestion use polígonos al crear demandas (demandas sin polígono son inútiles para cruce).
3. **Tercero:** Egestion dual (REST para clientes/propiedades, legacy para demandas).
4. **Cuarto:** Cliente Statefox REST cuando se aborde microsite o motor de pricing.

### Documentar el descubrimiento

En el **Daily Log** del Día 4 (o en un comentario en el plan):

> Día 4: descubrimiento de APIs REST Inmovilla y Statefox. Se incorpora en ramas `feat/*-rest` y `feat/lib-geo` sin retroceder días 1–3; el plan y el README ya están actualizados.

---

## 3. Resumen

- **No** volver atrás a ramas de días 1–3 ni rehacer esos commits.
- **Sí** seguir desde el Día 4 con `develop` tal como está.
- **Sí** añadir la lógica nueva (REST + geo) en **ramas nuevas** desde `develop`, con PRs por tema.
- **Sí** dejar escrito en Daily Log / plan que el descubrimiento de endpoints se incorpora así, sin reescribir historia.

Con esto se mantiene un historial estable, no se invalida trabajo ya mergeado y el código queda alineado con el plan actual en los próximos días.
