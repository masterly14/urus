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

import { POST } from "../route";

const TEST_PREFIX = `nota-api-${Date.now()}`;
const PENDING_REF = "URUS999999VZZTEST";
const EXISTING_REF = "URUS999998VZZTEST";
const VISIT_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
const EPOCH = new Date("2026-01-01T00:00:00.000Z");

async function cleanup() {
  const sessions = await prisma.notaEncargoSession.findMany({
    where: {
      OR: [
        { id: { startsWith: TEST_PREFIX } },
        { comercialId: `${TEST_PREFIX}-comercial` },
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
      ],
    },
  });
  await prisma.notaEncargoSession.deleteMany({
    where: {
      OR: [
        { id: { startsWith: TEST_PREFIX } },
        { comercialId: `${TEST_PREFIX}-comercial` },
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
    where: { id: `${TEST_PREFIX}-comercial` },
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
});

afterAll(async () => {
  await cleanup();
});

describe("POST /api/captacion/nota-encargo", () => {
  it("crea sesión pendiente cuando la referencia aún no existe", async () => {
    const response = await POST(
      request({
        propertyRef: PENDING_REF,
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
    expect(session.propertyRef).toBe(PENDING_REF);
    expect(session.state).toBe("PENDIENTE_PROPIEDAD");

    const matchingJob = await prisma.jobQueue.findFirst({
      where: {
        type: "NOTA_ENCARGO_MATCHING_CHECK",
        payload: { path: ["sessionId"], equals: session.id },
      },
    });
    expect(matchingJob).not.toBeNull();
  });

  it("vincula inmediatamente si la referencia ya existe en PropertyCurrent", async () => {
    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-prop`,
        ref: EXISTING_REF,
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
        propertyRef: EXISTING_REF,
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
    expect(session.state).toBe("PENDING");
    expect(session.precio).toBe(300000);
  });

  it("rechaza formato de referencia inválido", async () => {
    const response = await POST(
      request({
        propertyRef: "ABC123",
        propietarioPhone: "600111222",
        visitDateTime: VISIT_DATE,
      }),
    );

    expect(response.status).toBe(400);
  });
});
