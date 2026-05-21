/**
 * Punto de entrada público del Core de Inteligencia de Mercado.
 *
 * Importar siempre desde `@/lib/market` (no desde submódulos) para
 * mantener la superficie pública estable. Ver:
 *   - docs/core-sistema-mercado.md
 *   - docs/core-sistema-mercado-plan-implementacion.md
 *   - docs/core-sistema-mercado-decisiones.md
 */

export * from "./types";
export * from "./normalize";
export * from "./identity";
export * from "./quality";
export * from "./source-mapping";
export * from "./phone";
export * from "./diff";
export * from "./snapshot";
export * from "./geo";
export * from "./job-priority";
