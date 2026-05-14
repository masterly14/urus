import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const mockGetSession = vi.fn();

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

import { DELETE } from "../route";

const TEST_PREFIX = `delete-${Date.now()}`;
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
    await prisma.propertyCurrent.updateMany({
      where: { notaEncargoSessionId: s.id },
      data: { notaEncargoSessionId: null },
    });
  }
  await prisma.notaEncargoSession.deleteMany({
    where: { comercialId: COMERCIAL_ID },
  });
  await prisma.propertyCurrent.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
}

function request(sessionId: string) {
  return new Request(
    `http://localhost/api/captacion/nota-encargo/${sessionId}/delete`,
    { method: "DELETE" },
  );
}

async function createSession(state: string = "CANCELADA") {
  return prisma.notaEncargoSession.create({
    data: {
      comercialId: COMERCIAL_ID,
      propertyCode: null,
      propertyRef: null,
      refCatastral: `TESTDELETE${TEST_PREFIX}`,
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
  await cleanup();
  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial Test",
      ciudad: "Córdoba",
      inmovillaRefCode: "DELE",
    },
  });
});

afterAll(cleanup);

describe("DELETE /api/captacion/nota-encargo/[id]/delete", () => {
  it("elimina definitivamente una nota CANCELADA y limpia referencias", async () => {
    const nota = await createSession("CANCELADA");

    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-prop`,
        ref: `${TEST_PREFIX}-ref`,
        tipoOfer: "Venta",
        precio: 200000,
        ciudad: "Córdoba",
        zona: "Centro",
        agente: "",
        comercialId: COMERCIAL_ID,
        notaEncargoSessionId: nota.id,
        lastEventId: `${TEST_PREFIX}-event`,
        lastEventPosition: BigInt(1),
        lastEventAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    await prisma.jobQueue.create({
      data: {
        type: "NOTA_ENCARGO_RECORDATORIO",
        payload: { sessionId: nota.id },
        availableAt: VISIT_DATE,
        idempotencyKey: `nota_encargo_recordatorio:${nota.id}:delete`,
      },
    });

    await prisma.event.create({
      data: {
        type: "NOTA_ENCARGO_CANCELADA",
        aggregateType: "PROPERTY",
        aggregateId: nota.id,
        payload: { sessionId: nota.id, test: true },
      },
    });

    const response = await DELETE(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(200);

    const deleted = await prisma.notaEncargoSession.findUnique({
      where: { id: nota.id },
    });
    expect(deleted).toBeNull();

    const property = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${TEST_PREFIX}-prop` },
      select: { notaEncargoSessionId: true },
    });
    expect(property?.notaEncargoSessionId).toBeNull();
  });

  it("rechaza eliminar si no está CANCELADA", async () => {
    const nota = await createSession("PENDIENTE_PROPIEDAD");
    const response = await DELETE(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });
    expect(response.status).toBe(409);
  });

  it("rechaza con 403 si la sesión pertenece a otro comercial", async () => {
    const nota = await createSession("CANCELADA");
    mockGetSession.mockResolvedValue({
      userId: `${TEST_PREFIX}-otro-user`,
      role: "comercial",
      comercialId: `${TEST_PREFIX}-otro-comercial`,
      nombre: "Otro",
      email: "otro@example.com",
    });

    const response = await DELETE(request(nota.id), {
      params: Promise.resolve({ id: nota.id }),
    });
    expect(response.status).toBe(403);
  });
});

