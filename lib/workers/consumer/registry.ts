/**
 * Registry puro de handlers del consumer.
 *
 * Este módulo NO importa handlers concretos — solo expone las estructuras
 * de datos y funciones de registro/lectura. Así, archivos que solo necesitan
 * `getJobHandler` / `getHandler` (p. ej. `consumer.ts`) pueden importarlos
 * sin arrastrar transitivamente toda la cadena de handlers (LLMs, agentes,
 * integraciones externas).
 *
 * Los archivos `handlers.ts` y `job-handlers.ts` siguen siendo los puntos
 * donde se registran realmente los handlers (vía side effects al importarlos
 * desde un entry point). Quienes solo procesan un subconjunto de jobs
 * (p. ej. `consumer:market`) deben importar únicamente su archivo dedicado
 * (`market-job-handlers.ts`) en lugar del bundle completo.
 */
import type { EventType, JobType } from "@prisma/client";
import type { JobRecord } from "@/lib/job-queue/types";
import type { EventHandler, HandlerResult } from "./types";

export type JobHandler = (job: JobRecord) => Promise<HandlerResult>;

const jobRegistry = new Map<JobType, JobHandler>();
const eventRegistry = new Map<EventType, EventHandler>();

export function registerJobHandler(type: JobType, handler: JobHandler): void {
  jobRegistry.set(type, handler);
}

export function getJobHandler(type: JobType): JobHandler | undefined {
  return jobRegistry.get(type);
}

export function registerHandler(type: EventType, handler: EventHandler): void {
  eventRegistry.set(type, handler);
}

export function getHandler(type: EventType): EventHandler | undefined {
  return eventRegistry.get(type);
}

export function getRegisteredTypes(): EventType[] {
  return [...eventRegistry.keys()];
}
