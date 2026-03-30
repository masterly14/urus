import "dotenv/config";

const token = process.env.STATEFOX_BEARER_TOKEN;

if (!token) {
  console.error("[debug-statefox] Falta STATEFOX_BEARER_TOKEN");
  process.exit(1);
}

const sources = ["idealista", "fotocasa", "pisoscom", "habitaclia"] as const;

async function main() {
  for (const source of sources) {
    const url = new URL("https://statefox.com/public/aapi/props/properties");
    url.searchParams.set("source", source);
    url.searchParams.set("type", "sale");
    url.searchParams.set("items", "10");
    url.searchParams.set("housing", "flat");

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    const asObj = parsed as
      | {
          properties?: Record<string, unknown>;
          meta?: Record<string, unknown>;
        }
      | null;

    const propertiesCount = asObj?.properties
      ? Object.keys(asObj.properties).length
      : null;

    console.log("\n---");
    console.log(`[debug-statefox] source=${source}`);
    console.log(`[debug-statefox] status=${res.status} ok=${res.ok}`);
    console.log(`[debug-statefox] content-type=${res.headers.get("content-type")}`);
    console.log(`[debug-statefox] propertiesCount=${propertiesCount}`);
    console.log(`[debug-statefox] meta=${JSON.stringify(asObj?.meta ?? null)}`);
    console.log(`[debug-statefox] rawPreview=${text.slice(0, 280)}`);
  }
}

main().catch((err) => {
  console.error("[debug-statefox] Error fatal:", err);
  process.exit(1);
});
