import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname } from "path";
import { chromium, type Cookie } from "playwright";
import { extractSession } from "./session";
import type { InmovillaSession } from "./types";

const PANEL_ENTRY_URL = "https://crm.inmovilla.com/panel/";
const VIEWPORT = { width: 1280, height: 800 };

function defaultSessionFilePath(): string {
  const fromEnv = process.env.INMOVILLA_SESSION_FILE?.trim();
  if (fromEnv) return fromEnv;
  return `${process.cwd()}/.inmovilla-session.json`;
}

function isInmovillaSession(value: unknown): value is InmovillaSession {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (
    typeof o.l !== "string" ||
    typeof o.idPestanya !== "string" ||
    typeof o.miid !== "string" ||
    typeof o.idUsuario !== "string" ||
    typeof o.numAgencia !== "string" ||
    !Array.isArray(o.cookies)
  ) {
    return false;
  }
  for (const c of o.cookies) {
    if (!c || typeof c !== "object") return false;
    const ck = c as Record<string, unknown>;
    if (
      typeof ck.name !== "string" ||
      typeof ck.value !== "string" ||
      typeof ck.domain !== "string" ||
      typeof ck.path !== "string" ||
      typeof ck.expires !== "number" ||
      typeof ck.httpOnly !== "boolean" ||
      typeof ck.secure !== "boolean" ||
      (ck.sameSite !== "Strict" && ck.sameSite !== "Lax" && ck.sameSite !== "None")
    ) {
      return false;
    }
  }
  return true;
}

function toPlaywrightCookies(session: InmovillaSession): Cookie[] {
  return session.cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
  }));
}

export function getInmovillaSessionFilePath(): string {
  return defaultSessionFilePath();
}

export async function loadInmovillaSessionFromFile(
  filePath = getInmovillaSessionFilePath(),
): Promise<InmovillaSession | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isInmovillaSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveInmovillaSessionToFile(
  session: InmovillaSession,
  filePath = getInmovillaSessionFilePath(),
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  await rename(tmp, filePath);
}

export type RestoreInmovillaSessionOptions = {
  headless?: boolean;
  timeoutMs?: number;
};

/**
 * Abre Chromium, inyecta cookies guardadas y comprueba si la sesión sigue válida
 * en /panel/ (mismas variables globales que usa extractSession).
 */
export async function tryRestoreInmovillaSession(
  filePath = getInmovillaSessionFilePath(),
  options: RestoreInmovillaSessionOptions = {},
): Promise<InmovillaSession | null> {
  const stored = await loadInmovillaSessionFromFile(filePath);
  if (!stored) return null;

  const headless = options.headless ?? true;
  const timeoutMs = options.timeoutMs ?? 60_000;

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      locale: "es-ES",
    });
    context.setDefaultTimeout(timeoutMs);
    await context.addCookies(toPlaywrightCookies(stored));
    const page = await context.newPage();
    await page.goto(PANEL_ENTRY_URL, { waitUntil: "domcontentloaded" });

    const url = page.url();
    if (url.includes("/login")) {
      console.log("[login] Sesión en disco inválida — redirección a login.");
      return null;
    }

    try {
      const session = await extractSession(page, context);
      await saveInmovillaSessionToFile(session, filePath);
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[login] No se pudo reutilizar sesión en disco:", msg);
      return null;
    }
  } finally {
    await browser.close();
  }
}
