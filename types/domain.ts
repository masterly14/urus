/**
 * Tipos de dominio unificado (Item 3 Día 5).
 * Contrato canónico para Property, Demand, Lead, Event, Job, Match y StatefoxProperty.
 * Los DTOs de integración (Inmovilla, Statefox) se mapean a estos tipos.
 */

import type { EventRecord, AppendEventInput } from "@/lib/event-store/types";
import type { JobRecord, EnqueueJobInput } from "@/lib/job-queue/types";
import type { EventType, AggregateType, JobType, JobStatus } from "@prisma/client";
import type { StatefoxProperty as StatefoxPropertyIntegration } from "@/lib/statefox/types";

// --- Property (inmueble interno / Inmovilla) ---

export interface Property {
  codigo: string;
  ref: string;
  refCatastral?: string | null;
  titulo: string;
  tipoOfer: string;
  precio: number;
  metrosConstruidos: number;
  habitaciones: number;
  banyos: number;
  ciudad: string;
  zona: string;
  estado: string;
  nodisponible: boolean;
  prospecto: boolean;
  fechaAlta: string;
  fechaActualizacion: string;
  numFotos: number;
  agente: string;
  /** URL absoluta de la foto principal (thumbnail); `null` si no hay fotos. */
  mainPhotoUrl?: string | null;
  propietarioNombre?: string | null;
  propietarioDni?: string | null;
  propietarioPhone?: string | null;
  propietarioDomicilioFiscal?: string | null;
  propietarioRegisteredAt?: string | null;
  raw?: Record<string, unknown>;
}

// --- Demand (demanda de comprador) ---

export interface Demand {
  codigo: string;
  ref: string;
  nombre: string;
  estadoId: string;
  estadoNombre: string;
  presupuestoMin: number;
  presupuestoMax: number;
  habitacionesMin: number;
  tipos: string;
  zonas: string;
  fechaActualizacion: string;
  agente: string;
  /** Iniciales del comercial en Inmovilla (campo `siglas`, ej. "MA"). Equivale a Comercial.inmovillaRefCode. */
  siglas?: string;
  /** ID numérico del agente/comercial en Inmovilla (campo `keyagente`). Equivale a Comercial.inmovillaAgentId. */
  inmovillaAgentId?: number;
  /**
   * Ref del inmueble en "Consultada" (cruce), p. ej. URUS103VMA desde "Ref. URUS103VMA".
   * Se usa para resolver comercial por inmovillaRefCode como en propiedades.
   */
  refConsultada?: string;
  telefono?: string;
  raw?: Record<string, unknown>;
}

// --- Lead (contacto comercial / estado comercial) ---

export interface Lead {
  id: string;
  source?: string;
  nombre?: string;
  email?: string;
  telefono?: string;
  estado?: string;
  aggregateId?: string;
  raw?: Record<string, unknown>;
}

// --- Match (relación demanda–propiedad, scoring) ---

export interface Match {
  id?: string;
  demandId: string;
  propertyId?: string;
  score?: number;
  estado?: string;
  aggregateId?: string;
  raw?: Record<string, unknown>;
}

// --- Event (alineado con event-store) ---

export type Event = EventRecord;
export type AppendEventInputDomain = AppendEventInput;
export type { EventType, AggregateType };

// --- Job (alineado con job-queue) ---

export type Job = JobRecord;
export type { EnqueueJobInput, JobType, JobStatus };

// --- StatefoxProperty (propiedad de mercado, re-export desde integración) ---

export type StatefoxProperty = StatefoxPropertyIntegration;
