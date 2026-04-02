/**
 * Funciones de formateo comunes para la UI.
 */

/**
 * Formatea un número como moneda (Euros).
 */
export function formatEur(value: number, options?: { showCents?: boolean }): string {
    if (!Number.isFinite(value)) return "0 €";
    
    return value.toLocaleString("es-ES", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: options?.showCents ? 2 : 0,
        maximumFractionDigits: options?.showCents ? 2 : 0,
    });
}

/**
 * Formatea un número como moneda compacta (ej: 1.2M, 50K).
 */
export function formatEurCompact(value: number): string {
    if (!Number.isFinite(value)) return "0 €";
    
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M €`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K €`;
    
    return formatEur(value, { showCents: false });
}

/**
 * Formatea un número como porcentaje.
 */
export function formatPercent(value: number, options?: { showDecimals?: boolean }): string {
    if (!Number.isFinite(value)) return "0%";
    
    return value.toLocaleString("es-ES", {
        style: "percent",
        minimumFractionDigits: options?.showDecimals ? 1 : 0,
        maximumFractionDigits: options?.showDecimals ? 2 : 0,
    });
}

/**
 * Formatea una fecha ISO a string local (es-ES).
 */
export function formatDate(iso: string | Date | null | undefined, options?: { showTime?: boolean }): string {
    if (!iso) return "—";
    
    const date = typeof iso === "string" ? new Date(iso) : iso;
    if (isNaN(date.getTime())) return "—";
    
    return date.toLocaleString("es-ES", {
        dateStyle: "medium",
        timeStyle: options?.showTime ? "short" : undefined,
    });
}
