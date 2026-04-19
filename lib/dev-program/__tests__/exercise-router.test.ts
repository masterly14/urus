import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    devProgramExercise: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    comercial: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    commercialVisitFact: { count: vi.fn().mockResolvedValue(0) },
    operacion: { count: vi.fn().mockResolvedValue(0) },
    commercialOperationFact: { count: vi.fn().mockResolvedValue(0) },
  },
}));

const mockSendTextMessage = vi.fn().mockResolvedValue({
  messaging_product: "whatsapp",
  contacts: [],
  messages: [{ id: "msg-1" }],
});
vi.mock("@/lib/whatsapp", () => ({
  sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
}));

const mockGenerateExercise = vi.fn().mockResolvedValue(
  "Antes de tu primera llamada, escribe el precio en un post-it.",
);
vi.mock("../generate-exercise", () => ({
  generateExercise: (...args: unknown[]) => mockGenerateExercise(...args),
}));

import {
  isExerciseRequest,
  isExerciseCompletion,
  handleExerciseRequest,
  handleExerciseCompletion,
  routeToDevProgramIfApplicable,
} from "../exercise-router";
import { prisma } from "@/lib/prisma";
import type { Event } from "@/types/domain";

function mockEvent(overrides?: Partial<Event>): Event {
  return {
    id: "evt-1",
    position: BigInt(1),
    type: "WHATSAPP_RECIBIDO",
    aggregateType: "WHATSAPP_CONVERSATION",
    aggregateId: "34612345678",
    payload: {},
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
    version: null,
    ...overrides,
  } as Event;
}

describe("isExerciseRequest", () => {
  it("detecta '/coach ejercicio'", () => {
    expect(isExerciseRequest("/coach ejercicio")).toBe(true);
  });

  it("detecta 'coach ejercicio' sin barra", () => {
    expect(isExerciseRequest("coach ejercicio")).toBe(true);
  });

  it("detecta con texto extra", () => {
    expect(isExerciseRequest("/coach ejercicio por favor")).toBe(true);
  });

  it("no detecta '/coach' solo (es bot mental)", () => {
    expect(isExerciseRequest("/coach")).toBe(false);
  });

  it("no detecta texto genérico", () => {
    expect(isExerciseRequest("quiero hacer un ejercicio")).toBe(false);
  });

  it("no detecta '/coach estoy bloqueado'", () => {
    expect(isExerciseRequest("/coach estoy bloqueado")).toBe(false);
  });
});

describe("isExerciseCompletion", () => {
  it("detecta 'hecho'", () => {
    expect(isExerciseCompletion("hecho")).toBe(true);
  });

  it("detecta 'listo'", () => {
    expect(isExerciseCompletion("listo")).toBe(true);
  });

  it("detecta 'completado'", () => {
    expect(isExerciseCompletion("completado")).toBe(true);
  });

  it("detecta con exclamación", () => {
    expect(isExerciseCompletion("hecho!")).toBe(true);
  });

  it("no detecta frases largas", () => {
    expect(isExerciseCompletion("ya está hecho el ejercicio")).toBe(false);
  });

  it("no detecta texto genérico", () => {
    expect(isExerciseCompletion("hola")).toBe(false);
  });
});

describe("handleExerciseRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("genera y envía ejercicio cuando hay uno pendiente (NUDGE_SENT)", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst)
      .mockResolvedValueOnce({
        id: "ex-1",
        comercialId: "com-1",
        waId: "34612345678",
        type: "DAILY",
        theme: "alto_ticket",
        weekNumber: 0,
        dayOfWeek: 2,
        status: "NUDGE_SENT",
        exerciseContent: null,
        nudgeSentAt: new Date(),
        deliveredAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

    const result = await handleExerciseRequest(mockEvent(), "34612345678");

    expect(result.success).toBe(true);
    expect(mockGenerateExercise).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);

    const exerciseMsg = mockSendTextMessage.mock.calls[0][1];
    expect(exerciseMsg).toContain("post-it");

    expect(vi.mocked(prisma.devProgramExercise.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ex-1" },
        data: expect.objectContaining({
          status: "DELIVERED",
          exerciseContent: expect.any(String),
        }),
      }),
    );
  });

  it("informa si ya se entregó el ejercicio de hoy", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "ex-2",
        status: "DELIVERED",
      } as never);

    const result = await handleExerciseRequest(mockEvent(), "34612345678");

    expect(result.success).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage.mock.calls[0][1]).toContain("Ya tienes el ejercicio");
  });

  it("informa si no hay ejercicio pendiente hoy", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await handleExerciseRequest(mockEvent(), "34612345678");

    expect(result.success).toBe(true);
    expect(mockSendTextMessage).toHaveBeenCalledTimes(1);
    expect(mockSendTextMessage.mock.calls[0][1]).toContain("no hay ejercicio pendiente");
  });
});

describe("handleExerciseCompletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marca como completado si hay ejercicio DELIVERED hoy", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst).mockResolvedValue({
      id: "ex-3",
      status: "DELIVERED",
      type: "DAILY",
      theme: "gestion_rechazo",
    } as never);

    const result = await handleExerciseCompletion(mockEvent(), "34612345678");

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);

    expect(vi.mocked(prisma.devProgramExercise.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ex-3" },
        data: expect.objectContaining({
          status: "COMPLETED",
          completedAt: expect.any(Date),
        }),
      }),
    );

    expect(mockSendTextMessage).toHaveBeenCalledWith(
      "34612345678",
      "Anotado. Mañana más.",
    );
  });

  it("retorna null si no hay ejercicio DELIVERED hoy", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst).mockResolvedValue(null);

    const result = await handleExerciseCompletion(mockEvent(), "34612345678");
    expect(result).toBeNull();
  });
});

describe("routeToDevProgramIfApplicable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routea '/coach ejercicio' al handler de ejercicios", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await routeToDevProgramIfApplicable(
      mockEvent(),
      "/coach ejercicio",
      "34612345678",
    );

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it("routea 'hecho' si hay ejercicio delivered", async () => {
    vi.mocked(prisma.devProgramExercise.findFirst).mockResolvedValue({
      id: "ex-4",
      status: "DELIVERED",
      type: "DAILY",
      theme: "alto_ticket",
    } as never);

    const result = await routeToDevProgramIfApplicable(
      mockEvent(),
      "hecho",
      "34612345678",
    );

    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
  });

  it("retorna null para mensajes no relacionados", async () => {
    const result = await routeToDevProgramIfApplicable(
      mockEvent(),
      "hola, ¿cómo estás?",
      "34612345678",
    );
    expect(result).toBeNull();
  });

  it("retorna null para '/coach' sin 'ejercicio' (eso es bot mental)", async () => {
    const result = await routeToDevProgramIfApplicable(
      mockEvent(),
      "/coach",
      "34612345678",
    );
    expect(result).toBeNull();
  });
});
