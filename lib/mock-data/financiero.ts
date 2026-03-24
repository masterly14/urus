import type { DatosFinancieros } from "./types";

export const datosFinancieros: DatosFinancieros = {
    facturacion: {
        valor: 847500,
        variacion: 12.3,
        tendencia: "up",
        historico: [520000, 580000, 610000, 640000, 695000, 720000, 710000, 745000, 780000, 810000, 830000, 847500],
    },
    ebitda: {
        valor: 234100,
        variacion: 8.7,
        tendencia: "up",
        historico: [145000, 158000, 167000, 175000, 190000, 198000, 195000, 205000, 215000, 222000, 228000, 234100],
    },
    cashFlow: {
        valor: 156800,
        variacion: -2.1,
        tendencia: "down",
        historico: [120000, 135000, 142000, 148000, 155000, 162000, 170000, 168000, 165000, 160000, 158000, 156800],
    },
    costeOperativo: {
        valor: 412000,
        variacion: 5.4,
        tendencia: "up",
        historico: [310000, 325000, 340000, 350000, 360000, 370000, 375000, 380000, 390000, 395000, 405000, 412000],
    },
    operacionesActivas: {
        valor: 23,
        variacion: 4,
        tendencia: "up",
        historico: [12, 14, 15, 16, 18, 17, 19, 20, 21, 20, 22, 23],
    },
};
