import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const mockGetSession = vi.fn();
const cancelQstashMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession: () => mockGetSession(),
  unauthorized: () =>
    new Response(JSON.stringify({ ok: false, error: "No autenticado" }), {
      status: 401,
    }),
  forbidden: () =>
    new Response(JSON.stringify({ ok: false, error: "Sin permisos" }), {
      status: 403,
    }),
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
}));

vi.mock("@/lib/nota-encargo/schedule", () => ({
  cancelNotaEncargoQstashSchedules: (...args: unknown[]) =>
    cancelQstashMock(...args),
}));

import { POST } from "../route";

const TEST_PREFIX = `cancel-${Date.now()}`;
const COMERCIAL_ID = `${TEST_PREFIX}-comercial`;
const VISIT_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000);

async function cleanup() {
  const sesiones = await prisma.notaEncargoSession.findMany({
    where: { comercialId: COMERCIAL_ID },
    select: { id: true },
  });
  for (const s of sesiones) {
    await prisma.jobQueue.deleteMany({
      where: { payload: { path: ["sessionId"], equals: s.id } },
    });
    await prisma.event.deleteMany({
      where: { payload: { path: ["sessionId"], equals: s.id } },
    });
  }
  await prisma.notaEncargoSession.deleteMany({
    where: { comercialId: COMERCIAL_ID },
  });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
}

function request(sessionId: string) {
  return new Request(
    `http://localhost/api/captacion/nota-encargo/${sessionId}/cancel`,
    { method: "POST" },
  );
}

async function createSession(state: string = "PENDIENTE_PROPIEDAD") {
  return prisma.notaEncargoSession.create({
    data: {
      comercialId: COMERCIAL_ID,
      propertyCode: null,
      propertyRef: null,
      refCatastral: `TESTCANCEL${TEST_PREFIX}`,
      propietarioPhone: "34600111222",
      visitDateTime: VISIT_DATE,
      state: state as never,
    },
  });
}

beforeEach(async () => {
  mockGetSession.mockResolvedValue({
    userId: `${TEST_PREFIX}-user`,
    role: "comercial",
    comercialId: COMERCIAL_ID,
    nombre: "Comercial Test",
    email: "test@example.com",
  });
  cancelQstashMock.mockResolvedValue({
    formularioDeleted: true,
    matchingCheckDeleted: false,
  });
  await cleanup();
  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial Test",
      ciudad: "Córdoba",
      inmovillaRefCode: "CANC",
    },
  });
});

afterAll(cleanup);

describe("POST /api/captacion/nota-encargo/[id]/cancel", () => {
  it("marca la sesión como CANCELADA, emite evento y borra jobs PENDING", async () => {
    const nota = await createSession("PENDIENTE_PROPIEDAD");
    await prisma.notaEncargoSession.update({
      where: { id: nota.id },
      data: {
        formularioQstashMessageId: "form-msg",
        matchingCheckQstashMessageId: "match-msg",
      },
    });
    await prisma.jobQueue.create({
      data: {
        type: "NOTA_ENCARGO_RECORDATORIO",
        payload: { sessionId: nota.id },
        availableAt: VISIT_DATE,
        idempotencyKey: `nota_encargo_recordatorio:${nota.id}`,
      },
    });

    const response = await POST(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe(nota.id);
    expect(body.previousState).toBe("PENDIENTE_PROPIEDAD");

    const refreshed = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: nota.id },
    });
    expect(refreshed.state).toBe("CANCELADA");

    const remainingJobs = await prisma.jobQueue.findMany({
      where: {
        payload: { path: ["sessionId"], equals: nota.id },
        status: "PENDING",
      },
    });
    expect(remainingJobs.length).toBe(0);

    const cancelEvent = await prisma.event.findFirst({
      where: {
        type: "NOTA_ENCARGO_CANCELADA",
        payload: { path: ["sessionId"], equals: nota.id },
      },
    });
    expect(cancelEvent).not.toBeNull();
    expect(cancelQstashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: nota.id,
        formularioQstashMessageId: "form-msg",
        matchingCheckQstashMessageId: "match-msg",
      }),
    );
  });

  it("es idempotente: devuelve 200 si ya está CANCELADA y no emite evento duplicado", async () => {
    const nota = await createSession("CANCELADA");

    const response = await POST(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.alreadyCancelled).toBe(true);

    const events = await prisma.event.count({
      where: {
        type: "NOTA_ENCARGO_CANCELADA",
        payload: { path: ["sessionId"], equals: nota.id },
      },
    });
    expect(events).toBe(0);
  });

  it("rechaza con 404 si la sesión no existe", async () => {
    const response = await POST(request("inexistente"), {
      params: Promise.resolve({ id: "inexistente" }),
    });
    expect(response.status).toBe(404);
  });

  it("rechaza con 403 si la sesión pertenece a otro comercial", async () => {
    const nota = await createSession("PENDIENTE_PROPIEDAD");
    mockGetSession.mockResolvedValue({
      userId: `${TEST_PREFIX}-otro-user`,
      role: "comercial",
      comercialId: `${TEST_PREFIX}-otro-comercial`,
      nombre: "Otro",
      email: "otro@example.com",
    });

    const response = await POST(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(403);

    const refreshed = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: nota.id },
    });
    expect(refreshed.state).toBe("PENDIENTE_PROPIEDAD");
  });

  it("permite a un CEO cancelar sesiones de otro comercial", async () => {
    const nota = await createSession("PENDIENTE_PROPIEDAD");
    mockGetSession.mockResolvedValue({
      userId: `${TEST_PREFIX}-ceo-user`,
      role: "ceo",
      comercialId: null,
      nombre: "CEO",
      email: "ceo@example.com",
    });

    const response = await POST(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(200);
    const refreshed = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: nota.id },
    });
    expect(refreshed.state).toBe("CANCELADA");
  });
});
