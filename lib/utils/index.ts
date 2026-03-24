/**
 * Utilidades compartidas del proyecto.
 */

export { cn } from "./cn";
export { buildQueryString, type QueryParams, type QueryParamValue } from "./query-string";
export { str, num, int } from "./normalize";
export { handleHttpErrorResponse, type ErrorBodyExtractor } from "./http-error";
export { fetchWithTimeout, tryCreateDispatcher, type FetchWithTimeoutOptions } from "./fetch-with-timeout";
