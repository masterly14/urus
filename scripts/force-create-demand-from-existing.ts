import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";
import {
  writeToInmovilla,
  InmovillaWriteError,
  type WriteOperationPayloadMap,
} from "../lib/inmovilla/write";

type CliOptions = {
  sourceToken: string;
  sourceName: string;
  targetName: string;
  targetPhone: string;
  targetPrefix?: string;
  targetEmail: string;
  dryRun: boolean;
  headless: boolean;
  json: boolean;
  relaxedSourceMatch: boolean;
  strictSourceMatch: boolean;
  outputPayloadPath?: string;
};

type ScoredSource = {
  score: number;
  reasons: string[];
  snapshot: Awaited<ReturnType<typeof prisma.demandSnapshot.findFirstOrThrow>>;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getArgValue(key: string): string | undefined {
  const prefix = `--${key}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  if (!match) return undefined;
  return match.slice(prefix.length).trim();
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(`--${flag}`);
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function splitFullName(fullName: string): { nombre: string; apellidos: string } {
  const clean = fullName.trim().replace(/\s+/g, " ");
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length <= 1) {
    return { nombre: clean || "Cliente", apellidos: "Demo" };
  }
  const nombre = parts[0];
  const apellidos = parts.slice(1).join(" ");
  return { nombre, apellidos };
}

function parsePhone(
  phoneInput: string,
  targetPrefix?: string,
): { prefijo: string; telefono: string } {
  const digits = normalizeDigits(phoneInput);
  if (!digits) {
    return { prefijo: "34", telefono: "" };
  }

  const explicitPrefix = normalizeDigits(targetPrefix ?? "");
  if (explicitPrefix) {
    if (digits.startsWith(explicitPrefix)) {
      return { prefijo: explicitPrefix, telefono: digits.slice(explicitPrefix.length) };
    }
    return { prefijo: explicitPrefix, telefono: digits };
  }

  // Heurística: si viene en formato internacional conocido, separar prefijo.
  if (digits.startsWith("57") && digits.length >= 12) {
    return { prefijo: "57", telefono: digits.slice(2) };
  }
  if (digits.startsWith("34") && digits.length >= 11) {
    return { prefijo: "34", telefono: digits.slice(2) };
  }

  // Si viene en formato nacional colombiano (10 dígitos, inicia por 3), asumir +57.
  if (digits.length === 10 && digits.startsWith("3")) {
    return { prefijo: "57", telefono: digits };
  }

  if (digits.length > 10) {
    const prefijo = digits.slice(0, digits.length - 10);
    const telefono = digits.slice(-10);
    return { prefijo, telefono };
  }

  return { prefijo: "34", telefono: digits };
}

function fallbackEmail(targetName: string): string {
  const slug = targetName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug || "cliente"}.${Date.now()}@urus.capital`;
}

function firstNonEmptyString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function nonEmpty(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toFiniteNumber(input: unknown): number | undefined {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const n = Number(input);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function inferSeltipos(tiposRaw: string): string {
  const ids = tiposRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (ids.length === 0) return "";
  return ids.map((id) => `,${id},Tipo ${id}`).join("");
}

function parseOptions(): CliOptions {
  const sourceToken =
    getArgValue("source-token") ??
    process.env.DEMO_SOURCE_TOKEN ??
    "SOURCE_TOKEN_REQUIRED";
  const sourceName =
    getArgValue("source-name") ??
    process.env.DEMO_SOURCE_NAME ??
    "Cliente Origen";
  const targetName =
    getArgValue("target-name") ??
    process.env.DEMO_TARGET_NAME ??
    "Cliente Destino";
  const targetPhone =
    getArgValue("target-phone") ??
    process.env.DEMO_TARGET_PHONE ??
    "0000000000";
  const targetPrefix =
    getArgValue("target-prefix") ??
    process.env.DEMO_TARGET_PREFIX ??
    undefined;
  const targetEmail =
    getArgValue("target-email") ??
    process.env.DEMO_TARGET_EMAIL ??
    fallbackEmail(targetName);

  const outputPayloadPath = getArgValue("output-payload");
  const dryRun = hasFlag("dry-run") || !hasFlag("execute");

  return {
    sourceToken,
    sourceName,
    targetName,
    targetPhone,
    targetPrefix,
    targetEmail,
    dryRun,
    headless: hasFlag("headless"),
    json: hasFlag("json"),
    relaxedSourceMatch: hasFlag("relaxed-source-match"),
    strictSourceMatch: hasFlag("strict-source-match"),
    outputPayloadPath,
  };
}

function scoreCandidate(
  snapshot: Awaited<ReturnType<typeof prisma.demandSnapshot.findFirstOrThrow>>,
  sourceToken: string,
  sourceName: string,
): ScoredSource {
  const reasons: string[] = [];
  let score = 0;
  const tokenDigits = normalizeDigits(sourceToken);
  const tokenLast10 = tokenDigits.length >= 10 ? tokenDigits.slice(-10) : "";
  const snapshotDigits = normalizeDigits(snapshot.telefono);
  const sourceNameNorm = normalizeText(sourceName);
  const snapshotNameNorm = normalizeText(snapshot.nombre);
  const raw = (snapshot.raw ?? {}) as Record<string, unknown>;

  if (snapshot.codigo === sourceToken) {
    score += 100;
    reasons.push("codigo exacto");
  }
  if (snapshot.ref === sourceToken) {
    score += 90;
    reasons.push("ref exacta");
  }
  if (tokenDigits && snapshotDigits && snapshotDigits.includes(tokenDigits)) {
    score += 85;
    reasons.push("telefono coincide");
  }
  if (tokenLast10 && snapshotDigits.endsWith(tokenLast10)) {
    score += 70;
    reasons.push("telefono termina en mismos 10 digitos");
  }

  const rawPhoneCandidates = [
    firstNonEmptyString(raw, ["telefono2_raw", "telefono1_raw"]),
    firstNonEmptyString(raw, ["telefono2", "telefono1"]),
  ]
    .filter(Boolean)
    .map((v) => normalizeDigits(String(v)));

  if (
    tokenDigits &&
    rawPhoneCandidates.some((digits) => digits.includes(tokenDigits))
  ) {
    score += 80;
    reasons.push("telefono raw coincide");
  }
  if (
    tokenLast10 &&
    rawPhoneCandidates.some((digits) => digits.endsWith(tokenLast10))
  ) {
    score += 65;
    reasons.push("telefono raw termina en mismos 10 digitos");
  }

  if (sourceNameNorm && snapshotNameNorm.includes(sourceNameNorm)) {
    score += 40;
    reasons.push("nombre coincide");
  }
  const sourceNameTokens = sourceNameNorm.split(/\s+/).filter((t) => t.length >= 3);
  const matchedTokens = sourceNameTokens.filter((token) =>
    snapshotNameNorm.includes(token),
  ).length;
  if (matchedTokens > 0) {
    score += Math.min(30, matchedTokens * 10);
    reasons.push(`tokens nombre (${matchedTokens})`);
  }

  const numDemanda = firstNonEmptyString(raw, ["numdemanda"]);
  if (numDemanda && sourceToken === numDemanda) {
    score += 60;
    reasons.push("numdemanda coincide");
  }

  return { score, reasons, snapshot };
}

async function resolveSourceDemand(
  sourceToken: string,
  sourceName: string,
  relaxedSourceMatch: boolean,
  strictSourceMatch: boolean,
): Promise<ScoredSource> {
  const candidates = await prisma.demandSnapshot.findMany({
    orderBy: { updatedAt: "desc" },
    take: 5000,
  });

  const scored = candidates
    .map((snapshot) => scoreCandidate(snapshot, sourceToken, sourceName))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    if (strictSourceMatch) {
      const recent = candidates.slice(0, 20).map((c) => ({
        codigo: c.codigo,
        nombre: c.nombre,
        telefono: c.telefono,
        updatedAt: c.updatedAt,
      }));
      throw new Error(
        `No se encontro demanda origen con token '${sourceToken}' o nombre '${sourceName}' en demand_snapshots. Ultimas demandas revisadas: ${JSON.stringify(recent)}`,
      );
    }

    // Fallback explícito: escoger "cualquier demanda útil" para clonar criterios
    // cuando no hay match (caso demo forzada).
    const rankedByCompleteness = candidates
      .map((snapshot) => {
        const raw = (snapshot.raw ?? {}) as Record<string, unknown>;
        const tipos = nonEmpty(
          firstNonEmptyString(raw, ["tipopropiedad", "tipos"]) ?? snapshot.tipos,
        );
        const zonas = nonEmpty(
          firstNonEmptyString(raw, ["zonas", "zona"]) ?? snapshot.zonas,
        );
        const presupuestoMin =
          toFiniteNumber(firstNonEmptyString(raw, ["ventadesde"])) ??
          snapshot.presupuestoMin;
        const presupuestoMax =
          toFiniteNumber(firstNonEmptyString(raw, ["ventahasta"])) ??
          snapshot.presupuestoMax;
        const habitacionesMin =
          toFiniteNumber(firstNonEmptyString(raw, ["habitacionmin"])) ??
          snapshot.habitacionesMin;

        let completeness = 0;
        if (tipos) completeness += 3;
        if (zonas) completeness += 3;
        if ((presupuestoMin ?? 0) > 0) completeness += 2;
        if ((presupuestoMax ?? 0) > 0) completeness += 2;
        if ((habitacionesMin ?? 0) > 0) completeness += 1;

        return { snapshot, completeness };
      })
      .sort((a, b) => b.completeness - a.completeness);

    if (rankedByCompleteness.length === 0) {
      throw new Error("No hay demandas disponibles en demand_snapshots para clonar.");
    }

    const chosen = rankedByCompleteness[0];
    return {
      score: 0,
      reasons: [
        "fallback sin match",
        `completitud=${chosen.completeness}`,
        "seleccion automatica para demo",
      ],
      snapshot: chosen.snapshot,
    };
  }

  const tokenDigits = normalizeDigits(sourceToken);
  if (tokenDigits && !relaxedSourceMatch && strictSourceMatch) {
    const exactPhoneMatches = scored.filter((candidate) => {
      const raw = (candidate.snapshot.raw ?? {}) as Record<string, unknown>;
      const snapshotPhone = normalizeDigits(candidate.snapshot.telefono);
      const rawPhones = [
        firstNonEmptyString(raw, ["telefono2_raw", "telefono1_raw"]),
        firstNonEmptyString(raw, ["telefono2", "telefono1"]),
      ]
        .filter(Boolean)
        .map((v) => normalizeDigits(String(v)));
      return (
        snapshotPhone === tokenDigits ||
        rawPhones.some((p) => p === tokenDigits) ||
        candidate.snapshot.codigo === sourceToken ||
        candidate.snapshot.ref === sourceToken ||
        firstNonEmptyString(raw, ["numdemanda"]) === sourceToken
      );
    });

    if (exactPhoneMatches.length === 0) {
      throw new Error(
        `No hubo match exacto para '${sourceToken}'. Usa --relaxed-source-match si quieres permitir aproximacion por ultimos digitos.`,
      );
    }
    return exactPhoneMatches[0];
  }

  return scored[0];
}

function buildCreateDemandPayload(
  source: Awaited<ReturnType<typeof prisma.demandSnapshot.findFirstOrThrow>>,
  options: CliOptions,
): WriteOperationPayloadMap["createDemand"] {
  const raw = (source.raw ?? {}) as Record<string, unknown>;
  const agentId =
    firstNonEmptyString(raw, ["keyagente", "keycomercial", "userid"]) ??
    process.env.INMOVILLA_AGENT_ID ??
    "";
  if (!agentId) {
    throw new Error(
      "No se pudo resolver keyagente de la demanda origen y falta INMOVILLA_AGENT_ID",
    );
  }

  const propertyTypes =
    firstNonEmptyString(raw, ["tipopropiedad", "tipos"]) ??
    nonEmpty(source.tipos) ??
    process.env.INMOVILLA_PROPERTY_TYPES ??
    "2799,3399";

  const seltipos =
    firstNonEmptyString(raw, ["seltipos-seltipos"]) ??
    inferSeltipos(propertyTypes);
  const selpoli =
    firstNonEmptyString(raw, ["selpoli-selpoli", "selpoli", "poli"]) ?? "";
  const zonas =
    firstNonEmptyString(raw, ["zonas", "zona"]) ?? source.zonas ?? "";
  const porarea = firstNonEmptyString(raw, ["porarea"]) ?? "1";
  const tipocruce = firstNonEmptyString(raw, ["tipocruce"]) ?? "1";
  const keymedio = firstNonEmptyString(raw, ["keymedio"]) ?? "6";
  const presupuestoMin =
    toFiniteNumber(firstNonEmptyString(raw, ["ventadesde"])) ??
    source.presupuestoMin;
  const presupuestoMax =
    toFiniteNumber(firstNonEmptyString(raw, ["ventahasta"])) ??
    source.presupuestoMax;
  const habitacionesMin =
    toFiniteNumber(firstNonEmptyString(raw, ["habitacionmin"])) ??
    source.habitacionesMin;
  const tipomes = firstNonEmptyString(raw, ["tipomes"]) ?? "MES";
  const tituloDem =
    firstNonEmptyString(raw, ["titulodem", "textodemandas"]) ??
    `${Math.max(0, Math.round(habitacionesMin || 0))} hab. Demo clonado`;
  const centroAltitud =
    firstNonEmptyString(raw, ["centroaltitud"]) ?? "-87.26";
  const centroLatitud =
    firstNonEmptyString(raw, ["centrolatitud"]) ?? "14.12";
  const zoom = firstNonEmptyString(raw, ["zoom"]) ?? "13";

  const { nombre, apellidos } = splitFullName(options.targetName);
  const phone = parsePhone(options.targetPhone, options.targetPrefix);

  const body: Record<string, string> = {
    "demandas-keyagente": agentId,
    "demandas-captadopor": agentId,
    "demandas-keymedio": keymedio,
    "demandas-tipocruce": tipocruce,
    "demandas-cod_dempriclave": "-_NEW_-",
    "demandas-contienecli": "keycli",
    "demandas-keycliclaveext": "clientes.cod_cli",
    "demandas-numdemanda": ".auto_3.",
    "demandas-keysitu": "20",
    "demandas-fecha": ".auto_1.",
    "demandas-fechaact": ".auto_1.",
    "demandas-porarea": porarea,
    "clientes-cod_clipriclave": "-_NEW_-",
    "clientes-nombre": nombre,
    "clientes-apellidos": apellidos,
    "clientes-email": options.targetEmail,
    "clientes-telefono2": phone.telefono,
    "clientes-prefijotel2": phone.prefijo,
    nbclave: "demandas.cod_dem",
    tipopropiedad: propertyTypes,
    "demandas-ventadesde": String(Math.round(presupuestoMin || 0)),
    "demandas-ventahasta": String(Math.round(presupuestoMax || 0)),
    "demandas-ventanego": String(Math.round(presupuestoMax || 0)),
    "demandas-habitacionmin": String(Math.max(0, Math.round(habitacionesMin || 0))),
    "demandas-titulodem": tituloDem,
    "demandas-centroaltitud": centroAltitud,
    "demandas-centrolatitud": centroLatitud,
    "demandas-zoom": zoom,
    "selpoli-selpoli": selpoli,
    "seltipos-seltipos": seltipos,
    tipos: propertyTypes,
    zonas,
    "valorstars-dem": "{}",
    poli: selpoli,
    "clientes-idiomacli": "1",
    "clientes-prefijotel1": phone.prefijo,
    "clientes-prefijotel3": phone.prefijo,
    "clientes-gesauto": "2",
    "clientes-rgpdwhats": "2",
    "clientes-nonewsletters": "3",
    "clientes-enviosauto": "1",
    "demandas-tipomes": tipomes,
  };

  return {
    query: {
      eS: "0",
      cruce: "2",
      tipocruce: "1",
      porarea: "1",
      ref: ".auto_3.",
      idi: "1",
      envConf: "true",
    },
    body,
  };
}

function maybeWritePayloadToFile(
  payload: WriteOperationPayloadMap["createDemand"],
  outputPath?: string,
): void {
  if (!outputPath) return;
  const fullPath = path.resolve(process.cwd(), outputPath);
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`[force-create-demand] Payload guardado en: ${fullPath}`);
}

function logSourceAnalysis(source: ScoredSource): void {
  const raw = (source.snapshot.raw ?? {}) as Record<string, unknown>;
  const compact = {
    codigo: source.snapshot.codigo,
    ref: source.snapshot.ref,
    nombre: source.snapshot.nombre,
    telefono: source.snapshot.telefono,
    estado: `${source.snapshot.estadoId} (${source.snapshot.estadoNombre})`,
    presupuestoMin: source.snapshot.presupuestoMin,
    presupuestoMax: source.snapshot.presupuestoMax,
    habitacionesMin: source.snapshot.habitacionesMin,
    tipos: source.snapshot.tipos,
    zonas: source.snapshot.zonas,
    keyagente: firstNonEmptyString(raw, ["keyagente", "keycomercial", "userid"]),
    numdemanda: firstNonEmptyString(raw, ["numdemanda"]),
    phoneRaw: firstNonEmptyString(raw, ["telefono2_raw", "telefono1_raw"]),
    matchScore: source.score,
    matchReasons: source.reasons,
  };
  console.log("[force-create-demand] Demanda origen seleccionada:");
  console.log(JSON.stringify(compact, null, 2));
}

async function main() {
  const options = parseOptions();

  const source = await resolveSourceDemand(
    options.sourceToken,
    options.sourceName,
    options.relaxedSourceMatch,
    options.strictSourceMatch,
  );
  logSourceAnalysis(source);

  const payload = buildCreateDemandPayload(source.snapshot, options);
  maybeWritePayloadToFile(payload, options.outputPayloadPath);

  if (options.dryRun) {
    console.log(
      "[force-create-demand] DRY RUN: no se ejecuta writeToInmovilla. Usa --execute para crear la demanda.",
    );
    if (options.json) {
      console.log(JSON.stringify({ dryRun: true, payload }, null, 2));
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
    return;
  }

  const result = await writeToInmovilla("createDemand", payload, {
    headless: options.headless,
    verify: true,
    retryOnSessionExpired: true,
  });

  if (options.json) {
    console.log(JSON.stringify({ ok: true, result }, null, 2));
    return;
  }

  console.log("\n=== Resultado force-create-demand ===");
  console.log(`  Operacion : ${result.operation}`);
  console.log(`  Demand ID : ${result.demandId}`);
  console.log(`  Verify    : ${result.verification?.checked ? "OK" : "N/A"}`);
  console.log("=====================================\n");
}

main()
  .catch((error: unknown) => {
    if (error instanceof InmovillaWriteError) {
      console.error(
        `[force-create-demand] ${error.code}: ${error.message}`,
        error.details ?? "",
      );
      process.exit(1);
    }
    console.error(
      "[force-create-demand] Error fatal:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
