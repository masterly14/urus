import type { EventType } from "@/app/generated/prisma/client";
import type { NotificationSource, NotificationSeverity } from "@/lib/mock-data/types";

export type NotificationChannel = "org" | "management" | "user";

export interface NotificationConfig {
  source: NotificationSource;
  severity: NotificationSeverity;
  channels: NotificationChannel[];
  title: (payload: Record<string, unknown>) => string;
  description: (payload: Record<string, unknown>) => string;
}

function str(val: unknown, fallback = ""): string {
  return typeof val === "string" && val.length > 0 ? val : fallback;
}

function num(val: unknown, fallback = 0): number {
  return typeof val === "number" ? val : fallback;
}

export const NOTIFICATION_MAP: Partial<Record<EventType, NotificationConfig>> = {
  MATCH_GENERADO: {
    source: "matching",
    severity: "info",
    channels: ["org", "user"],
    title: (p) => `Nuevo Match (${Math.round(num(p.totalScore))}%)`,
    description: (p) =>
      `Propiedad ${str(p.propertyRef || p.propertyId, "?")} ↔ Demanda ${str(p.demandNombre || p.demandRef || p.demandId, "?")}`,
  },

  PROPIEDAD_CREADA: {
    source: "matching",
    severity: "info",
    channels: ["org"],
    title: () => "Nueva propiedad ingresada",
    description: (p) => str(p.titulo, `Código ${str(p.codigo, "?")}`),
  },

  LEAD_INGESTADO: {
    source: "matching",
    severity: "info",
    channels: ["user"],
    title: () => "Nuevo lead asignado",
    description: (p) =>
      `Lead ${str(p.aggregateId, "?")} — score ${num(p.score)}`,
  },

  WHATSAPP_RECIBIDO: {
    source: "matching",
    severity: "info",
    channels: ["user"],
    title: () => "Mensaje WhatsApp recibido",
    description: (p) => `De ${str(p.from, "desconocido")}`,
  },

  SELECCION_COMPRADOR: {
    source: "matching",
    severity: "info",
    channels: ["user"],
    title: () => "Comprador seleccionó propiedad",
    description: (p) =>
      str(p.propertyRef, `Propiedad ${str(p.propertyCode, "?")}`),
  },

  VISITA_AGENDADA: {
    source: "matching",
    severity: "info",
    channels: ["user"],
    title: () => "Visita agendada",
    description: (p) =>
      `Propiedad ${str(p.propertyRef || p.propertyCode, "?")}`,
  },

  VISITA_COMPRADOR_ACEPTO: {
    source: "matching",
    severity: "info",
    channels: ["user"],
    title: () => "Comprador aceptó visita",
    description: (p) =>
      `Propiedad ${str(p.propertyRef || p.propertyCode, "?")}`,
  },

  VISITA_COMPRADOR_RECHAZO: {
    source: "matching",
    severity: "warning",
    channels: ["user"],
    title: () => "Comprador rechazó visita",
    description: (p) =>
      `Propiedad ${str(p.propertyRef || p.propertyCode, "?")}`,
  },

  VISITA_ESCALADA_MANUAL: {
    source: "matching",
    severity: "warning",
    channels: ["management"],
    title: () => "Visita escalada a asignación manual",
    description: (p) =>
      `Propiedad ${str(p.propertyRef || p.propertyCode, "?")} — se agotaron las rondas de negociación`,
  },

  CONTRATO_BORRADOR_GENERADO: {
    source: "legal",
    severity: "info",
    channels: ["user"],
    title: () => "Borrador de contrato generado",
    description: (p) => `Operación ${str(p.operationId, "?")}`,
  },

  CONTRATO_APROBADO: {
    source: "legal",
    severity: "info",
    channels: ["user"],
    title: () => "Contrato aprobado",
    description: (p) => `Operación ${str(p.operationId, "?")}`,
  },

  CONTRATO_VERSIONADO: {
    source: "legal",
    severity: "info",
    channels: ["user"],
    title: () => "Nueva versión de contrato",
    description: (p) =>
      `Operación ${str(p.operationId, "?")} — versión ${str(p.version, "?")}`,
  },

  FIRMA_ENVIADA: {
    source: "legal",
    severity: "info",
    channels: ["user"],
    title: () => "Firma enviada a las partes",
    description: (p) => `Operación ${str(p.operationId, "?")}`,
  },

  FIRMA_COMPLETADA: {
    source: "legal",
    severity: "info",
    channels: ["org", "user"],
    title: () => "Contrato firmado por todas las partes",
    description: (p) => `Operación ${str(p.operationId, "?")}`,
  },

  FIRMA_RECHAZADA: {
    source: "legal",
    severity: "warning",
    channels: ["user"],
    title: () => "Firma rechazada",
    description: (p) => `Operación ${str(p.operationId, "?")}`,
  },

  FIRMA_SLA_ESCALADO: {
    source: "legal",
    severity: "critical",
    channels: ["management", "user"],
    title: () => "SLA de firma excedido",
    description: (p) => `Operación ${str(p.operationId, "?")} — requiere atención`,
  },

  OPERACION_CERRADA: {
    source: "post-venta",
    severity: "info",
    channels: ["org", "user"],
    title: () => "Operación cerrada",
    description: (p) => `Operación ${str(p.operationId || p.aggregateId, "?")}`,
  },

  INCIDENCIA_POSTVENTA_ABIERTA: {
    source: "post-venta",
    severity: "warning",
    channels: ["user"],
    title: () => "Incidencia post-venta abierta",
    description: (p) => str(p.descripcion, `Operación ${str(p.operationId, "?")}`),
  },

  PRICING_ANALISIS_GENERADO: {
    source: "pricing",
    severity: "info",
    channels: ["user"],
    title: () => "Análisis de pricing listo",
    description: (p) => `Propiedad ${str(p.propertyCode, "?")}`,
  },

  COLABORADOR_SLA_BREACH: {
    source: "colaboradores",
    severity: "critical",
    channels: ["management"],
    title: () => "SLA de colaborador excedido",
    description: (p) =>
      `${str(p.colaboradorNombre, "Colaborador")} — operación ${str(p.operationId, "?")}`,
  },

  CEO_DIAGNOSTICO_GENERADO: {
    source: "bi",
    severity: "info",
    channels: ["management"],
    title: () => "Diagnóstico CEO generado",
    description: () => "Nuevo diagnóstico de negocio disponible",
  },

  CEO_FINANZAS_GENERADA: {
    source: "bi",
    severity: "info",
    channels: ["management"],
    title: () => "Reporte financiero generado",
    description: () => "Nuevo reporte de finanzas disponible",
  },
};
