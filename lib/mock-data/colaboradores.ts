import type { Colaborador } from "./types";

export const colaboradores: Colaborador[] = [
    { id: "col-1", nombre: "Banco Santander — Hipotecas", tipo: "Banco", ciudad: "Valencia", especialidad: "Financiación hipotecaria", slaEsperado: 5, slaReal: 8, operaciones: 12, score: 45, estado: "critico", tendenciaMensual: [72, 68, 60, 55, 50, 45] },
    { id: "col-2", nombre: "Notaría López & Asociados", tipo: "Notaría", ciudad: "Valencia", especialidad: "Escrituras y actas", slaEsperado: 3, slaReal: 2, operaciones: 18, score: 92, estado: "ok", tendenciaMensual: [85, 87, 88, 90, 91, 92] },
    { id: "col-3", nombre: "Tasaciones Valora", tipo: "Tasador", ciudad: "Valencia", especialidad: "Tasación inmobiliaria", slaEsperado: 7, slaReal: 5, operaciones: 15, score: 88, estado: "ok", tendenciaMensual: [80, 82, 84, 85, 87, 88] },
    { id: "col-4", nombre: "Bufete Jurídico Martí", tipo: "Abogado", ciudad: "Madrid", especialidad: "Derecho inmobiliario", slaEsperado: 4, slaReal: 6, operaciones: 8, score: 58, estado: "retrasado", tendenciaMensual: [70, 65, 62, 60, 59, 58] },
    { id: "col-5", nombre: "Reformas Integrales MedPlan", tipo: "Constructor", ciudad: "Valencia", especialidad: "Reformas integrales", slaEsperado: 30, slaReal: 28, operaciones: 5, score: 78, estado: "ok", tendenciaMensual: [70, 72, 74, 75, 76, 78] },
    { id: "col-6", nombre: "Gestión Energética VLC", tipo: "Certificador", ciudad: "Valencia", especialidad: "Certificados energéticos", slaEsperado: 2, slaReal: 1, operaciones: 22, score: 95, estado: "ok", tendenciaMensual: [90, 91, 92, 93, 94, 95] },
];
