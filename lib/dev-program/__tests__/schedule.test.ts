import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getWeekNumber,
  getThemeForWeek,
  getIsoDayOfWeek,
  isWorkday,
  isMonday,
  DEV_THEMES,
} from "../types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    comercial: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn().mockResolvedValue({ id: "job-1" }),
}));

describe("getWeekNumber", () => {
  const ref = new Date("2026-04-06T00:00:00Z");

  it("devuelve 0 para el mismo día de referencia", () => {
    expect(getWeekNumber(new Date("2026-04-06T08:30:00Z"), ref)).toBe(0);
  });

  it("devuelve 0 para un día de la primera semana", () => {
    expect(getWeekNumber(new Date("2026-04-10T12:00:00Z"), ref)).toBe(0);
  });

  it("devuelve 1 para la segunda semana", () => {
    expect(getWeekNumber(new Date("2026-04-13T08:00:00Z"), ref)).toBe(1);
  });

  it("devuelve 4 para la quinta semana (ciclo completo)", () => {
    expect(getWeekNumber(new Date("2026-05-04T08:00:00Z"), ref)).toBe(4);
  });

  it("devuelve 0 si la fecha es anterior a la referencia", () => {
    expect(getWeekNumber(new Date("2026-04-01T08:00:00Z"), ref)).toBe(0);
  });
});

describe("getThemeForWeek", () => {
  it("semana 0 = alto_ticket", () => {
    expect(getThemeForWeek(0).id).toBe("alto_ticket");
  });

  it("semana 1 = gestion_rechazo", () => {
    expect(getThemeForWeek(1).id).toBe("gestion_rechazo");
  });

  it("semana 2 = identidad_closer", () => {
    expect(getThemeForWeek(2).id).toBe("identidad_closer");
  });

  it("semana 3 = disciplina_emocional", () => {
    expect(getThemeForWeek(3).id).toBe("disciplina_emocional");
  });

  it("semana 4 vuelve a alto_ticket (ciclo)", () => {
    expect(getThemeForWeek(4).id).toBe("alto_ticket");
  });

  it("semana 7 = disciplina_emocional (segundo ciclo)", () => {
    expect(getThemeForWeek(7).id).toBe("disciplina_emocional");
  });

  it("los 4 temas existen con id, label y description", () => {
    for (const theme of DEV_THEMES) {
      expect(theme.id).toBeTruthy();
      expect(theme.label).toBeTruthy();
      expect(theme.description).toBeTruthy();
    }
  });
});

describe("getIsoDayOfWeek", () => {
  it("lunes = 1", () => {
    expect(getIsoDayOfWeek(new Date("2026-04-06T12:00:00Z"))).toBe(1);
  });

  it("viernes = 5", () => {
    expect(getIsoDayOfWeek(new Date("2026-04-10T12:00:00Z"))).toBe(5);
  });

  it("domingo = 7", () => {
    expect(getIsoDayOfWeek(new Date("2026-04-12T12:00:00Z"))).toBe(7);
  });
});

describe("isWorkday", () => {
  it("lunes es laborable", () => {
    expect(isWorkday(new Date("2026-04-06T12:00:00Z"))).toBe(true);
  });

  it("viernes es laborable", () => {
    expect(isWorkday(new Date("2026-04-10T12:00:00Z"))).toBe(true);
  });

  it("sábado no es laborable", () => {
    expect(isWorkday(new Date("2026-04-11T12:00:00Z"))).toBe(false);
  });

  it("domingo no es laborable", () => {
    expect(isWorkday(new Date("2026-04-12T12:00:00Z"))).toBe(false);
  });
});

describe("isMonday", () => {
  it("lunes es lunes", () => {
    expect(isMonday(new Date("2026-04-06T12:00:00Z"))).toBe(true);
  });

  it("martes no es lunes", () => {
    expect(isMonday(new Date("2026-04-07T12:00:00Z"))).toBe(false);
  });
});

describe("scheduleDevExercises", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no encola en fin de semana", async () => {
    const { scheduleDevExercises } = await import("../schedule");
    const saturday = new Date("2026-04-11T08:30:00Z");
    const result = await scheduleDevExercises(saturday);
    expect(result.nudgesEnqueued).toBe(0);
    expect(result.comercialesScanned).toBe(0);
  });

  it("encola 1 nudge DAILY por comercial en día no-lunes", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { enqueueJob } = await import("@/lib/job-queue");

    vi.mocked(prisma.comercial.findMany).mockResolvedValue([
      { id: "com-1", nombre: "Ana", telefono: "612345678" },
      { id: "com-2", nombre: "Pedro", telefono: "698765432" },
    ] as never);

    const { scheduleDevExercises } = await import("../schedule");
    const tuesday = new Date("2026-04-07T08:30:00Z");
    const result = await scheduleDevExercises(tuesday);

    expect(result.comercialesScanned).toBe(2);
    expect(result.nudgesEnqueued).toBe(2);
    expect(vi.mocked(enqueueJob)).toHaveBeenCalledTimes(2);

    const firstCall = vi.mocked(enqueueJob).mock.calls[0][0];
    expect(firstCall.idempotencyKey).toContain("DAILY");
  });

  it("encola 2 nudges (DAILY + WEEKLY_CHALLENGE) por comercial los lunes", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { enqueueJob } = await import("@/lib/job-queue");

    vi.mocked(prisma.comercial.findMany).mockResolvedValue([
      { id: "com-1", nombre: "Ana", telefono: "612345678" },
    ] as never);

    const { scheduleDevExercises } = await import("../schedule");
    const monday = new Date("2026-04-06T08:30:00Z");
    const result = await scheduleDevExercises(monday);

    expect(result.nudgesEnqueued).toBe(2);
    expect(vi.mocked(enqueueJob)).toHaveBeenCalledTimes(2);

    const keys = vi.mocked(enqueueJob).mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys.some((k) => k.includes("DAILY"))).toBe(true);
    expect(keys.some((k) => k.includes("WEEKLY_CHALLENGE"))).toBe(true);
  });

  it("skip comerciales sin teléfono", async () => {
    const { prisma } = await import("@/lib/prisma");
    const { enqueueJob } = await import("@/lib/job-queue");

    vi.mocked(prisma.comercial.findMany).mockResolvedValue([
      { id: "com-1", nombre: "Sin Tel", telefono: "" },
    ] as never);

    const { scheduleDevExercises } = await import("../schedule");
    const tuesday = new Date("2026-04-07T08:30:00Z");
    const result = await scheduleDevExercises(tuesday);

    expect(result.skipped).toBe(1);
    expect(result.nudgesEnqueued).toBe(0);
    expect(vi.mocked(enqueueJob)).not.toHaveBeenCalled();
  });
});
