/**
 * Tests de integración contra BD real para el flujo de transferencia de
 * comercial al eliminar un usuario.
 *
 * Cubre tres endpoints del Fase 1/2:
 *  - GET  /api/users/:userId/transfer-preview
 *  - GET  /api/comerciales?excludeId=...
 *  - DELETE /api/users/:userId  (con y sin transferTo)
 *  - GET/PATCH /api/sync-tasks* para permisos y cierre
 *
 * Requiere DATABASE_URL apuntando a la BD de desarrollo. Las fixtures usan un
 * prefijo único por ejecución para garantizar aislamiento y cleanup completo.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const mockGetSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

// Evita ejecutar la lógica de caché de Next durante los tests.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) => fn,
}));

// GET /api/comerciales usa isAuthorized (Bearer CRON_SECRET); en tests lo
// dejamos siempre permitido.
vi.mock("@/lib/api/cron-auth", () => ({
  isAuthorized: () => true,
}));

// El endpoint de comerciales pasa por withObservedRoute → es transparente, pero
// importamos los handlers directamente desde el route.
import { DELETE as DELETE_USER } from "@/app/api/users/[userId]/route";
import { GET as GET_PREVIEW } from "@/app/api/users/[userId]/transfer-preview/route";
import { GET as GET_COMERCIALES } from "@/app/api/comerciales/route";
import { GET as GET_SYNC_TASKS } from "@/app/api/sync-tasks/route";
import { PATCH as COMPLETE_SYNC_TASK } from "@/app/api/sync-tasks/[id]/complete/route";

const TEST_PREFIX = `transfer-it-${Date.now()}`;
const EPOCH = new Date("2026-01-01");
const ZERO = BigInt(0);

type Fixtures = {
  ceoUser: { id: string; email: string };
  comercialA: { id: string; nombre: string };
  comercialB: { id: string; nombre: string };
  userA: { id: string; email: string };
  userB: { id: string; email: string };
  propertyCodes: string[];
  demandCodes: string[];
};

async function cleanup() {
  await prisma.manualSyncTask.deleteMany({
    where: {
      OR: [
        { recordCode: { startsWith: TEST_PREFIX } },
        { targetComercialName: { startsWith: TEST_PREFIX } },
      ],
    },
  });
  await prisma.jobQueue.deleteMany({
    where: { idempotencyKey: { startsWith: `transfer-` } },
  });
  await prisma.propertyCurrent.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.demandSnapshot.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.demandCurrent.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TEST_PREFIX } },
  });
  await prisma.comercial.deleteMany({
    where: { nombre: { startsWith: TEST_PREFIX } },
  });
}

async function setupFixtures(): Promise<Fixtures> {
  const ceoUser = await prisma.user.create({
    data: {
      name: `${TEST_PREFIX}-CEO`,
      email: `${TEST_PREFIX}-ceo@test.local`,
      role: "ceo",
    },
  });

  const comercialA = await prisma.comercial.create({
    data: {
      nombre: `${TEST_PREFIX}-ComercialA`,
      ciudad: "Córdoba",
      inmovillaAgentId: null,
    },
  });

  const comercialB = await prisma.comercial.create({
    data: {
      nombre: `${TEST_PREFIX}-ComercialB`,
      ciudad: "Málaga",
      inmovillaAgentId: 990000 + Math.floor(Math.random() * 9000),
    },
  });

  const userA = await prisma.user.create({
    data: {
      name: `${TEST_PREFIX}-UserA`,
      email: `${TEST_PREFIX}-usera@test.local`,
      role: "comercial",
      comercialId: comercialA.id,
    },
  });

  const userB = await prisma.user.create({
    data: {
      name: `${TEST_PREFIX}-UserB`,
      email: `${TEST_PREFIX}-userb@test.local`,
      role: "comercial",
      comercialId: comercialB.id,
    },
  });

  const propertyCodes = [`${TEST_PREFIX}-p1`, `${TEST_PREFIX}-p2`];
  const demandCodes = [`${TEST_PREFIX}-d1`, `${TEST_PREFIX}-d2`];

  for (let i = 0; i < propertyCodes.length; i++) {
    await prisma.propertyCurrent.create({
      data: {
        codigo: propertyCodes[i],
        ref: `URUS${i + 100}VTI`,
        agente: comercialA.nombre,
        comercialId: comercialA.id,
        lastEventId: `evt-${i}`,
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });
  }

  for (let i = 0; i < demandCodes.length; i++) {
    await prisma.demandCurrent.create({
      data: {
        codigo: demandCodes[i],
        ref: `DREF-${i + 100}`,
        tipos: "1",
        agente: comercialA.nombre,
        comercialId: comercialA.id,
        lastEventId: `devt-${i}`,
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });
    await prisma.demandSnapshot.create({
      data: {
        codigo: demandCodes[i],
        ref: `DREF-${i + 100}`,
        raw: { keycli: `${77000 + i}` },
      },
    });
  }

  return {
    ceoUser: { id: ceoUser.id, email: ceoUser.email },
    comercialA: { id: comercialA.id, nombre: comercialA.nombre },
    comercialB: { id: comercialB.id, nombre: comercialB.nombre },
    userA: { id: userA.id, email: userA.email },
    userB: { id: userB.id, email: userB.email },
    propertyCodes,
    demandCodes,
  };
}

function makeDeleteRequest(userId: string, body?: { transferTo?: string }) {
  return new Request(`http://localhost/api/users/${userId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makePreviewRequest(userId: string) {
  return new Request(`http://localhost/api/users/${userId}/transfer-preview`);
}

function makeComercialesRequest(excludeId?: string) {
  const url = new URL("http://localhost/api/comerciales");
  if (excludeId) url.searchParams.set("excludeId", excludeId);
  // El handler usa NextRequest, pero NextRequest extiende Request por lo que
  // se acepta directamente.
  return new Request(url.toString());
}

function makeSyncTasksRequest(search = "") {
  const suffix = search ? `?${search}` : "";
  return new Request(`http://localhost/api/sync-tasks${suffix}`);
}

let fixtures: Fixtures;

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  // Cada test obtiene sus propias fixtures recién creadas.
  await cleanup();
  fixtures = await setupFixtures();
  mockGetSession.mockResolvedValue({
    user: { id: fixtures.ceoUser.id, role: "ceo", name: "CEO Test" },
  });
});

describe("GET /api/users/:userId/transfer-preview", () => {
  it("devuelve los conteos exactos de propiedades y demandas del comercial", async () => {
    const response = await GET_PREVIEW(makePreviewRequest(fixtures.userA.id) as never, {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, propertyCount: 2, demandCount: 2 });
  });

  it("devuelve 0/0 para un usuario sin comercial vinculado", async () => {
    const noComercial = await prisma.user.create({
      data: {
        name: `${TEST_PREFIX}-Solo`,
        email: `${TEST_PREFIX}-solo@test.local`,
        role: "comercial",
      },
    });

    const response = await GET_PREVIEW(makePreviewRequest(noComercial.id) as never, {
      params: Promise.resolve({ userId: noComercial.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, propertyCount: 0, demandCount: 0 });
  });

  it("rechaza con 401 si no hay sesión", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const response = await GET_PREVIEW(makePreviewRequest(fixtures.userA.id) as never, {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });
    expect(response.status).toBe(401);
  });

  it("rechaza con 403 si el rol es comercial", async () => {
    mockGetSession.mockResolvedValueOnce({
      user: { id: fixtures.userB.id, role: "comercial", name: "Comercial" },
    });
    const response = await GET_PREVIEW(makePreviewRequest(fixtures.userA.id) as never, {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });
    expect(response.status).toBe(403);
  });
});

describe("GET /api/comerciales?excludeId", () => {
  it("excluye el comercial especificado de la lista", async () => {
    const response = await GET_COMERCIALES(
      makeComercialesRequest(fixtures.comercialA.id) as never,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const ids = (body.comerciales as Array<{ id: string }>).map((c) => c.id);
    expect(ids).not.toContain(fixtures.comercialA.id);
    expect(ids).toContain(fixtures.comercialB.id);
  });

  it("incluye inmovillaAgentId en la respuesta", async () => {
    const response = await GET_COMERCIALES(
      makeComercialesRequest(fixtures.comercialA.id) as never,
    );
    const body = await response.json();
    const targetB = (body.comerciales as Array<Record<string, unknown>>).find(
      (c) => c.id === fixtures.comercialB.id,
    );
    expect(targetB).toBeDefined();
    expect(targetB).toHaveProperty("inmovillaAgentId");
    expect(typeof targetB!.inmovillaAgentId).toBe("number");
  });
});

describe("DELETE /api/users/:userId sin transferTo", () => {
  it("desvincula propiedades/demandas (comercialId=null) y no crea tareas manuales", async () => {
    const response = await DELETE_USER(makeDeleteRequest(fixtures.userA.id), {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.transferred).toEqual({ properties: 2, demands: 2 });
    expect(body.manualTasks).toEqual({ total: 0, properties: 0, demands: 0 });

    const props = await prisma.propertyCurrent.findMany({
      where: { codigo: { in: fixtures.propertyCodes } },
      select: { comercialId: true },
    });
    expect(props.every((p) => p.comercialId === null)).toBe(true);

    const dems = await prisma.demandCurrent.findMany({
      where: { codigo: { in: fixtures.demandCodes } },
      select: { comercialId: true },
    });
    expect(dems.every((d) => d.comercialId === null)).toBe(true);

    expect(await prisma.user.findUnique({ where: { id: fixtures.userA.id } })).toBeNull();
    expect(await prisma.comercial.findUnique({ where: { id: fixtures.comercialA.id } })).toBeNull();

    const tasks = await prisma.manualSyncTask.findMany({
      where: { recordCode: { in: [...fixtures.propertyCodes, ...fixtures.demandCodes] } },
    });
    expect(tasks).toHaveLength(0);
  });
});

describe("DELETE /api/users/:userId con transferTo", () => {
  it("reasigna propiedades/demandas a comercialB y crea tareas manuales", async () => {
    const response = await DELETE_USER(
      makeDeleteRequest(fixtures.userA.id, { transferTo: fixtures.comercialB.id }),
      { params: Promise.resolve({ userId: fixtures.userA.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.transferred).toEqual({ properties: 2, demands: 2 });
    expect(body.manualTasks).toEqual({ total: 4, properties: 2, demands: 2 });

    // BD local actualizada.
    const props = await prisma.propertyCurrent.findMany({
      where: { codigo: { in: fixtures.propertyCodes } },
      select: { comercialId: true },
    });
    expect(props.every((p) => p.comercialId === fixtures.comercialB.id)).toBe(true);

    const dems = await prisma.demandCurrent.findMany({
      where: { codigo: { in: fixtures.demandCodes } },
      select: { comercialId: true },
    });
    expect(dems.every((d) => d.comercialId === fixtures.comercialB.id)).toBe(true);

    const persistedTasks = await prisma.manualSyncTask.findMany({
      where: {
        recordCode: { in: [...fixtures.propertyCodes, ...fixtures.demandCodes] },
      },
      select: { type: true, status: true, targetComercialId: true, sourceUserId: true },
    });
    expect(persistedTasks).toHaveLength(4);
    expect(persistedTasks.every((task) => task.status === "PENDING")).toBe(true);
    expect(persistedTasks.every((task) => task.targetComercialId === fixtures.comercialB.id)).toBe(true);
    expect(persistedTasks.every((task) => task.sourceUserId === fixtures.userA.id)).toBe(true);
  });
});

describe("API /api/sync-tasks — permisos por rol", () => {
  it("comercial solo ve sus tareas y puede completar las propias", async () => {
    await DELETE_USER(makeDeleteRequest(fixtures.userA.id, { transferTo: fixtures.comercialB.id }), {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });

    mockGetSession.mockResolvedValueOnce({
      user: { id: fixtures.userB.id, role: "comercial", name: "Comercial B" },
    });
    const listResponse = await GET_SYNC_TASKS(makeSyncTasksRequest("status=PENDING") as never);
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.ok).toBe(true);
    expect(listBody.tasks).toHaveLength(4);

    const taskId = (listBody.tasks as Array<{ id: string }>)[0]?.id;
    expect(taskId).toBeTruthy();

    mockGetSession.mockResolvedValueOnce({
      user: { id: fixtures.userB.id, role: "comercial", name: "Comercial B" },
    });
    const completeResponse = await COMPLETE_SYNC_TASK(
      new Request(`http://localhost/api/sync-tasks/${taskId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, note: "validado en Inmovilla" }),
      }) as never,
      { params: Promise.resolve({ id: taskId }) },
    );
    expect(completeResponse.status).toBe(200);

    const completed = await prisma.manualSyncTask.findUnique({
      where: { id: taskId },
      select: { status: true, doneByUserId: true, note: true },
    });
    expect(completed?.status).toBe("DONE");
    expect(completed?.doneByUserId).toBe(fixtures.userB.id);
    expect(completed?.note).toBe("validado en Inmovilla");
  });

  it("rechaza completar tarea si el comercial no es el responsable", async () => {
    await DELETE_USER(makeDeleteRequest(fixtures.userA.id, { transferTo: fixtures.comercialB.id }), {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });

    const outsiderComercial = await prisma.comercial.create({
      data: { nombre: `${TEST_PREFIX}-ComercialC`, ciudad: "Sevilla" },
    });
    const outsiderUser = await prisma.user.create({
      data: {
        name: `${TEST_PREFIX}-UserC`,
        email: `${TEST_PREFIX}-userc@test.local`,
        role: "comercial",
        comercialId: outsiderComercial.id,
      },
    });

    const task = await prisma.manualSyncTask.findFirst({
      where: { targetComercialId: fixtures.comercialB.id },
      select: { id: true },
    });
    expect(task?.id).toBeTruthy();

    mockGetSession.mockResolvedValueOnce({
      user: { id: outsiderUser.id, role: "comercial", name: "Comercial C" },
    });
    const response = await COMPLETE_SYNC_TASK(
      new Request(`http://localhost/api/sync-tasks/${task!.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }) as never,
      { params: Promise.resolve({ id: task!.id }) },
    );
    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/users/:userId — validaciones", () => {
  it("rechaza con 401 si no hay sesión", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const response = await DELETE_USER(makeDeleteRequest(fixtures.userA.id), {
      params: Promise.resolve({ userId: fixtures.userA.id }),
    });
    expect(response.status).toBe(401);
  });

  it("rechaza con 400 si transferTo es el mismo que el comercial eliminado", async () => {
    const response = await DELETE_USER(
      makeDeleteRequest(fixtures.userA.id, { transferTo: fixtures.comercialA.id }),
      { params: Promise.resolve({ userId: fixtures.userA.id }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/no puede ser el mismo/);
  });

  it("rechaza con 400 si transferTo no existe", async () => {
    const response = await DELETE_USER(
      makeDeleteRequest(fixtures.userA.id, { transferTo: "fake-id-inexistente" }),
      { params: Promise.resolve({ userId: fixtures.userA.id }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/destino no encontrado/);
  });
});
