import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendNotaEncargoFormularioForSession } from "../send";

const TEST_PREFIX = `send-${Date.now()}`;
const COMERCIAL_ID = `${TEST_PREFIX}-comercial`;

async function cleanup() {
  await prisma.notaEncargoSession.deleteMany({
    where: { comercialId: COMERCIAL_ID },
  });
  await prisma.comercial.deleteMany({ where: { id: COMERCIAL_ID } });
}

beforeEach(async () => {
  await cleanup();
  await prisma.comercial.create({
    data: {
      id: COMERCIAL_ID,
      nombre: "Comercial Test",
      ciudad: "Córdoba",
      inmovillaRefCode: "SND",
    },
  });
});

afterAll(cleanup);

describe("sendNotaEncargoFormularioForSession scheduleGeneration", () => {
  it("devuelve noop_stale_schedule cuando la generation no coincide", async () => {
    const session = await prisma.notaEncargoSession.create({
      data: {
        comercialId: COMERCIAL_ID,
        propietarioPhone: "34600111222",
        visitDateTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        state: "PENDING",
        scheduleGeneration: 2,
      },
    });

    const result = await sendNotaEncargoFormularioForSession(session.id, {
      scheduleGeneration: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("noop_stale_schedule");
    }
  });
});
