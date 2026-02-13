import type { Contrato } from "./types";

export const contratos: Contrato[] = [
    {
        id: "ctr-1", operacion: "op-4", tipo: "arras", versionActual: "v2", estado: "revision", fechaCreacion: "2026-02-11", comercial: "com-1", variables: { precio: 340000, comprador: "Roberto Navarro", vendedor: "Pilar Martín", fechaFirma: "2026-03-15", tipoArras: "penitenciales", cantidadArras: 34000, condicionHipotecaria: true }, bloquesActivos: ["datos_partes", "descripcion_inmueble", "precio_arras", "condicion_hipotecaria", "plazos"], versiones: [
            { version: "v1", fecha: "2026-02-11T16:30:00Z", descripcion: "Borrador automático generado" },
            { version: "v2", fecha: "2026-02-12T10:00:00Z", descripcion: "Cambios del gestor: arras penitenciales, condición hipotecaria" },
        ]
    },
    {
        id: "ctr-2", operacion: "op-6", tipo: "reserva", versionActual: "v1", estado: "borrador", fechaCreacion: "2026-02-12", comercial: "com-2", variables: { precio: 285000, comprador: "Marta Jiménez", vendedor: "Antonio Herrera", fechaReserva: "2026-02-12", cantidadReserva: 3000 }, bloquesActivos: ["datos_partes", "descripcion_inmueble", "reserva_basica"], versiones: [
            { version: "v1", fecha: "2026-02-12T14:00:00Z", descripcion: "Borrador automático generado" },
        ]
    },
    {
        id: "ctr-3", operacion: "op-1", tipo: "arras", versionActual: "v3", estado: "firmado", fechaCreacion: "2026-02-08", comercial: "com-1", variables: { precio: 310000, comprador: "María Fernández", vendedor: "José Pérez", fechaFirma: "2026-02-10", tipoArras: "confirmatorias", cantidadArras: 31000, condicionHipotecaria: false, incluyeMuebles: true }, bloquesActivos: ["datos_partes", "descripcion_inmueble", "precio_arras", "plazos", "anexo_mobiliario"], versiones: [
            { version: "v1", fecha: "2026-02-08T09:00:00Z", descripcion: "Borrador automático generado" },
            { version: "v2", fecha: "2026-02-09T11:00:00Z", descripcion: "Añadido anexo de mobiliario por voz" },
            { version: "v3", fecha: "2026-02-10T08:00:00Z", descripcion: "Versión final firmada" },
        ]
    },
    {
        id: "ctr-4", operacion: "op-2", tipo: "arras", versionActual: "v2", estado: "enviado", fechaCreacion: "2026-02-03", comercial: "com-4", variables: { precio: 550000, comprador: "Inversiones Mediterráneo SL", vendedor: "Carmen Gómez", fechaFirma: "2026-02-05", tipoArras: "penitenciales", cantidadArras: 55000, condicionHipotecaria: false }, bloquesActivos: ["datos_partes", "descripcion_inmueble", "precio_arras", "plazos", "clausula_sociedad"], versiones: [
            { version: "v1", fecha: "2026-02-03T10:00:00Z", descripcion: "Borrador automático generado" },
            { version: "v2", fecha: "2026-02-04T15:00:00Z", descripcion: "Añadida cláusula de sociedad" },
        ]
    },
    {
        id: "ctr-5", operacion: "op-8", tipo: "reserva", versionActual: "v1", estado: "firmado", fechaCreacion: "2026-02-07", comercial: "com-8", variables: { precio: 175000, comprador: "David Torres", vendedor: "Raquel Díaz", fechaReserva: "2026-02-07", cantidadReserva: 2000 }, bloquesActivos: ["datos_partes", "descripcion_inmueble", "reserva_basica"], versiones: [
            { version: "v1", fecha: "2026-02-07T11:00:00Z", descripcion: "Reserva generada y firmada el mismo día" },
        ]
    },
];
