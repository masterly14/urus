import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  writeToInmovilla,
  InmovillaWriteError,
  type WriteOperation,
  type WriteOperationPayloadMap,
} from "../lib/inmovilla/write";

const HEADLESS = process.argv.includes("--headless");
const NO_VERIFY = process.argv.includes("--no-verify");
const JSON_OUTPUT = process.argv.includes("--json");

function parseArgs(): { operation: WriteOperation; payload: unknown } {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const operation = args[0] as WriteOperation | undefined;

  if (!operation || !["createDemand", "updateDemandEmail", "updateDemandPriority"].includes(operation)) {
    console.error("Uso: tsx scripts/run-write-inmovilla.ts <operation> [--headless] [--no-verify] [--json]");
    console.error("  operation: createDemand | updateDemandEmail | updateDemandPriority");
    console.error("");
    console.error("  updateDemandEmail: requiere env o --demandId, --demandRef, --clientId, --agentId, --propertyTypes, --email");
    console.error("  updateDemandPriority: requiere env o --demandId, --demandRef, --clientId, --agentId, --propertyTypes, --priority");
    console.error("  createDemand: requiere payload vía INMOVILLA_CREATE_DEMAND_JSON (path a JSON) o variables de entorno.");
    process.exit(1);
  }

  const get = (key: string): string => {
    const prefix = `--${key}=`;
    const arg = process.argv.find((a) => a.startsWith(prefix));
    if (arg) return arg.slice(prefix.length).trim();
    const envKey = `INMOVILLA_${key.toUpperCase().replace(/-/g, "_")}`;
    return (process.env[envKey] ?? "").trim();
  };

  if (operation === "updateDemandEmail") {
    const payload: WriteOperationPayloadMap["updateDemandEmail"] = {
      demandId: get("demandId"),
      demandRef: get("demandRef") || get("demandId"),
      clientId: get("clientId"),
      agentId: get("agentId") || process.env.INMOVILLA_AGENT_ID || "",
      propertyTypes: get("propertyTypes") || "2799,2899,4399,2999,3099,3299,3399,3499",
      email: get("email"),
      envConf: (get("envConf") as "true" | "false") || "true",
    };
    if (!payload.demandId || !payload.clientId || !payload.email) {
      console.error("Faltan demandId, clientId o email (env o --demandId=... --clientId=... --email=...)");
      process.exit(1);
    }
    return { operation, payload };
  }

  if (operation === "updateDemandPriority") {
    const payload: WriteOperationPayloadMap["updateDemandPriority"] = {
      demandId: get("demandId"),
      demandRef: get("demandRef") || get("demandId"),
      clientId: get("clientId"),
      agentId: get("agentId") || process.env.INMOVILLA_AGENT_ID || "",
      propertyTypes: get("propertyTypes") || "2799,2899,4399,2999,3099,3299,3399,3499",
      priority: get("priority"),
      envConf: (get("envConf") as "true" | "false") || "false",
    };
    if (!payload.demandId || !payload.clientId || !payload.priority) {
      console.error("Faltan demandId, clientId o priority (env o --demandId=... --clientId=... --priority=...)");
      process.exit(1);
    }
    return { operation, payload };
  }

  if (operation === "createDemand") {
    const jsonPath = process.env.INMOVILLA_CREATE_DEMAND_JSON;
    if (jsonPath) {
      const fullPath = path.resolve(process.cwd(), jsonPath);
      if (!fs.existsSync(fullPath)) {
        console.error(`No se encontró archivo: ${fullPath}`);
        process.exit(1);
      }
      const raw = fs.readFileSync(fullPath, "utf-8");
      const payload = JSON.parse(raw) as WriteOperationPayloadMap["createDemand"];
      return { operation, payload };
    }
    const payload: WriteOperationPayloadMap["createDemand"] = {
      query: {
        eS: "0",
        cruce: "2",
        tipocruce: "1",
        porarea: "1",
        ref: ".auto_3.",
        idi: "1",
        envConf: "true",
      },
      body: {
        "demandas-keyagente": process.env.INMOVILLA_AGENT_ID ?? "",
        "demandas-captadopor": process.env.INMOVILLA_AGENT_ID ?? "",
        "demandas-keymedio": "6",
        "demandas-tipocruce": "1",
        "demandas-cod_dempriclave": "-_NEW_-",
        "demandas-contienecli": "keycli",
        "demandas-keycliclaveext": "clientes.cod_cli",
        "demandas-numdemanda": ".auto_3.",
        "demandas-keysitu": "20",
        "demandas-fecha": ".auto_1.",
        "demandas-fechaact": ".auto_1.",
        "demandas-porarea": "1",
        "clientes-cod_clipriclave": "-_NEW_-",
        "clientes-nombre": process.env.INMOVILLA_CLIENT_NOMBRE ?? "Test",
        "clientes-apellidos": process.env.INMOVILLA_CLIENT_APELLIDOS ?? "Script",
        "clientes-email": process.env.INMOVILLA_CLIENT_EMAIL ?? "",
        "nbclave": "demandas.cod_dem",
        "tipopropiedad": process.env.INMOVILLA_PROPERTY_TYPES ?? "2799,3399",
        "demandas-ventadesde": process.env.INMOVILLA_VENTADESDE ?? "50000",
        "demandas-ventahasta": process.env.INMOVILLA_VENTAHASTA ?? "150000",
        "demandas-ventanego": process.env.INMOVILLA_VENTAHASTA ?? "150000",
        "demandas-habitacionmin": "1",
        "demandas-titulodem": "1 hab. , Área personalizada 1",
        "demandas-centroaltitud": "-87.26",
        "demandas-centrolatitud": "14.12",
        "demandas-zoom": "14",
        "selpoli-selpoli": "",
        "seltipos-seltipos": ",2799,Apartamento,3399,Piso",
        "tipos": process.env.INMOVILLA_PROPERTY_TYPES ?? "2799,3399",
        "zonas": "",
        "valorstars-dem": "{}",
        "poli": "",
        "clientes-idiomacli": "1",
        "clientes-prefijotel1": "34",
        "clientes-prefijotel2": "34",
        "clientes-prefijotel3": "34",
        "clientes-gesauto": "2",
        "clientes-rgpdwhats": "2",
        "clientes-nonewsletters": "3",
        "clientes-enviosauto": "1",
        "demandas-tipomes": "MES",
      },
    };
    if (!payload.body["clientes-email"]) {
      console.error("createDemand requiere INMOVILLA_CLIENT_EMAIL o archivo JSON (INMOVILLA_CREATE_DEMAND_JSON)");
      process.exit(1);
    }
    return { operation, payload };
  }

  process.exit(1);
}

async function main() {
  const { operation, payload } = parseArgs();

  if (!JSON_OUTPUT) {
    console.log(`[run-write-inmovilla] Operación: ${operation}`);
    console.log("[run-write-inmovilla] Login y ejecución...\n");
  }

  const result = await writeToInmovilla(
    operation,
    payload as WriteOperationPayloadMap[WriteOperation],
    {
      headless: HEADLESS,
      verify: !NO_VERIFY,
      retryOnSessionExpired: true,
    },
  );

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  console.log("=== Resultado ===");
  console.log(`  Operación : ${result.operation}`);
  console.log(`  Demand ID : ${result.demandId}`);
  if (result.verification?.checked) {
    console.log(`  Verificación : OK`);
  }
  console.log("=================\n");
}

main().catch((err: unknown) => {
  if (err instanceof InmovillaWriteError) {
    console.error(`[run-write-inmovilla] ${err.code}: ${err.message}`);
    if (err.details && !JSON_OUTPUT) console.error("  Detalles:", err.details);
    if (JSON_OUTPUT) console.error(JSON.stringify({ ok: false, code: err.code, message: err.message, details: err.details }));
    process.exit(1);
  }
  console.error("[run-write-inmovilla] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
