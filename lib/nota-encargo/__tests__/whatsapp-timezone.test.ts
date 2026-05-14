/**
 * Test de regresión para el bug de zona horaria en mensajes de Nota de Encargo.
 *
 * Caso real: una nota se agenda para las 17:00 hora civil de Madrid. El
 * servidor (Vercel) corre con TZ=UTC. Si las funciones de envío no fijan
 * `timeZone: "Europe/Madrid"`, el propietario recibe la hora UTC (15:00) en
 * lugar de la hora local española (17:00).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { sendTemplateMock } = vi.hoisted(() => ({
  sendTemplateMock: vi.fn().mockResolvedValue({ messages: [{ id: "wamid" }] }),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendTemplateMessage: sendTemplateMock,
  sendInteractiveMessage: vi.fn(),
  sendDocumentMessage: vi.fn(),
}));

import {
  sendNotaEncargoRecordatorio,
  sendNotaEncargoNoConfirmada,
} from "../whatsapp";

const originalTZ = process.env.TZ;

beforeEach(() => {
  sendTemplateMock.mockClear();
  // Reproducimos el entorno del worker en Vercel (TZ=UTC).
  process.env.TZ = "UTC";
});

afterAll(() => {
  if (originalTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTZ;
  }
});

describe("Nota de Encargo — formato de hora en mensajes (regresión timezone)", () => {
  it("recordatorio: usa hora Europe/Madrid (17:00) aunque el servidor esté en UTC", async () => {
    // 17:00 Madrid en horario de verano (CEST = UTC+2) == 15:00 UTC.
    const visitTime = new Date("2026-05-15T15:00:00.000Z");

    await sendNotaEncargoRecordatorio("34666777888", {
      propertyRef: "URUS01TEST",
      direccion: "Calle Mayor 1",
      visitTime,
    });

    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    const template = sendTemplateMock.mock.calls[0][1];
    const horaParam = template.components[0].parameters[0].text as string;
    expect(horaParam).toBe("17:00");
  });

  it("no confirmada: usa hora Europe/Madrid", async () => {
    // 18:30 Madrid CET (invierno, UTC+1) == 17:30 UTC.
    const visitTime = new Date("2026-01-15T17:30:00.000Z");

    await sendNotaEncargoNoConfirmada("34666777888", {
      propertyRef: "URUS02TEST",
      direccion: null,
      visitTime,
    });

    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    const template = sendTemplateMock.mock.calls[0][1];
    const horaParam = template.components[0].parameters[0].text as string;
    expect(horaParam).toBe("18:30");
  });
});
