import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

const mockGetSession = vi.fn();
const publishJSONMock = vi.fn();
const deleteQstashMock = vi.fn();

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

vi.mock("@upstash/qstash", () => ({
  Client: class MockQstashClient {
    publishJSON = publishJSONMock;
  },
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: () => "https://example.com",
}));

vi.mock("@/lib/qstash/delete-message", () => ({
  deleteQstashMessage: (...args: unknown[]) => deleteQstashMock(...args),
}));

import { POST } from "../route";

const TEST_PREFIX = `reschedule-${Date.now()}`;
const COMERCIAL_ID = `${TEST_PREFIX}-comercial`;
const VISIT_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000);
const NEW_VISIT_DATE = new Date(Date.now() + 72 * 60 * 60 * 1000);

async function cleanup() {
  const sesiones = await prisma.notaEncargoSession.findMany({
    where: { comercialId: COMERCIAL_ID },
    select: { id: true },
  });
  for (const s of sesiones) {
    await prisma.event.deleteMany({
      where: { payload: { path: ["sessionId"], equals: s.id } },
    });
  }
  await prisma.notaEncargoSession.deleteMany({
    where: { comercialId: COMERCIAL_ID },
  });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
}

function request(sessionId: string, visitDateTime: string) {
  return new Request(
    `http://localhost/api/captacion/nota-encargo/${sessionId}/reschedule`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitDateTime }),
    },
  );
}

async function createSession(
  state: string = "PENDING",
  visitDateTime: Date = VISIT_DATE,
) {
  return prisma.notaEncargoSession.create({
    data: {
      comercialId: COMERCIAL_ID,
      propertyCode: "PROP123",
      propertyRef: "URUS123",
      refCatastral: `TESTRESCH${TEST_PREFIX}`,
      propietarioPhone: "34600111222",
      visitDateTime,
      state: state as never,
      formularioQstashMessageId: "old-form-msg",
      matchingCheckQstashMessageId: null,
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
  publishJSONMock.mockReset();
  publishJSONMock.mockResolvedValue({ messageId: "new-form-msg" });
  deleteQstashMock.mockReset();
  deleteQstashMock.mockResolvedValue(true);
  process.env.QSTASH_TOKEN = "test-token";
  await cleanup();
  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial Test",
      ciudad: "Córdoba",
      inmovillaRefCode: "RSC",
    },
  });
});

afterAll(cleanup);

describe("POST /api/captacion/nota-encargo/[id]/reschedule", () => {
  it("reprograma una sesión PENDING y emite NOTA_ENCARGO_REPROGRAMADA", async () => {
    const nota = await createSession("PENDING");

    const response = await POST(request(nota.id, NEW_VISIT_DATE.toISOString()), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe(nota.id);
    expect(body.scheduleGeneration).toBe(1);

    const refreshed = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: nota.id },
    });
    expect(refreshed.visitDateTime.toISOString()).toBe(NEW_VISIT_DATE.toISOString());
    expect(refreshed.scheduleGeneration).toBe(1);
    expect(refreshed.formularioQstashMessageId).toBe("new-form-msg");
    expect(deleteQstashMock).toHaveBeenCalledWith("old-form-msg");

    const event = await prisma.event.findFirst({
      where: {
        type: "NOTA_ENCARGO_REPROGRAMADA",
        payload: { path: ["sessionId"], equals: nota.id },
      },
    });
    expect(event).not.toBeNull();
  });

  it("rechaza reprogramar una sesión en FORMULARIO_ENVIADO", async () => {
    const nota = await createSession("FORMULARIO_ENVIADO");

    const response = await POST(request(nota.id, NEW_VISIT_DATE.toISOString()), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(400);
    expect(publishJSONMock).not.toHaveBeenCalled();
  });

  it("rechaza fechas en el pasado", async () => {
    const nota = await createSession("PENDING");
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const response = await POST(request(nota.id, past), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(400);
    expect(publishJSONMock).not.toHaveBeenCalled();
  });

  it("rechaza con 403 si la sesión pertenece a otro comercial", async () => {
    const nota = await createSession("PENDING");
    mockGetSession.mockResolvedValue({
      userId: `${TEST_PREFIX}-otro-user`,
      role: "comercial",
      comercialId: `${TEST_PREFIX}-otro-comercial`,
      nombre: "Otro",
      email: "otro@example.com",
    });

    const response = await POST(request(nota.id, NEW_VISIT_DATE.toISOString()), {
      params: Promise.resolve({ id: nota.id }),
    });

    expect(response.status).toBe(403);
    expect(publishJSONMock).not.toHaveBeenCalled();
  });
});
