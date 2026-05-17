/**
 * Diagnostico read-only de telefonos de demandas Inmovilla.
 *
 * Cruza tres fuentes:
 * 1. Listado legacy de demandas (paginacion ventana=demandas).
 * 2. REST /clientes/?cod_cli={keycli}.
 * 3. REST /clientes/buscar/?telefono=... y /clientes/buscar/?email=...
 *
 * No escribe en Inmovilla ni en Neon. Respeta el rate limit de clientes usando
 * pocas muestras por defecto.
 *
 * Uso:
 *   npx tsx scripts/validate-inmovilla-demand-phones.ts
 *   npx tsx scripts/validate-inmovilla-demand-phones.ts --only-missing --limit=20 --scan=260
 */
import "dotenv/config";
import { loadSessionFromDb } from "@/lib/inmovilla/auth/session-store";
import { createInmovillaClient } from "@/lib/inmovilla/api/client";
import { createInmovillaRestClient } from "@/lib/inmovilla/rest/client";
import { getClient, searchClient } from "@/lib/inmovilla/rest/clients";
import type { Cliente } from "@/lib/inmovilla/rest/types";

type LegacyDemandRow = {
  codigo: string;
  nombre: string;
  keycli: string;
  email: string;
  contactadopor: string;
  telefonodemandas: string;
  telefono1: string;
  telefono2: string;
  telefono1Raw: string;
  telefono2Raw: string;
  prefijotel1: string;
  prefijotel2: string;
  raw: Record<string, unknown>;
};

function argValue(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function joinPrefixAndPhone(prefixValue: unknown, phoneValue: unknown): string {
  const prefix = digits(prefixValue);
  const phone = digits(phoneValue);
  if (!phone || phone.length < 7) return "";
  return prefix ? `${prefix}${phone}` : phone;
}

function bestLegacyPhone(row: LegacyDemandRow): string {
  const candidates = [
    row.telefono2Raw,
    joinPrefixAndPhone(row.prefijotel2, row.telefono2),
    row.telefono2,
    row.telefono1Raw,
    joinPrefixAndPhone(row.prefijotel1, row.telefono1),
    row.telefono1,
    row.telefonodemandas,
  ];
  return candidates.map(digits).find((phone) => phone.length >= 7) ?? "";
}

function phoneFromRestClient(cliente: Record<string, unknown>): string {
  const candidates = [
    joinPrefixAndPhone(cliente.prefijotel2, cliente.telefono2),
    joinPrefixAndPhone(cliente.prefijotel1, cliente.telefono1),
    joinPrefixAndPhone(cliente.prefijotel3, cliente.telefono3),
    cliente.telefono2,
    cliente.telefono1,
    cliente.telefono3,
  ];
  return candidates.map(digits).find((phone) => phone.length >= 7) ?? "";
}

function phoneSearchVariants(phone: string): string[] {
  const clean = digits(phone);
  const variants = new Set<string>();
  if (clean) variants.add(clean);
  if (clean.length === 11 && clean.startsWith("34")) {
    variants.add(clean.slice(2));
  }
  if (clean.length > 9) {
    variants.add(clean.slice(-9));
  }
  return [...variants].filter((v) => v.length >= 7);
}

function summarizeCliente(cliente: Record<string, unknown>): Record<string, unknown> {
  return {
    cod_cli: cliente.cod_cli ?? null,
    nombre: [cliente.nombre, cliente.apellidos].filter(Boolean).join(" ") || null,
    email: cliente.email || null,
    telefono1: cliente.telefono1 ?? null,
    telefono2: cliente.telefono2 ?? null,
    telefono3: cliente.telefono3 ?? null,
    prefijotel1: cliente.prefijotel1 ?? null,
    prefijotel2: cliente.prefijotel2 ?? null,
    prefijotel3: cliente.prefijotel3 ?? null,
    bestPhone: phoneFromRestClient(cliente) || null,
  };
}

function firstCliente(value: unknown): Cliente | null {
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === "object");
    return first ? (first as Cliente) : null;
  }
  if (value && typeof value === "object") {
    return value as Cliente;
  }
  return null;
}

