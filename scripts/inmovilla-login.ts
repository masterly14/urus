import "dotenv/config";
import { loginToInmovilla } from "../lib/inmovilla/auth/login";

const jsonMode = process.argv.includes("--json");

function truncate(value: string, visible = 12): string {
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…(${value.length} chars)`;
}

async function main() {
  const session = await loginToInmovilla({ headless: false });

  
  if (jsonMode) { 
    const safe = {
      ok: true,
      session: {
        ...session,
        l: truncate(session.l),
        cookies: session.cookies.map((c) => ({
          name: c.name,
          domain: c.domain,
          httpOnly: c.httpOnly,
          secure: c.secure,
        })),
      },
    };
    console.log(JSON.stringify(safe, null, 2));
  } else {
    const relevantCookies = session.cookies.filter((c) =>
      ["PHPSESSID", "inmovilla", "jwt"].includes(c.name),
    );

    console.log("\n=== Sesión Inmovilla ===");
    console.log(`  idUsuario   : ${session.idUsuario}`);
    console.log(`  numAgencia  : ${session.numAgencia}`);
    console.log(`  idPestanya  : ${session.idPestanya}`);
    console.log(`  miid        : ${session.miid}`);
    console.log(`  l           : ${truncate(session.l)}`);
    console.log(`  cookies     : ${relevantCookies.length} relevantes de ${session.cookies.length} totales`);
    relevantCookies.forEach((c) => {
      console.log(`    - ${c.name} (${c.domain})`);
    });
    console.log("=======================\n");
  }
}

main().catch((err) => {
  console.error("[inmovilla-login] Error:", err.message ?? err);
  process.exit(1);
});
