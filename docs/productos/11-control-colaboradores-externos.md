# Sistema de Control de Colaboradores Externos

> Sistema de gobierno del ecosistema externo (bancos, abogados, tasadores, arquitectos) que mide rendimiento, detecta cuellos de botella, y genera recomendaciones para optimizar las relaciones.

---

## Qué problema resuelve

"Está en el banco." "Lo ve el abogado." Esas frases esconden semanas de retraso invisible. Nadie mide cuánto tarda cada colaborador, cuántas operaciones bloquea, ni cuánto dinero cuesta esa lentitud. Las decisiones de con quién trabajar se toman por afinidad personal, no por impacto económico.

Este sistema **hace medible y gobernable** todo lo que pasa fuera de la agencia.

---

## Qué aporta

| Sin sistema | Con sistema |
|---|---|
| "Este banco es lento, pero bueno..." | Datos: tarda 30% más que la alternativa |
| Retrasos invisibles | Cada hito tiene SLA y alerta automática |
| Decisiones por confianza personal | Decisiones por impacto económico |
| Sin comparativa | Ranking de colaboradores por rendimiento |
| Excusas toleradas | Tiempos controlados, acciones objetivas |

---

## Cómo funciona

### Registro de colaboradores

Cada colaborador externo se registra con:
- Tipo (banco, abogado, tasador, arquitecto, inversor, proveedor)
- Ciudad y especialidad
- Contacto
- SLAs esperados por tipo de hito

### Asignación a operaciones

Cuando una operación necesita un colaborador:
1. Se asigna desde el panel interno (el comercial o el CEO)
2. Se crean automáticamente los hitos estándar para ese tipo de colaborador
3. Cada hito tiene un SLA (días máximos)

**Ejemplo — Banco:**
```
Hito 1: Documentación enviada (SLA: 2 días)
Hito 2: Estudio iniciado (SLA: 5 días)
Hito 3: Preaprobación (SLA: 10 días)
Hito 4: Aprobación final (SLA: 15 días)
```

**Ejemplo — Abogado:**
```
Hito 1: Revisión contrato (SLA: 3 días)
Hito 2: Observaciones (SLA: 5 días)
Hito 3: Validación final (SLA: 2 días)
```

### Tracking de progreso

El comercial avanza los hitos desde el panel (vista kanban):
- Marca inicio y finalización de cada hito
- Sube documentos asociados
- Añade notas

El sistema calcula automáticamente:
- Tiempo de respuesta
- Tiempo hasta resolución
- Cumplimiento de SLA
- Retrasos acumulados

### Alertas por SLA

Un scanner periódico revisa todos los hitos activos:
- Si un hito supera su SLA → alerta al jefe de zona
- Si un colaborador genera incidencias repetidas → alerta al CEO
- Si un tasador retrasa 2 operaciones seguidas → revisión de proveedor

### Clasificación automática

Cada colaborador se clasifica en base a datos:

| Clasificación | Criterio |
|---|---|
| **A — Partner estratégico** | Rápido, fiable, alto impacto positivo |
| **B — Funcional** | Cumple, no destaca, no bloquea |
| **C — Lento/Crítico** | Genera retrasos, bloquea operaciones, daña conversión |

### Recomendaciones IA

El sistema genera recomendaciones para el CEO:
- **Partners A:** concentrar operaciones, negociar mejores condiciones
- **Funcionales B:** mantener como alternativa
- **Críticos C:** reducir asignaciones, buscar sustituto, cortar si persiste

### Dashboard

| Vista | Contenido |
|---|---|
| **CEO** | Ranking por impacto en facturación, coste de oportunidad por retrasos, dependencias excesivas |
| **Jefe de zona** | Qué colaborador bloquea operaciones, alertas por retrasos |
| **Comercial** | Estado de cada colaboración, qué está pendiente y de quién |

---

## Gestión interna

Los colaboradores externos **no acceden al sistema**. Toda la gestión la realiza el equipo interno:
- El comercial registra avances, sube documentos, avanza hitos
- El CEO revisa ranking y toma decisiones
- Las comunicaciones con el colaborador son externas al sistema

---

## Tecnología

- **Modelo de datos:** Colaborador → Asignación → Hitos → Documentos (todo en base de datos propia)
- **SLA:** Configuración por colaborador y tipo de hito
- **Clasificación:** Reglas con umbrales configurables
- **Recomendaciones:** LangGraph con structured output
- **Documentos:** Cloudinary para almacenamiento
- **UI:** Listado, detalle con kanban de hitos, dashboard/ranking
