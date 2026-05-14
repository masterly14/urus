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

const { scheduleInitialMock } = vi.hoisted(() => ({
  scheduleInitialMock: vi.fn(),
}));

vi.mock("@/lib/nota-encargo/schedule", () => ({
  scheduleNotaEncargoInitialSteps: scheduleInitialMock,
  publishNotaEncargoRecordatorioSchedule: vi.fn(),
  publishNotaEncargoCheckConfirmacionSchedule: vi.fn(),
  publishNotaEncargoFormularioSchedule: vi.fn(),
  publishNotaEncargoMatchingCheckSchedule: vi.fn(),
}));

import { POST } from "../route";

const TEST_PREFIX = `nota-api-${Date.now()}`;
const PENDING_REF = "URUS999999VZZTEST";
const EXISTING_REF = "URUS999998VZZTEST";
const TEST_CATASTRAL_SUFFIX = Date.now().toString(36).toUpperCase();
const PENDING_CATASTRAL_REF = `TESTPENDING${TEST_CATASTRAL_SUFFIX}`;
const EXISTING_CATASTRAL_REF = `TESTEXISTING${TEST_CATASTRAL_SUFFIX}`;
const VISIT_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
const EPOCH = new Date("2026-01-01T00:00:00.000Z");

async function cleanup() {
  const sessions = await prisma.notaEncargoSession.findMany({
    where: {
      OR: [
        { id: { startsWith: TEST_PREFIX } },
        { comercialId: `${TEST_PREFIX}-comercial` },
        { comercialId: `${TEST_PREFIX}-comercial-alt` },
      ],
    },
    select: { id: true },
  });
  for (const session of sessions) {
    await prisma.jobQueue.deleteMany({
      where: { payload: { path: ["sessionId"], equals: session.id } },
    });
  }
  await prisma.event.deleteMany({
    where: {
      OR: [
        { aggregateId: { startsWith: TEST_PREFIX } },
        { aggregateId: PENDING_REF },
        { aggregateId: EXISTING_REF },
        { aggregateId: PENDING_CATASTRAL_REF },
        { aggregateId: EXISTING_CATASTRAL_REF },
      ],
    },
  });
  await prisma.notaEncargoSession.deleteMany({
    where: {
      OR: [
        { id: { startsWith: TEST_PREFIX } },
        { comercialId: `${TEST_PREFIX}-comercial` },
        { comercialId: `${TEST_PREFIX}-comercial-alt` },
      ],
    },
  });
  await prisma.propertySnapshot.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.propertyCurrent.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.comercial.deleteMany({
    where: { id: { in: [`${TEST_PREFIX}-comercial`, `${TEST_PREFIX}-comercial-alt`] } },
  });
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/captacion/nota-encargo", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = "test";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "test";
  scheduleInitialMock.mockReset();
  scheduleInitialMock.mockResolvedValue({
    recordatorio: { messageId: "msg-1", sendAtIso: "2026-01-01T00:00:00.000Z" },
    matchingCheck: { messageId: "msg-2", sendAtIso: "2026-01-08T00:00:00.000Z" },
  });
  mockGetSession.mockResolvedValue({
    userId: `${TEST_PREFIX}-user`,
    role: "comercial",
    comercialId: `${TEST_PREFIX}-comercial`,
    nombre: "Comercial Test",
    email: "test@example.com",
  });
  await cleanup();
  await prisma.comercial.create({
    data: {
      id: `${TEST_PREFIX}-comercial`,
      nombre: "Comercial Test",
      ciudad: "Córdoba",
      inmovillaRefCode: "ZZTEST",
    },
  });
  await prisma.comercial.create({
    data: {
      id: `${TEST_PREFIX}-comercial-alt`,
      nombre: "Comercial Alt",
      ciudad: "Sevilla",
      inmovillaRefCode: "ZZALT",
    },
  });
});

afterAll(async () => {
  await cleanup();
});

