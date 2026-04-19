/**
 * Utilidades compartidas para agendar mensajes anuales post-venta
 * (cumpleaños, navidad) respetando zona horaria Europe/Madrid.
 *
 * Las horas de envío se leen de ENV:
 *   - POSTVENTA_TIMEZONE (default: Europe/Madrid)
 *   - POSTVENTA_BIRTHDAY_HOUR_LOCAL (default: 12)
 *   - POSTVENTA_NAVIDAD_DAY (default: 24)
 *   - POSTVENTA_NAVIDAD_MONTH (default: 12)
 *   - POSTVENTA_NAVIDAD_HOUR_LOCAL (default: 12)
 */

const DEFAULT_TZ = "Europe/Madrid";

function readIntEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function postventaTimezone(): string {
  return process.env.POSTVENTA_TIMEZONE?.trim() || DEFAULT_TZ;
}

export function postventaBirthdayHourLocal(): number {
  return readIntEnv("POSTVENTA_BIRTHDAY_HOUR_LOCAL", 12);
}

export function postventaNavidadDay(): number {
  return readIntEnv("POSTVENTA_NAVIDAD_DAY", 24);
}

export function postventaNavidadMonth(): number {
  return readIntEnv("POSTVENTA_NAVIDAD_MONTH", 12);
}

export function postventaNavidadHourLocal(): number {
  return readIntEnv("POSTVENTA_NAVIDAD_HOUR_LOCAL", 12);
}

/**
 * Convierte una (year, month, day, hour) en zona local a una `Date` UTC.
 * Usa `Intl.DateTimeFormat` con la tz configurada para obtener el offset
 * correcto (maneja cambios DST automáticamente).
 */
export function localDateTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hourLocal: number,
  tz: string,
): Date {
  // Estimación inicial: asumimos UTC y luego calculamos el offset real de la tz
  // en esa fecha y lo restamos.
  const utcGuess = new Date(Date.UTC(year, monthIndex, day, hourLocal, 0, 0));

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);

  const map = new Map(parts.map((p) => [p.type, p.value]));
  const asSeenLocal = Date.UTC(
    Number(map.get("year")),
    Number(map.get("month")) - 1,
    Number(map.get("day")),
    Number(map.get("hour") === "24" ? "0" : map.get("hour")),
    Number(map.get("minute")),
    Number(map.get("second")),
  );
  const offsetMs = asSeenLocal - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

/**
 * Devuelve la próxima ocurrencia (UTC) de una fecha local recurrente anual
 * (mes, día, hora local). Si la fecha de este año ya pasó, devuelve la del
 * año siguiente.
 */
export function nextAnnualOccurrenceUtc(params: {
  monthIndex: number;
  day: number;
  hourLocal: number;
  timezone: string;
  now?: Date;
}): Date {
  const now = params.now ?? new Date();
  const year = now.getUTCFullYear();
  const thisYear = localDateTimeToUtc(
    year,
    params.monthIndex,
    params.day,
    params.hourLocal,
    params.timezone,
  );
  if (thisYear.getTime() > now.getTime()) return thisYear;
  return localDateTimeToUtc(
    year + 1,
    params.monthIndex,
    params.day,
    params.hourLocal,
    params.timezone,
  );
}

/**
 * Año natural (en la tz configurada) de una fecha. Se usa para idempotency
 * keys de jobs anuales.
 */
export function localYear(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const n = Number.parseInt(year, 10);
  return Number.isFinite(n) ? n : date.getUTCFullYear();
}
