import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type UserRole = "ceo" | "admin" | "comercial";

const BASE_URL = (process.env.AUTH_E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.AUTH_E2E_PASSWORD ?? "AuthE2E#12345";
const RUN_ID = `auth-e2e-${Date.now()}`;

const CEO_EMAIL = `${RUN_ID}-ceo@urus.local`;
const ADMIN_EMAIL = `${RUN_ID}-admin@urus.local`;
const COMERCIAL_EMAIL = `${RUN_ID}-comercial@urus.local`;
const COMERCIAL_RECORD_ID = `e2e-${Date.now()}`;

function printResult(ok: boolean, message: string) {
  const icon = ok ? "✓" : "✗";
  console.log(`[${icon}] ${message}`);
}

function assertOrThrow(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function postJson(path: string, body: unknown, cookie?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE_URL,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Some endpoints can return non-JSON responses.
  }

  return { response, data };
}

async function get(path: string, cookie?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: cookie ? { cookie } : undefined,
    redirect: "manual",
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Some endpoints can return non-JSON responses.
  }

  return { response, data };
}

function responseCookies(response: Response): string[] {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  const setCookies = headersWithSetCookie.getSetCookie?.() ?? [];
  if (setCookies.length > 0) return setCookies;

  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function buildCookieHeader(setCookies: string[]): string {
  return setCookies.map((value) => value.split(";")[0]).join("; ");
}

async function ensureUser(email: string, role: UserRole) {
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `Auth E2E ${role.toUpperCase()}`,
    },
  }).catch(() => {
    // Si ya existe, validamos por consulta en DB.
  });

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  assertOrThrow(Boolean(existing), `No se pudo crear usuario ${email}`);

  await prisma.user.update({
    where: { email },
    data: {
      role,
      emailVerified: true,
      ...(role === "comercial" ? { comercialId: COMERCIAL_RECORD_ID } : { comercialId: null }),
    },
  });
}

async function login(email: string): Promise<string> {
  const { response, data } = await postJson("/api/auth/sign-in/email", {
    email,
    password: PASSWORD,
  });

  assertOrThrow(response.ok, `Login falló para ${email}: HTTP ${response.status} ${JSON.stringify(data)}`);

  const cookies = responseCookies(response);
  assertOrThrow(cookies.length > 0, `No llegaron cookies de sesión para ${email}`);
  return buildCookieHeader(cookies);
}

