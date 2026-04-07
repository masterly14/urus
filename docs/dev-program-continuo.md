# M12 — Programas de Desarrollo Continuo

> **Estado:** implementado (cadencia automática + generación por IA + tracking).
> **Branch:** `feat/M10-dashboard-comercial`.
> **Sprint:** 3, Semana 5, Día 26.

---

## Qué es

Un sistema proactivo que envía diariamente micro-ejercicios y retos semanales a los comerciales por WhatsApp. El contenido se genera con IA (LLM) personalizado según el contexto CRM de cada comercial. Los 4 ejes temáticos rotan cada semana en un ciclo de 4 semanas.

Complementa al Bot de Soporte Mental (reactivo, `/coach`) con una cadencia automática que el comercial recibe sin pedirla.

## Arquitectura

### Flujo completo

1. **Cron diario** (L-V ~8:30) escanea comerciales activos y encola un `SEND_DEV_EXERCISE_NUDGE` por cada uno.
2. **Job handler** crea un `DevProgramExercise` y envía un template Meta "nudge" invitando al comercial a escribir `/coach ejercicio`.
3. **El comercial** escribe `/coach ejercicio` → el router intercepta, genera el ejercicio con LLM personalizado (tema + CRM), y lo envía como texto libre (dentro de ventana 24h).
4. **El comercial** escribe "hecho" → se marca como completado.

### Rotación temática (ciclo de 4 semanas)

| Semana | Tema | Objetivo |
|--------|------|----------|
| 1 | Mentalidad Alto Ticket | Superar barrera psicológica con precios altos |
| 2 | Gestión del Rechazo | Reencuadrar el "no", resiliencia operativa |
| 3 | Identidad Closer | Autoconcepto como cerrador, rituales, hábitos |
| 4 | Disciplina Emocional | Regulación, consistencia en días malos |

El tema se calcula como `DEV_THEMES[weekNumber % 4]`, donde `weekNumber` parte de una fecha de referencia configurable.

## Archivos principales

| Archivo | Función |
|---------|---------|
| `lib/dev-program/types.ts` | Temas, constantes de rotación, interfaces |
| `lib/dev-program/schedule.ts` | Lógica del cron: listar comerciales, calcular tema/semana, encolar nudges |
| `lib/dev-program/send-nudge-handler.ts` | Job handler: crea `DevProgramExercise` y envía template Meta |
| `lib/dev-program/generate-exercise.ts` | Generación LLM: prompt por tema + contexto CRM → ejercicio personalizado |
| `lib/dev-program/exercise-router.ts` | Routing WhatsApp: `/coach ejercicio` y "hecho" |
| `app/api/cron/dev-program/route.ts` | Cron endpoint (POST, autenticado) |
| `lib/whatsapp/send.ts` | Función `sendDevExerciseNudge` (template Meta) |
| `lib/agents/llm.ts` | Instancia `llmDevExercise` (gpt-5.4-mini, temp=0.8) |

## Modelo de datos

### DevProgramExercise (Prisma)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| comercialId | String | ID del comercial |
| waId | String | Teléfono WhatsApp |
| type | DevExerciseType | DAILY o WEEKLY_CHALLENGE |
| theme | String | ID del tema (alto_ticket, gestion_rechazo, etc.) |
| weekNumber | Int | Número de semana desde fecha de referencia |
| dayOfWeek | Int? | 1-5 para DAILY, null para WEEKLY_CHALLENGE |
| exerciseContent | String? | Contenido generado por LLM (se llena al entregar) |
| status | DevExerciseStatus | NUDGE_SENT → DELIVERED → COMPLETED / SKIPPED |
| nudgeSentAt | DateTime? | Cuándo se envió el nudge |
| deliveredAt | DateTime? | Cuándo se entregó el ejercicio |
| completedAt | DateTime? | Cuándo el comercial confirmó completado |

### Job types

| JobType | Descripción |
|---------|-------------|
| `SEND_DEV_EXERCISE_NUDGE` | Envía template Meta "nudge" a un comercial |

## Cómo interactúa el comercial

1. Recibe un WhatsApp (template) por la mañana: "Tu micro-ejercicio está listo. Escribe `/coach ejercicio` para recibirlo."
2. Escribe `/coach ejercicio` → recibe el ejercicio personalizado.
3. Escribe "hecho", "listo" o "completado" → queda registrado.

Si escribe `/coach` sin "ejercicio", entra al Bot de Soporte Mental como siempre.

## Endpoints

### POST `/api/cron/dev-program`

Cron que programa los ejercicios del día. Debe ejecutarse L-V a las ~8:30 vía QStash.

- **Auth:** misma autenticación que el resto de cron endpoints (ver `lib/api/cron-auth.ts`)
- **Response:** `{ comercialesScanned, nudgesEnqueued, skipped }`

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `WHATSAPP_TEMPLATE_DEV_EXERCISE` | Nombre de la plantilla Meta para el nudge | `dev_ejercicio_diario` |
| `DEV_PROGRAM_REFERENCE_DATE` | Fecha de referencia para el ciclo de rotación | `2026-04-06` |

## Tests

```bash
npx vitest run lib/dev-program/__tests__/schedule.test.ts
npx vitest run lib/dev-program/__tests__/exercise-router.test.ts
```

- 25 tests de schedule: rotación temática, cálculo de semana/día, workday, lunes, scheduling con mocks
- 21 tests de exercise-router: detección de comandos, entrega de ejercicio, completado, routing

## Prompt Engineering

Los ejercicios se generan con un prompt que:

- **Persona:** colega veterano que lleva 10 años vendiendo pisos en España
- **Idioma:** español de España natural, directo, sin florituras
- **Anti-patrones:** emojis, exclamaciones motivacionales, listas largas, frases de autoayuda
- **Contexto inmobiliario:** precios, compradores, objeciones, visitas, cierres
- **Personalización CRM:** nombre, ciudad, racha, operaciones perdidas, cierres pendientes
- **Variación:** temperatura 0.8, instrucciones para no repetir entre días
- **Brevedad:** máximo 300 palabras (cabe en un mensaje de WhatsApp)