describe("POST /api/captacion/nota-encargo", () => {
  it("crea sesión pendiente cuando la referencia catastral aún no existe", async () => {
    const response = await POST(
      request({
        refCatastral: PENDING_CATASTRAL_REF,
        propietarioPhone: "600111222",
        visitDateTime: VISIT_DATE,
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.linked).toBe(false);

    const session = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: body.sessionId },
    });
    expect(session.propertyCode).toBeNull();
    expect(session.propertyRef).toBeNull();
    expect(session.refCatastral).toBe(PENDING_CATASTRAL_REF);
    expect(session.state).toBe("PENDIENTE_PROPIEDAD");

    expect(scheduleInitialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        withMatchingCheck: true,
      }),
    );
  });

  it("vincula inmediatamente si la referencia catastral ya existe en PropertyCurrent", async () => {
    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-prop`,
        ref: EXISTING_REF,
        refCatastral: EXISTING_CATASTRAL_REF,
        tipoOfer: "Venta",
        precio: 300000,
        ciudad: "Córdoba",
        zona: "Centro",
        agente: "",
        comercialId: `${TEST_PREFIX}-comercial`,
        lastEventId: `${TEST_PREFIX}-event`,
        lastEventPosition: BigInt(1),
        lastEventAt: EPOCH,
      },
    });

    const response = await POST(
      request({
        refCatastral: EXISTING_CATASTRAL_REF,
        propietarioPhone: "600111222",
        visitDateTime: VISIT_DATE,
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.linked).toBe(true);

    const session = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: body.sessionId },
    });
    expect(session.propertyCode).toBe(`${TEST_PREFIX}-prop`);
    expect(session.propertyRef).toBe(EXISTING_REF);
    expect(session.refCatastral).toBe(EXISTING_CATASTRAL_REF);
    expect(session.state).toBe("PENDING");
    expect(session.precio).toBe(300000);
  });

  it("rechaza duplicado activo por referencia catastral", async () => {
    await prisma.notaEncargoSession.create({
      data: {
        comercialId: `${TEST_PREFIX}-comercial`,
        propertyCode: null,
        propertyRef: null,
        refCatastral: PENDING_CATASTRAL_REF,
        propietarioPhone: "34600111222",
        visitDateTime: new Date(VISIT_DATE),
        state: "PENDIENTE_PROPIEDAD",
      },
    });

    const response = await POST(
      request({
        refCatastral: PENDING_CATASTRAL_REF,
        propietarioPhone: "600111222",
        visitDateTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      }),
    );

    expect(response.status).toBe(409);
  });

  it("permite formato no estándar con warning no bloqueante", async () => {
    const response = await POST(
      request({
        refCatastral: "ABC123",
        propietarioPhone: "600111222",
        visitDateTime: VISIT_DATE,
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.warnings[0]).toContain("se guardará igualmente");
  });

  it("si crea un CEO, exige comercialId y asigna la nota al comercial elegido", async () => {
    mockGetSession.mockResolvedValue({
      userId: `${TEST_PREFIX}-ceo-user`,
      role: "ceo",
      comercialId: null,
      nombre: "CEO Test",
      email: "ceo@example.com",
    });

    const missingComercialResponse = await POST(
      request({
        refCatastral: `TESTCEO${TEST_CATASTRAL_SUFFIX}`,
        propietarioPhone: "600111222",
        visitDateTime: VISIT_DATE,
      }),
    );
    expect(missingComercialResponse.status).toBe(400);

    const response = await POST(
      request({
        refCatastral: `TESTCEO${TEST_CATASTRAL_SUFFIX}`,
        propietarioPhone: "600111222",
        visitDateTime: VISIT_DATE,
        comercialId: `${TEST_PREFIX}-comercial-alt`,
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();

    const session = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: body.sessionId },
    });
    expect(session.comercialId).toBe(`${TEST_PREFIX}-comercial-alt`);
  });
});
