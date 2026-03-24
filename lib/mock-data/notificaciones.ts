import type { AppNotification } from "./types";

export const notificaciones: AppNotification[] = [
    { id: "n-1", source: "colaboradores", severity: "critical", title: "SLA Excedido", description: "Colaborador 'Banco Santander' excede SLA en operación #45", timestamp: "2026-02-12T22:30:00Z", read: false },
    { id: "n-2", source: "pricing", severity: "warning", title: "Fuera de Mercado", description: "Propiedad Calle Mayor 12 — Semáforo Rojo", timestamp: "2026-02-12T22:15:00Z", read: false },
    { id: "n-3", source: "matching", severity: "info", title: "Nuevo Match", description: "Piso Valencia ↔ Cliente García (92% coincidencia)", timestamp: "2026-02-12T22:00:00Z", read: false },
    { id: "n-4", source: "legal", severity: "info", title: "Contrato Firmado", description: "Contrato #23 firmado por ambas partes", timestamp: "2026-02-12T21:45:00Z", read: false },
    { id: "n-5", source: "rendimiento", severity: "warning", title: "Caída de Rendimiento", description: "Comercial Ana López: rendimiento bajo 2 semanas consecutivas", timestamp: "2026-02-12T21:30:00Z", read: false },
    { id: "n-6", source: "coach", severity: "warning", title: "Estrés Elevado", description: "Zona Valencia muestra niveles altos de estrés agregado", timestamp: "2026-02-12T21:00:00Z", read: true },
    { id: "n-7", source: "post-venta", severity: "info", title: "Reseña Recibida", description: "Cliente Fernández dejó reseña 5★ en Google Business", timestamp: "2026-02-12T20:30:00Z", read: true },
    { id: "n-8", source: "matching", severity: "info", title: "Feedback Recibido", description: "Cliente Moreno: 'Me encaja' — Visita programada", timestamp: "2026-02-12T20:00:00Z", read: true },
    { id: "n-9", source: "colaboradores", severity: "critical", title: "Operación Bloqueada", description: "Notaría 'López & Asociados' bloquea operación #38", timestamp: "2026-02-12T19:30:00Z", read: false },
    { id: "n-10", source: "bi", severity: "warning", title: "Umbral Cruzado", description: "Cash Flow por debajo del umbral definido (-2.1%)", timestamp: "2026-02-12T19:00:00Z", read: false },
    { id: "n-11", source: "pricing", severity: "info", title: "Análisis Completado", description: "Nuevo análisis de pricing para Av. Constitución 45", timestamp: "2026-02-12T18:30:00Z", read: true },
    { id: "n-12", source: "legal", severity: "warning", title: "Contrato Pendiente", description: "Contrato #25 lleva 3 días en revisión sin cambios", timestamp: "2026-02-12T18:00:00Z", read: true },
    { id: "n-13", source: "rendimiento", severity: "info", title: "Top Performer", description: "Carlos Martínez alcanza récord mensual de conversión", timestamp: "2026-02-12T17:30:00Z", read: true },
    { id: "n-14", source: "post-venta", severity: "info", title: "Referido Activado", description: "Cliente Ruiz refirió a un nuevo comprador potencial", timestamp: "2026-02-12T17:00:00Z", read: true },
    { id: "n-15", source: "matching", severity: "info", title: "Match Automático", description: "Nueva propiedad cruza con 3 demandas activas", timestamp: "2026-02-12T16:30:00Z", read: true },
    { id: "n-16", source: "coach", severity: "info", title: "Sesión Completada", description: "Elena Vidal completó sesión de coaching motivacional", timestamp: "2026-02-12T16:00:00Z", read: true },
    { id: "n-17", source: "colaboradores", severity: "info", title: "SLA Cumplido", description: "Tasador 'Valora' completó trabajo 2 días antes del SLA", timestamp: "2026-02-12T15:30:00Z", read: true },
    { id: "n-18", source: "bi", severity: "info", title: "Reporte Generado", description: "Reporte mensual de Business Intelligence disponible", timestamp: "2026-02-12T15:00:00Z", read: true },
    { id: "n-19", source: "pricing", severity: "critical", title: "Propiedad Quemada", description: "Piso Gran Vía 8: 45 días sin llamadas — acción urgente", timestamp: "2026-02-12T14:30:00Z", read: false },
    { id: "n-20", source: "rendimiento", severity: "critical", title: "Bajo Rendimiento", description: "Javier Ruiz clasificado como Bajo Rendimiento Estructural", timestamp: "2026-02-12T14:00:00Z", read: false },
];

// Templates for generating random notifications in real-time
export const notificationTemplates: Omit<AppNotification, "id" | "timestamp" | "read">[] = [
    { source: "matching", severity: "info", title: "Nuevo Match", description: "Cruce automático detectado con alta coincidencia" },
    { source: "colaboradores", severity: "warning", title: "SLA en Riesgo", description: "Un colaborador se acerca al límite de SLA" },
    { source: "pricing", severity: "warning", title: "Cambio de Posición", description: "Una propiedad bajó de posición en portales" },
    { source: "post-venta", severity: "info", title: "Etapa Avanzada", description: "Una operación avanzó a la siguiente etapa" },
    { source: "legal", severity: "info", title: "Versión Generada", description: "Nueva versión de contrato creada automáticamente" },
    { source: "coach", severity: "info", title: "Sesión Iniciada", description: "Un comercial inició sesión de coaching" },
    { source: "rendimiento", severity: "warning", title: "Anomalía Detectada", description: "Cambio significativo en rendimiento de un comercial" },
    { source: "bi", severity: "info", title: "KPI Actualizado", description: "Los indicadores financieros han sido recalculados" },
];
