import type { Page, BrowserContext } from "playwright";
import type { InmovillaSession } from "./types";

export function generateMiid(numAgencia: string, idUsuario: string): string {
  const now = new Date();
  const ts = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    "_",
    String(now.getMinutes()).padStart(2, "0"),
    "_",
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `${numAgencia}.${idUsuario}.${ts}.${ts}_${numAgencia}`;
}

export async function extractSession(
  page: Page,
  context: BrowserContext,
): Promise<InmovillaSession> {
  const l = await page.evaluate(() => (window as any).ps || "");
  if (!l) throw new Error("No se encontró window.ps (token l) en /panel/");

  const idPestanya = await page.evaluate(
    () => (window as any).id_pestanya || "",
  );
  if (!idPestanya)
    throw new Error("No se encontró window.id_pestanya en /panel/");

  const idUsuario = await page.evaluate(
    () => String((window as any).idusuario ?? ""),
  );
  if (!idUsuario)
    throw new Error("No se encontró la variable idusuario en /panel/");

  const numAgencia = await page.evaluate(
    () => String((window as any).numagencia ?? ""),
  );
  if (!numAgencia)
    throw new Error("No se encontró la variable numagencia en /panel/");

  const miid = generateMiid(numAgencia, idUsuario);

  const rawCookies = await context.cookies();
  const cookies = rawCookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite as "Strict" | "Lax" | "None",
  }));

  return { l, idPestanya, miid, idUsuario, numAgencia, cookies };
}
