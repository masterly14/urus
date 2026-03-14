import "dotenv/config";
import { loginToInmovilla } from "../lib/inmovilla/auth/login";
import { fetchAllProperties } from "../lib/inmovilla/api/properties";

const jsonMode = process.argv.includes("--json");
const headless = process.argv.includes("--headless");

function truncate(value: string, max = 40): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function formatPrice(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

async function main() {
  console.log("[read-properties] Iniciando login...");
  const session = await loginToInmovilla({ headless });

  console.log("[read-properties] Sesión obtenida — leyendo propiedades...\n");
  const properties = await fetchAllProperties(session);

  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, count: properties.length, properties }, null, 2));
    return;
  }

  console.log(`\n=== Propiedades Inmovilla (${properties.length}) ===\n`);
  console.log(
    "Ref".padEnd(16) +
    "Título".padEnd(42) +
    "Precio".padStart(12) +
    "  " +
    "Ciudad".padEnd(16) +
    "Estado".padEnd(12) +
    "Agente",
  );
  console.log("-".repeat(110));

  for (const p of properties) {
    console.log(
      p.ref.padEnd(16) +
      truncate(p.titulo).padEnd(42) +
      formatPrice(p.precio).padStart(12) +
      "  " +
      truncate(p.ciudad, 14).padEnd(16) +
      p.estado.padEnd(12) +
      p.agente,
    );
  }

  console.log(`\nTotal: ${properties.length} propiedades activas.\n`);
}

main().catch((err) => {
  console.error("[inmovilla-read-properties] Error:", err.message ?? err);
  process.exit(1);
});
