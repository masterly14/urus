import type { InmovillaRestClient } from "./client";
import type { Propietario, PropertyOwnerPatch } from "./types";

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = str(value);
    if (text) return text;
  }
  return "";
}

function normalizeOwnerResponse(data: unknown): Propietario | null {
  if (data == null) return null;
  if (Array.isArray(data)) {
    const first = data.find((item) => item && typeof item === "object");
    return first ? (first as Propietario) : null;
  }
  if (typeof data === "object") return data as Propietario;
  return null;
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes("404");
}

function formatPhone(
  phone: unknown,
  prefix: unknown,
): string {
  const digits = str(phone).replace(/\D/g, "");
  if (!digits) return "";
  const prefixDigits = str(prefix).replace(/\D/g, "");
  if (!prefixDigits || digits.startsWith(prefixDigits) || digits.length > 9) {
    return digits;
  }
  return `${prefixDigits}${digits}`;
}

function formatAddress(owner: Propietario): string {
  return [
    [str(owner.calle), str(owner.numero)].filter(Boolean).join(", "),
    str(owner.planta) ? `Planta ${str(owner.planta)}` : "",
    str(owner.puerta) ? `Puerta ${str(owner.puerta)}` : "",
    str(owner.escalera) ? `Escalera ${str(owner.escalera)}` : "",
    str(owner.cp),
    str(owner.localidad),
    str(owner.provincia),
    str(owner.pais),
  ]
    .filter(Boolean)
    .join(", ");
}

export function mapOwnerToPropertyOwnerPatch(
  owner: Propietario | null | undefined,
  syncedAt = new Date(),
): PropertyOwnerPatch {
  if (!owner) return {};

  const fullName = [str(owner.nombre), str(owner.apellidos)]
    .filter(Boolean)
    .join(" ");
  const phone = firstNonEmpty(
    formatPhone(owner.telefono2, owner.prefijotel2),
    formatPhone(owner.telefono1, owner.prefijotel1),
    formatPhone(owner.telefono3, owner.prefijotel3),
  );
  const address = formatAddress(owner);

  return {
    ...(fullName ? { propietarioNombre: fullName } : {}),
    ...(str(owner.nif) ? { propietarioDni: str(owner.nif) } : {}),
    ...(phone ? { propietarioPhone: phone } : {}),
    ...(address ? { propietarioDomicilioFiscal: address } : {}),
    ...(fullName || owner.nif || phone || address
      ? { propietarioRegisteredAt: syncedAt.toISOString() }
      : {}),
  };
}

export async function getOwnerByPropertyCode(
  client: InmovillaRestClient,
  codOfer: number | string,
): Promise<Propietario | null> {
  try {
    const data = await client.get<unknown>("/propietarios/", {
      cod_ofer: String(codOfer),
    });
    return normalizeOwnerResponse(data);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getOwnerByRef(
  client: InmovillaRestClient,
  ref: string,
): Promise<Propietario | null> {
  try {
    const data = await client.get<unknown>("/propietarios/", { ref });
    return normalizeOwnerResponse(data);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
