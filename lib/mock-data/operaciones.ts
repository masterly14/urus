import type { OperacionPostVenta } from "./types";

export const operaciones: OperacionPostVenta[] = [
    {
        id: "op-1", propiedad: "prop-5", direccion: "Pl. Ayuntamiento 7, 2ºD", precio: 310000, fechaCierre: "2026-02-10", comercial: "com-1", etapaActual: 3, tipoCliente: "comprador", comprador: "María Fernández", vendedor: "José Pérez", checklistCompleto: true, mensajes: [
            { id: "m-1", etapa: 1, tipo: "enviado", contenido: "Gracias por confiar en URUS Capital. Su operación ha sido cerrada exitosamente.", fecha: "2026-02-10T10:00:00Z" },
            { id: "m-2", etapa: 1, tipo: "respuesta", contenido: "Muchas gracias, un placer trabajar con ustedes.", fecha: "2026-02-10T12:30:00Z" },
            { id: "m-3", etapa: 2, tipo: "enviado", contenido: "¿Todo correcto con la entrega? Le adjuntamos una guía útil.", fecha: "2026-02-12T09:00:00Z" },
            { id: "m-4", etapa: 2, tipo: "respuesta", contenido: "Todo perfecto, la guía me ha sido muy útil.", fecha: "2026-02-12T14:00:00Z" },
            { id: "m-5", etapa: 3, tipo: "enviado", contenido: "¿Nos dejaría una reseña? Su opinión nos ayuda a mejorar.", fecha: "2026-02-13T09:00:00Z" },
        ]
    },
    {
        id: "op-2", propiedad: "prop-4", direccion: "Calle Colón 23", precio: 550000, fechaCierre: "2026-02-05", comercial: "com-4", etapaActual: 4, tipoCliente: "inversor", comprador: "Inversiones Mediterráneo SL", vendedor: "Carmen Gómez", checklistCompleto: true, mensajes: [
            { id: "m-6", etapa: 1, tipo: "enviado", contenido: "Operación cerrada. Adjuntamos resumen.", fecha: "2026-02-05T10:00:00Z" },
            { id: "m-7", etapa: 4, tipo: "enviado", contenido: "¿Conoce a alguien que también busque invertir?", fecha: "2026-02-12T10:00:00Z" },
        ]
    },
    {
        id: "op-3", propiedad: "prop-9", direccion: "Blasco Ibáñez 62, 8ºA", precio: 245000, fechaCierre: "2026-01-28", comercial: "com-6", etapaActual: 5, tipoCliente: "comprador", comprador: "Luis Moreno", vendedor: "Isabel Ruiz", checklistCompleto: true, mensajes: [
            { id: "m-8", etapa: 5, tipo: "enviado", contenido: "¿Le gustaría conocer nuevas oportunidades en la zona?", fecha: "2026-02-10T10:00:00Z" },
        ]
    },
    {
        id: "op-4", propiedad: "prop-11", direccion: "Calle Sorní 18, 4ºB", precio: 340000, fechaCierre: "2026-02-11", comercial: "com-1", etapaActual: 1, tipoCliente: "comprador", comprador: "Roberto Navarro", vendedor: "Pilar Martín", checklistCompleto: false, mensajes: [
            { id: "m-9", etapa: 1, tipo: "enviado", contenido: "Enhorabuena por su nueva casa. Resumen de operación adjunto.", fecha: "2026-02-11T16:00:00Z" },
        ]
    },
    {
        id: "op-5", propiedad: "prop-7", direccion: "Av. del Puerto 88", precio: 380000, fechaCierre: "2026-02-01", comercial: "com-3", etapaActual: 4, tipoCliente: "vendedor", comprador: "Andrea Soler", vendedor: "Francisco Blanco", checklistCompleto: true, mensajes: [
            { id: "m-10", etapa: 1, tipo: "enviado", contenido: "Gracias por la confianza.", fecha: "2026-02-01T10:00:00Z" },
            { id: "m-11", etapa: 4, tipo: "enviado", contenido: "¿Tiene algún conocido que quiera vender?", fecha: "2026-02-08T10:00:00Z" },
        ]
    },
    { id: "op-6", propiedad: "prop-1", direccion: "Calle Mayor 12, 3ºA", precio: 285000, fechaCierre: "2026-02-12", comercial: "com-2", etapaActual: 1, tipoCliente: "comprador", comprador: "Marta Jiménez", vendedor: "Antonio Herrera", checklistCompleto: false, mensajes: [] },
    {
        id: "op-7", propiedad: "prop-12", direccion: "Av. Francia 20, 10ºA", precio: 620000, fechaCierre: "2026-01-20", comercial: "com-7", etapaActual: 5, tipoCliente: "inversor", comprador: "Capital Valencia SL", vendedor: "Lucia Campos", checklistCompleto: true, mensajes: [
            { id: "m-12", etapa: 5, tipo: "enviado", contenido: "Nuevas oportunidades de inversión disponibles.", fecha: "2026-02-10T10:00:00Z" },
        ]
    },
    {
        id: "op-8", propiedad: "prop-6", direccion: "Calle Ruzafa 15, Bajo", precio: 175000, fechaCierre: "2026-02-08", comercial: "com-8", etapaActual: 2, tipoCliente: "comprador", comprador: "David Torres", vendedor: "Raquel Díaz", checklistCompleto: true, mensajes: [
            { id: "m-13", etapa: 2, tipo: "enviado", contenido: "¿Necesita ayuda con el cambio de suministros?", fecha: "2026-02-12T09:00:00Z" },
        ]
    },
    { id: "op-9", propiedad: "prop-10", direccion: "Camino de Vera 100", precio: 520000, fechaCierre: "2026-01-15", comercial: "com-4", etapaActual: 5, tipoCliente: "comprador", comprador: "Fernando Gil", vendedor: "Teresa Molina", checklistCompleto: true, mensajes: [] },
    {
        id: "op-10", propiedad: "prop-2", direccion: "Av. Constitución 45, 1ºB", precio: 420000, fechaCierre: "2026-02-09", comercial: "com-6", etapaActual: 2, tipoCliente: "vendedor", comprador: "Sergio Ramos", vendedor: "Julia Ortega", checklistCompleto: true, mensajes: [
            { id: "m-14", etapa: 2, tipo: "enviado", contenido: "¿Todo en orden con la documentación?", fecha: "2026-02-13T09:00:00Z" },
        ]
    },
];