async function main() {
  console.log(`\nAuth security E2E contra ${BASE_URL}`);

  await prisma.comercial.upsert({
    where: { id: COMERCIAL_RECORD_ID },
    create: {
      id: COMERCIAL_RECORD_ID,
      nombre: "Comercial Auth E2E",
      email: COMERCIAL_EMAIL,
      telefono: "34600009999",
      ciudad: "Cordoba",
      activo: true,
      cargaActual: 0,
    },
    update: {},
  });

  await ensureUser(CEO_EMAIL, "ceo");
  await ensureUser(ADMIN_EMAIL, "admin");
  await ensureUser(COMERCIAL_EMAIL, "comercial");

  const ceoCookie = await login(CEO_EMAIL);
  const adminCookie = await login(ADMIN_EMAIL);
  const comercialCookie = await login(COMERCIAL_EMAIL);
  printResult(true, "Usuarios reales creados y autenticados");

  const ceoHealth = await get("/api/configuracion/health", ceoCookie);
  assertOrThrow(ceoHealth.response.status === 200, "CEO no pudo acceder a /api/configuracion/health");
  printResult(true, "CEO accede a ruta de configuración");

  const adminHealth = await get("/api/configuracion/health", adminCookie);
  assertOrThrow(adminHealth.response.status === 200, "Admin no pudo acceder a /api/configuracion/health");
  printResult(true, "Admin accede a ruta de configuración");

  const comercialHealth = await get("/api/configuracion/health", comercialCookie);
  assertOrThrow(comercialHealth.response.status === 403, "Comercial debería recibir 403 en configuración");
  printResult(true, "Comercial bloqueado en ruta CEO/Admin");

  const comercialOperaciones = await get("/api/operaciones?limit=1", comercialCookie);
  assertOrThrow(comercialOperaciones.response.status === 200, "Comercial no pudo acceder a /api/operaciones");
  printResult(true, "Comercial accede a /api/operaciones autenticado");

  const anonOperaciones = await get("/api/operaciones?limit=1");
  assertOrThrow(
    anonOperaciones.response.status === 307 || anonOperaciones.response.status === 401,
    `Anónimo debería estar bloqueado en /api/operaciones, obtuvo ${anonOperaciones.response.status}`,
  );
  printResult(true, "Anónimo bloqueado en /api/operaciones");

  const anonActivos = await get("/api/comerciales/activos");
  assertOrThrow(
    anonActivos.response.status === 401,
    `Anónimo debería recibir 401 en /api/comerciales/activos, obtuvo ${anonActivos.response.status}`,
  );
  printResult(true, "Anónimo bloqueado en /api/comerciales/activos");

  const comercialActivos = await get("/api/comerciales/activos", comercialCookie);
  assertOrThrow(
    comercialActivos.response.status === 200,
    `Comercial autenticado debería acceder a /api/comerciales/activos, obtuvo ${comercialActivos.response.status}`,
  );
  printResult(true, "Comercial accede a /api/comerciales/activos autenticado");

  const anonIncidencia = await postJson("/api/postventa/incidencia", {});
  assertOrThrow(
    anonIncidencia.response.status === 401,
    `Anónimo debería recibir 401 en /api/postventa/incidencia, obtuvo ${anonIncidencia.response.status}`,
  );
  printResult(true, "Anónimo bloqueado en /api/postventa/incidencia");

  const comercialIncidencia = await postJson("/api/postventa/incidencia", {}, comercialCookie);
  assertOrThrow(
    comercialIncidencia.response.status === 400,
    `Autenticado debería pasar auth y caer en validación 400 en /api/postventa/incidencia, obtuvo ${comercialIncidencia.response.status}`,
  );
  printResult(true, "Ruta /api/postventa/incidencia exige auth y valida payload");

  const anonPostVisit = await postJson("/api/post-visit", {});
  assertOrThrow(
    anonPostVisit.response.status === 307 || anonPostVisit.response.status === 401,
    `Anónimo debería estar bloqueado en /api/post-visit, obtuvo ${anonPostVisit.response.status}`,
  );
  printResult(true, "Anónimo bloqueado en /api/post-visit");

  const comercialPostVisit = await postJson("/api/post-visit", {}, comercialCookie);
  assertOrThrow(
    comercialPostVisit.response.status === 400,
    `Autenticado debería pasar auth y caer en validación 400 en /api/post-visit, obtuvo ${comercialPostVisit.response.status}`,
  );
  printResult(true, "Ruta /api/post-visit exige auth y valida payload");

  const anonAgenda = await postJson("/api/agenda", {});
  assertOrThrow(
    anonAgenda.response.status === 307 || anonAgenda.response.status === 401,
    `Anónimo debería estar bloqueado en /api/agenda, obtuvo ${anonAgenda.response.status}`,
  );
  printResult(true, "Anónimo bloqueado en /api/agenda");

  const comercialAgenda = await postJson("/api/agenda", {}, comercialCookie);
  assertOrThrow(
    comercialAgenda.response.status === 400,
    `Autenticado debería pasar auth y caer en validación 400 en /api/agenda, obtuvo ${comercialAgenda.response.status}`,
  );
  printResult(true, "Ruta /api/agenda exige auth y valida payload");

  console.log("\nTodos los checks de seguridad E2E pasaron.");
}

main()
  .catch((error) => {
    console.error(
      "Falló auth security E2E:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [CEO_EMAIL, ADMIN_EMAIL, COMERCIAL_EMAIL] },
      },
    });
    await prisma.comercial.deleteMany({
      where: { id: COMERCIAL_RECORD_ID },
    });
    await prisma.$disconnect();
  });