function buildParamJson(posicion: number): string {
  return JSON.stringify({
    general: {
      info: {
        lostags: "lista_situacion;:;lista;:;lista;:;20,23,26,31;:;",
        numvistas: 1,
        ventana: "demandas",
        data: "demresultados",
      },
      filtro: "",
      campo: {
        "demandas.desvioalquiler": { valor: 0 },
        "demandas.desvioventa": { valor: 0 },
      },
      ordentipo: "desc",
    },
    demresultados: {
      info: {
        ficha: "demandas",
        data: "demresultados",
        posicion,
        paginacion: "10",
        jsonvista: "1",
        totalreg: 0,
      },
      orden: false,
    },
  });
}

function normalizeRawRow(rawEntry: unknown): LegacyDemandRow | null {
  if (!rawEntry || typeof rawEntry !== "object") return null;
  const fields = (rawEntry as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return null;

  const raw: Record<string, unknown> = {};
  for (const f of fields) {
    if (
      f &&
      typeof f === "object" &&
      typeof (f as { campo?: unknown }).campo === "string"
    ) {
      raw[(f as { campo: string }).campo] = (f as { value?: unknown }).value;
    }
  }

  return {
    codigo: String(raw.codigo ?? ""),
    nombre: String(raw.nombre ?? ""),
    keycli: String(raw.keycli ?? ""),
    email: String(raw.email ?? ""),
    contactadopor: String(raw.contactadopor ?? ""),
    telefonodemandas: String(raw.telefonodemandas ?? ""),
    telefono1: String(raw.telefono1 ?? ""),
    telefono2: String(raw.telefono2 ?? ""),
    telefono1Raw: String(raw.telefono1_raw ?? ""),
    telefono2Raw: String(raw.telefono2_raw ?? ""),
    prefijotel1: String(raw.prefijotel1 ?? ""),
    prefijotel2: String(raw.prefijotel2 ?? ""),
    raw,
  };
}

async function fetchLegacyDemandRows(maxRows: number): Promise<LegacyDemandRow[]> {
  const session = await loadSessionFromDb();
  if (!session) {
    throw new Error("No hay sesion legacy de Inmovilla en DB. Ejecuta npm run session:refresh.");
  }

  const client = createInmovillaClient(session);
  const rows: LegacyDemandRow[] = [];
  let posicion = 0;
  let pageSize = 10;

  while (rows.length < maxRows) {
    const data = await client.post<Record<string, unknown>>("/new/app/api/v1/paginacion/", {
      paramjson: buildParamJson(posicion),
    });
    const dem = data.demandas as
      | {
          demresultados?: {
            info?: { paginacion?: string | number };
            datos?: unknown[] | Record<string, unknown>;
          };
        }
      | undefined;
    const result = dem?.demresultados;
    if (!result) break;

    pageSize = Number(result.info?.paginacion) || 10;
    const rawDatos = result.datos;
    const rawRows = Array.isArray(rawDatos)
      ? rawDatos
      : Object.keys(rawDatos ?? {})
          .sort((a, b) => Number(a) - Number(b))
          .map((key) => (rawDatos as Record<string, unknown>)[key]);

    for (const raw of rawRows) {
      const row = normalizeRawRow(raw);
      if (row?.codigo) rows.push(row);
      if (rows.length >= maxRows) break;
    }

    if (rawRows.length < pageSize) break;
    posicion += pageSize;
  }

  return rows;
}

function pickSamples(rows: LegacyDemandRow[], limit: number, onlyMissing: boolean): LegacyDemandRow[] {
  const missing = rows.filter((row) => !bestLegacyPhone(row));
  if (onlyMissing) return missing.slice(0, limit);

  const withPhone = rows.filter((row) => bestLegacyPhone(row)).slice(0, Math.ceil(limit / 2));
  return [...missing.slice(0, Math.floor(limit / 2)), ...withPhone].slice(0, limit);
}

async function main(): Promise<void> {
  const limit = Math.max(1, Math.min(50, Number(argValue("limit", "20")) || 20));
  const scan = Math.max(limit * 4, Number(argValue("scan", "260")) || 260);
  const restDelayMs = Math.max(0, Number(argValue("rest-delay-ms", "3200")) || 0);
  const onlyMissing = hasFlag("only-missing");

  console.log("\n[inmovilla:phones] Validacion read-only de telefonos de demandas\n");
  console.log(
    `[inmovilla:phones] scan=${scan}, limit=${limit}, onlyMissing=${onlyMissing}, restDelayMs=${restDelayMs}`,
  );
  console.log("[inmovilla:phones] Fuentes: legacy demandas + REST clientes + REST buscar\n");

  const token = process.env.INMOVILLA_API_TOKEN?.trim();
  if (!token) {
    throw new Error("Falta INMOVILLA_API_TOKEN para validar REST /clientes.");
  }

  const rows = await fetchLegacyDemandRows(scan);
  const withPhone = rows.filter((row) => bestLegacyPhone(row)).length;
  const missing = rows.length - withPhone;
  console.log(
    `[inmovilla:phones] Legacy listado: ${rows.length} filas, ${withPhone} con telefono, ${missing} sin telefono`,
  );
  console.log(
    "[inmovilla:phones] Nota: `telefonodemandas` suele venir vacio; el telefono util esta en `telefono2_raw`/`telefono2`.\n",
  );

  const samples = pickSamples(rows, limit, onlyMissing);
  const rest = createInmovillaRestClient({ token });

  for (const [index, row] of samples.entries()) {
    const legacyPhone = bestLegacyPhone(row);
    console.log(`\n--- Muestra ${index + 1}/${samples.length}: demanda ${row.codigo} ---`);
    console.log(
      JSON.stringify(
        {
          nombre: row.nombre,
          keycli: row.keycli,
          email: row.email || null,
          fuente: row.contactadopor || null,
          legacy: {
            telefonodemandas: row.telefonodemandas || null,
            telefono1: row.telefono1 || null,
            telefono2: row.telefono2 || null,
            telefono1_raw: row.telefono1Raw || null,
            telefono2_raw: row.telefono2Raw || null,
            prefijotel1: row.prefijotel1 || null,
            prefijotel2: row.prefijotel2 || null,
            bestPhone: legacyPhone || null,
          },
        },
        null,
        2,
      ),
    );

    if (!row.keycli || !/^\d+$/.test(row.keycli)) {
      console.log("[rest:getClient] omitido: keycli ausente o no numerico");
      continue;
    }

    try {
      if (restDelayMs > 0) await sleep(restDelayMs);
      const clienteResult = await getClient(rest, Number(row.keycli));
      const cliente = firstCliente(clienteResult);
      if (!cliente) {
        console.log("[rest:getClient] sin cliente parseable");
        continue;
      }
      const restPhone = phoneFromRestClient(cliente as Record<string, unknown>);
      console.log(
        "[rest:getClient]",
        JSON.stringify(
          {
            ...summarizeCliente(cliente as Record<string, unknown>),
            legacyMatchesRest: Boolean(legacyPhone && restPhone && digits(legacyPhone) === digits(restPhone)),
          },
          null,
          2,
        ),
      );

      if (legacyPhone) {
        for (const variant of phoneSearchVariants(legacyPhone)) {
          if (restDelayMs > 0) await sleep(restDelayMs);
          const byPhone = await searchClient(rest, { telefono: variant });
          console.log(
            `[rest:buscar telefono=${variant}] matches=${byPhone.length} ${JSON.stringify(byPhone.slice(0, 3).map((c) => summarizeCliente(c as Record<string, unknown>)))}`,
          );
        }
      }

      if (row.email) {
        if (restDelayMs > 0) await sleep(restDelayMs);
        const byEmail = await searchClient(rest, { email: row.email });
        console.log(
          `[rest:buscar email=${row.email}] matches=${byEmail.length} ${JSON.stringify(byEmail.slice(0, 3).map((c) => summarizeCliente(c as Record<string, unknown>)))}`,
        );
      }
    } catch (err) {
      console.log(
        "[rest:error]",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log("\n[inmovilla:phones] Validacion terminada.\n");
}

main().catch((err) => {
  console.error("[inmovilla:phones] ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});
