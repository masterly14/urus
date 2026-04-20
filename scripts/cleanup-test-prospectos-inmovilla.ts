/**
 * Cleanup de prospectos de prueba creados por `inmovilla:test-create-prospecto`.
 *
 * Usa la API REST v1 de Inmovilla (token estático) para:
 *   1. Obtener la ficha completa del prospecto (GET /propiedades/?cod_ofer=X).
 *   2. Reenviar todos los campos con `nodisponible: true` (POST /propiedades/).
 *   3. Garantizar que `tituloes` y `descripciones` sean strings no vacíos, ya
 *      que el frontend del CRM crashea con `Cannot read properties of undefined
 *      (reading 'indexOf')` cuando estos campos llegan null/undefined a la ficha.
 *
 * Uso:
 *   npm run inmovilla:cleanup-test-prospectos -- --cod-ofer=28822979,28823068
 *   npm run inmovilla:cleanup-test-prospectos -- --ref=PR00004,PR00005
 *   npm run inmovilla:cleanup-test-prospectos -- --cod-ofer=28822979 --dry-run
 *
 * Rate limit propiedades: 10/min → espera 6s entre POSTs.
 */

import "dotenv/config";

import { createInmovillaRestClient } from "@/lib/inmovilla/rest";
import { safeUpdateProperty } from "@/lib/inmovilla/rest/safe-update";
import type {
  PropiedadCompleta,
  PropiedadListadoItem,
} from "@/lib/inmovilla/rest";

type CliOptions = {
  codOferList: number[];
  refList: string[];
  dryRun: boolean;
  force: boolean;
  throttleMs: number;
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

function parseCli(): CliOptions {
  const codOferRaw = readArg("cod-ofer") ?? readArg("codOfer") ?? "";
  const refRaw = readArg("ref") ?? "";
  const throttleRaw = readArg("throttleMs");

  const codOferList = codOferRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new Error(`cod_ofer inválido: "${v}"`);
      }
      return n;
    });

  const refList = refRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (codOferList.length === 0 && refList.length === 0) {
    throw new Error(
      "Debes indicar al menos --cod-ofer=<id,id,...> o --ref=<PRxxxx,PRxxxx,...>",
    );
  }

  return {
    codOferList,
    refList,
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force"),
    throttleMs: throttleRaw ? Math.max(0, Number(throttleRaw)) : 6500,
  };
}

function isEmptyText(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function cleanupOne(
  client: ReturnType<typeof createInmovillaRestClient>,
  codOfer: number,
  opts: Pick<CliOptions, "dryRun" | "force">,
): Promise<void> {
  console.log(`\n--- cod_ofer=${codOfer} ---`);
  const current = await client.get<PropiedadCompleta>("/propiedades/", {
    cod_ofer: String(codOfer),
  });

  if (!current || typeof current !== "object") {
    console.warn(`  No se pudo obtener la ficha (respuesta vacía).`);
    return;
  }

  const ref = current.ref ? String(current.ref) : "";
  if (!ref) {
    console.warn(`  La ficha no tiene 'ref'; la API REST no permite update sin ref.`);
    return;
  }

  const isAlreadyInactive =
    current.nodisponible === true || current.nodisponible === 1;
  const tituloEmpty = isEmptyText(current.tituloes);
  const descripcionEmpty = isEmptyText(current.descripciones);
  const needsUiFix = tituloEmpty || descripcionEmpty;

  if (isAlreadyInactive && !needsUiFix && !opts.force) {
    console.log(
      `  Ya está nodisponible=true y tituloes/descripciones OK (ref=${ref}). Saltando update (usa --force para forzar).`,
    );
    return;
  }

  const reasons: string[] = [];
  if (!isAlreadyInactive) reasons.push("desactivar (nodisponible=true)");
  if (tituloEmpty) reasons.push("tituloes vacío");
  if (descripcionEmpty) reasons.push("descripciones vacío");
  if (opts.force) reasons.push("--force");

  const fallbackTitulo = `Prospecto ${ref}`;
  const patch: Record<string, unknown> = {
    nodisponible: true,
    tituloes: isEmptyText(current.tituloes) ? fallbackTitulo : current.tituloes,
    descripciones: isEmptyText(current.descripciones)
      ? fallbackTitulo
      : current.descripciones,
  };

  console.log(
    `  ref=${ref} prospecto=${current.prospecto ? "sí" : "no"} nodisponible=${
      isAlreadyInactive ? "true" : "false"
    } tituloes="${String(current.tituloes ?? "").slice(0, 60)}"`,
  );
  console.log(`  Motivo(s) de update: ${reasons.join(", ") || "ninguno"}`);

  const result = await safeUpdateProperty(
    client,
    { codOfer },
    patch,
    {
      // No tocar `prospecto` al desactivar (ya lo es/no, lo mantenemos como está).
      extraReadonly: new Set(["prospecto"]),
      dryRun: opts.dryRun,
      logger: {
        log: (m) => console.log(`  ${m}`),
        warn: (m) => console.warn(`  ${m}`),
      },
    },
  );

  if (opts.dryRun) {
    console.log(`  [dry-run] Campos que se enviarían: ${Object.keys(result.payload).length}.`);
    return;
  }

  const okCode = result.response?.codigo;
  const msg = result.response?.mensaje ?? "";
  const removed =
    result.removedFields.length > 0
      ? ` (campos descartados: ${result.removedFields.join(", ")})`
      : "";
  console.log(`  Respuesta API: codigo=${okCode} mensaje=${msg}${removed}`);
}

async function main() {
  const token = process.env.INMOVILLA_API_TOKEN;
  if (!token) {
    console.error("Configura INMOVILLA_API_TOKEN en .env");
    process.exit(1);
  }

  const opts = parseCli();
  const client = createInmovillaRestClient({ token });

  // Resolver refs → cod_ofer (una sola llamada al listado para todos)
  const resolvedFromRefs: number[] = [];
  if (opts.refList.length > 0) {
    console.log(`Resolviendo ${opts.refList.length} ref(s) contra el listado de propiedades...`);
    const list = await client.get<PropiedadListadoItem[]>("/propiedades/", {
      listado: true,
    });
    if (!Array.isArray(list)) {
      console.warn("Listado no es un array; no se pudieron resolver refs.");
    } else {
      for (const ref of opts.refList) {
        const hit = list.find((item) => item?.ref === ref);
        if (hit) {
          resolvedFromRefs.push(hit.cod_ofer);
        } else {
          console.warn(`  ref="${ref}" no encontrado en el listado.`);
        }
      }
    }
  }

  const allCodOfer = Array.from(
    new Set([...opts.codOferList, ...resolvedFromRefs]),
  );

  if (allCodOfer.length === 0) {
    console.error("No se resolvieron cod_ofer objetivos. Aborta.");
    process.exit(1);
  }

  console.log(
    `Cleanup de ${allCodOfer.length} prospecto(s): [${allCodOfer.join(", ")}]${opts.dryRun ? " (dry-run)" : ""}`,
  );

  for (let i = 0; i < allCodOfer.length; i += 1) {
    const codOfer = allCodOfer[i];
    try {
      await cleanupOne(client, codOfer, opts);
    } catch (err) {
      console.error(
        `  ❌ Error con cod_ofer=${codOfer}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (i < allCodOfer.length - 1) {
      await sleep(opts.throttleMs);
    }
  }

  console.log("\n✅ Cleanup finalizado.");
}

main().catch((err) => {
  console.error("\n❌ Falló cleanup:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
