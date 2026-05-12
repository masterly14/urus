import { createBrowser } from "../../playwright/browser";
import { getInmovilla2FACode } from "../../composio/get-inmovilla-2fa-code";
import {
  getInmovillaSessionFilePath,
  saveInmovillaSessionToFile,
  tryRestoreInmovillaSession,
} from "./persist-session";
import { saveSessionToDb } from "./session-store";
import { extractSession } from "./session";
import type { InmovillaSession, InmovillaLoginOptions } from "./types";

const LOGIN_URL = "https://crm.inmovilla.com/login/es";
const PANEL_GLOB = "**/panel/**";

const DEFAULT_2FA_DELAY_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 90_000;
const RETRY_EXTRA_DELAY_MS = 5_000;
/** Tras credenciales OK: tiempo máximo para detectar si Inmovilla redirige al panel sin pedir 2FA. */
const DIRECT_PANEL_DETECTION_MS = 30_000;
type LoginPage = Awaited<ReturnType<typeof createBrowser>>["page"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable de entorno ${name} no configurada`);
  return value;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function clickVisibleResendButton(page: LoginPage): Promise<boolean> {
  const candidates = [
    page.locator("#twoFASectionInitialError #btn-2fa--send-again"),
    page.getByRole("button", { name: /reenviar código/i }),
    page.getByRole("button", { name: /reintentar/i }),
    page.locator("#btn-2fa--send-again"),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count();
    for (let i = 0; i < count; i++) {
      const button = candidate.nth(i);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        return true;
      }
    }
  }

  return false;
}

export async function loginToInmovilla(
  options: InmovillaLoginOptions = {},
): Promise<InmovillaSession> {
  const {
    headless = false,
    twoFADelayMs = DEFAULT_2FA_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    persistSession = true,
    sessionFile: sessionFileOpt,
    forceFreshLogin = false,
  } = options;

  const sessionFile = sessionFileOpt ?? getInmovillaSessionFilePath();

  if (persistSession && !forceFreshLogin) {
    const restored = await tryRestoreInmovillaSession(sessionFile, {
      headless,
      timeoutMs,
    });
    if (restored) {
      console.log(
        "[login] Sesión reutilizada desde disco — login interactivo omitido.",
      );
      return restored;
    }
  }

  const user = requireEnv("INMOVILLA_USER");
  const password = requireEnv("INMOVILLA_PASSWORD");
  const officeKey = requireEnv("INMOVILLA_OFFICE_KEY");

  const { browser, context, page } = await createBrowser(headless);
  context.setDefaultTimeout(timeoutMs);

  try {
    // --- Paso 1: Credenciales ---
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

    const officeInput = page.locator("#claveofi");
    if (!(await officeInput.isVisible()))
      throw new Error("No se encontró el campo #claveofi en la página de login");
    await officeInput.fill(officeKey);

    const userInput = page.locator("#user");
    if (!(await userInput.isVisible()))
      throw new Error("No se encontró el campo #user en la página de login");
    await userInput.fill(user);

    const passInput = page.locator("#pass");
    if (!(await passInput.isVisible()))
      throw new Error("No se encontró el campo #pass en la página de login");
    await passInput.fill(password);

    const submitBtn = page.locator('#entrar');
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("comprueba.php") && r.status() === 200,
      { timeout: 30_000 },
    );
    await submitBtn.click();
    await responsePromise;

    console.log("[login] Paso 1 completado — comprobando si hay acceso directo al panel (sin 2FA)...");

    // --- Cuentas sin 2FA: Inmovilla puede redirigir de inmediato a /panel/ ---
    try {
      await page.waitForURL(PANEL_GLOB, { timeout: DIRECT_PANEL_DETECTION_MS });
      console.log(
        "[login] Panel alcanzado sin pantalla 2FA — omitiendo Composio y entrada de código OTP.",
      );
      const session = await extractSession(page, context);
      if (persistSession) {
        await saveInmovillaSessionToFile(session, sessionFile);
      }
      await saveSessionToDb(session, "login-direct").catch((err) =>
        console.warn("[login] No se pudo guardar sesión en DB:", err),
      );
      console.log("[login] Sesión extraída correctamente.");
      return session;
    } catch {
      console.log(
        "[login] Sin redirección al panel en el plazo esperado — continuando con flujo 2FA (Composio + OTP).",
      );
    }

    const twoFASentAt = new Date();
    console.log("[login] Esperando correo 2FA...");

    // --- Delay pre-2FA ---
    await delay(twoFADelayMs);

    // --- Obtener código 2FA (con ventana temporal y reenvío) ---
    let code: string;
    try {
      code = await getInmovilla2FACode(twoFASentAt);
    } catch {
      console.log("[login] Código no encontrado — reenviando código...");
      if (await clickVisibleResendButton(page)) {
        console.log("[login] Click en 'Reenviar código' — esperando...");
      } else {
        console.log(
          "[login] No se encontró botón visible de reenvío; continuando con reintento de lectura de código.",
        );
      }
      const resendAt = new Date();
      await delay(RETRY_EXTRA_DELAY_MS);
      try {
        code = await getInmovilla2FACode(resendAt);
      } catch {
        console.log("[login] Segundo intento fallido — último reintento...");
        await delay(RETRY_EXTRA_DELAY_MS);
        code = await getInmovilla2FACode(resendAt);
      }
    }

    console.log("[login] Código 2FA obtenido — verificando...");

    // --- Paso 2: Introducir código 2FA en inputs OTP individuales ---
    const firstOtpInput = page.locator('input[maxlength="1"]').first();
    await firstOtpInput.waitFor({ state: "visible", timeout: 15_000 });

    await firstOtpInput.click();
    await page.keyboard.type(code, { delay: 100 });

    // --- Esperar navegación al panel ---
    await page.waitForURL(PANEL_GLOB, { timeout: 30_000 });
    console.log("[login] Navegación a /panel/ exitosa — extrayendo sesión...");

    // --- Extraer sesión ---
    const session = await extractSession(page, context);
    if (persistSession) {
      await saveInmovillaSessionToFile(session, sessionFile);
    }
    await saveSessionToDb(session, "login-2fa").catch((err) =>
      console.warn("[login] No se pudo guardar sesión en DB:", err),
    );

    console.log("[login] Sesión extraída correctamente.");
    return session;
  } finally {
    await browser.close();
  }
}
