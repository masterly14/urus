import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { syncComercialAssignments } from "@/lib/routing/sync-comercial-assignments";

const TEST_PREFIX = `sync-test-${Date.now()}`;

async function cleanup() {
  await prisma.propertyCurrent.deleteMany({
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

beforeEach(cleanup);
afterAll(cleanup);

const EPOCH = new Date("2026-01-01");
const ZERO = BigInt(0);

describe("syncComercialAssignments", () => {
  it("asigna propiedades sin comercial cuyo refCode coincide", async () => {
    const comercial = await prisma.comercial.create({
      data: {
        nombre: `${TEST_PREFIX}-Ana`,
        ciudad: "Córdoba",
        inmovillaRefCode: "AN",
      },
    });

    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-p1`,
        ref: "URUS01VAN",
        agente: "",
        comercialId: null,
        lastEventId: "e1",
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });
    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-p2`,
        ref: "URUS02VXX",
        agente: "",
        comercialId: null,
        lastEventId: "e2",
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });

    const result = await syncComercialAssignments({
      id: comercial.id,
      nombre: comercial.nombre,
      inmovillaAgentId: null,
      inmovillaRefCode: "AN",
    });

    expect(result.propertiesAssigned).toBe(1);
    expect(result.demandsAssigned).toBe(0);

    const p1 = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${TEST_PREFIX}-p1` },
    });
    expect(p1?.comercialId).toBe(comercial.id);
    expect(p1?.agente).toBe(comercial.nombre);

    const p2 = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${TEST_PREFIX}-p2` },
    });
    expect(p2?.comercialId).toBeNull();
  });

  it("asigna demandas sin comercial por nombre (case-insensitive)", async () => {
    const comercial = await prisma.comercial.create({
      data: {
        nombre: `${TEST_PREFIX}-María`,
        ciudad: "Málaga",
      },
    });

    await prisma.demandCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-d1`,
        agente: `${TEST_PREFIX}-maría`,
        comercialId: null,
        lastEventId: "e3",
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });

    const result = await syncComercialAssignments({
      id: comercial.id,
      nombre: comercial.nombre,
      inmovillaAgentId: null,
      inmovillaRefCode: null,
    });

    expect(result.demandsAssigned).toBe(1);

    const d1 = await prisma.demandCurrent.findUnique({
      where: { codigo: `${TEST_PREFIX}-d1` },
    });
    expect(d1?.comercialId).toBe(comercial.id);
  });

  it("asigna por inmovillaAgentId numérico en campo agente", async () => {
    const comercial = await prisma.comercial.create({
      data: {
        nombre: `${TEST_PREFIX}-Pedro`,
        ciudad: "Córdoba",
        inmovillaAgentId: 99999,
      },
    });

    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-p3`,
        ref: "REF-NO-URUS",
        agente: "99999",
        comercialId: null,
        lastEventId: "e4",
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });

    const result = await syncComercialAssignments({
      id: comercial.id,
      nombre: comercial.nombre,
      inmovillaAgentId: 99999,
      inmovillaRefCode: null,
    });

    expect(result.propertiesAssigned).toBe(1);
  });

  it("no toca filas que ya tienen comercialId asignado", async () => {
    const existingComercial = await prisma.comercial.create({
      data: {
        nombre: `${TEST_PREFIX}-Existing`,
        ciudad: "Sevilla",
        inmovillaRefCode: "EX",
      },
    });
    const newComercial = await prisma.comercial.create({
      data: {
        nombre: `${TEST_PREFIX}-New`,
        ciudad: "Córdoba",
        inmovillaRefCode: "NW",
      },
    });

    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-p4`,
        ref: "URUS01VNW",
        agente: existingComercial.nombre,
        comercialId: existingComercial.id,
        lastEventId: "e5",
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });

    const result = await syncComercialAssignments({
      id: newComercial.id,
      nombre: newComercial.nombre,
      inmovillaAgentId: null,
      inmovillaRefCode: "NW",
    });

    expect(result.propertiesAssigned).toBe(0);

    const p4 = await prisma.propertyCurrent.findUnique({
      where: { codigo: `${TEST_PREFIX}-p4` },
    });
    expect(p4?.comercialId).toBe(existingComercial.id);
  });

  it("devuelve ceros cuando no hay coincidencias", async () => {
    const comercial = await prisma.comercial.create({
      data: {
        nombre: `${TEST_PREFIX}-Nobody`,
        ciudad: "Córdoba",
        inmovillaRefCode: "ZZ",
      },
    });

    await prisma.propertyCurrent.create({
      data: {
        codigo: `${TEST_PREFIX}-p5`,
        ref: "URUS01VXX",
        agente: "OtroAgente",
        comercialId: null,
        lastEventId: "e6",
        lastEventPosition: ZERO,
        lastEventAt: EPOCH,
      },
    });

    const result = await syncComercialAssignments({
      id: comercial.id,
      nombre: comercial.nombre,
      inmovillaAgentId: null,
      inmovillaRefCode: "ZZ",
    });

    expect(result.propertiesAssigned).toBe(0);
    expect(result.demandsAssigned).toBe(0);
  });
});
