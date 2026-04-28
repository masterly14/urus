import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { linkNotaEncargoOnPropertyCreated } from "@/lib/nota-encargo/ref-matcher";
import type { EventRecord } from "@/lib/event-store/types";

const TEST_PREFIX = `nota-ref-${Date.now()}`;
const EPOCH = new Date("2026-01-01T00:00:00.000Z");
const REF_CATASTRAL = "9872023VH5797S0006XS";

async function cleanup() {
  await prisma.event.deleteMany({
    where: {
      OR: [
        { aggregateId: { startsWith: TEST_PREFIX } },
        { aggregateId: "URUS09VFEDE" },
        { aggregateId: REF_CATASTRAL },
      ],
    },
  });
  await prisma.legalDocumentParty.deleteMany({
    where: { legalDocument: { operationId: { startsWith: `NOTA:${TEST_PREFIX}` } } },
  });
  await prisma.legalDocument.deleteMany({
    where: {
      OR: [
        { operationId: { startsWith: `NOTA:${TEST_PREFIX}` } },
        { operationId: { startsWith: TEST_PREFIX } },
      ],
    },
  });
  await prisma.signatureRequest.deleteMany({
    where: {
      OR: [
        { operationId: { startsWith: `NOTA:${TEST_PREFIX}` } },
        { operationId: { startsWith: TEST_PREFIX } },
      ],
    },
  });
  await prisma.notaEncargoSession.deleteMany({
    where: { id: { startsWith: TEST_PREFIX } },
  });
  await prisma.propertyCurrent.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
  await prisma.propertySnapshot.deleteMany({
    where: { codigo: { startsWith: TEST_PREFIX } },
  });
}

beforeEach(cleanup);
afterAll(cleanup);

function propertyCreatedEvent(propertyCode: string): EventRecord {
  return {
    id: `${TEST_PREFIX}-event`,
    position: BigInt(1),
    type: "PROPIEDAD_CREADA",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    version: 1,
    payload: {
      snapshot: {
        codigo: propertyCode,
        ref: "URUS09VFEDE",
        refCatastral: REF_CATASTRAL,
        tipoOfer: "Venta",
        precio: 275000,
        ciudad: "Córdoba",
        zona: "Centro",
      },
    },
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: EPOCH,
    createdAt: EPOCH,
  };
}

describe("linkNotaEncargoOnPropertyCreated", () => {
  it("vincula una sesión pendiente, copia propietario y rebindea documentos provisionales", async () => {
    const propertyCode = `${TEST_PREFIX}-prop`;
    const sessionId = `${TEST_PREFIX}-session`;
    const provisionalId = `NOTA:${sessionId}`;

    await prisma.propertyCurrent.create({
      data: {
        codigo: propertyCode,
        ref: "URUS09VFEDE",
        refCatastral: REF_CATASTRAL,
        tipoOfer: "Venta",
        precio: 275000,
        ciudad: "Córdoba",
        zona: "Centro",
        agente: "",
        lastEventId: `${TEST_PREFIX}-event`,
        lastEventPosition: BigInt(1),
        lastEventAt: EPOCH,
      },
    });
    await prisma.propertySnapshot.create({
      data: {
        codigo: propertyCode,
        ref: "URUS09VFEDE",
        tipoOfer: "Venta",
        precio: 275000,
        ciudad: "Córdoba",
        zona: "Centro",
        estado: "Libre",
        raw: { calle: "Mayor", numero: "1", cp: "14001" },
      },
    });

    const nota = await prisma.notaEncargoSession.create({
      data: {
        id: sessionId,
        propertyCode: null,
        propertyRef: null,
        refCatastral: REF_CATASTRAL,
        comercialId: `${TEST_PREFIX}-comercial`,
        propietarioPhone: "34600111222",
        visitDateTime: new Date("2026-05-01T10:00:00.000Z"),
        state: "PENDIENTE_PROPIEDAD",
        tipoOperacion: "VENTA",
        propietarioNombre: "Laura Propietaria",
        propietarioDni: "12345678A",
        propietarioTelefono: "600111222",
        domicilioFiscal: "Calle Fiscal 2",
      },
    });

    const signatureRequest = await prisma.signatureRequest.create({
      data: {
        operationId: provisionalId,
        propertyCode: provisionalId,
        documentKind: "NOTA_ENCARGO",
        cloudinaryUrl: "https://example.com/nota.pdf",
        signerName: "Laura Propietaria",
        signerEmail: "",
        signerPhone: "34600111222",
        slaDeadline: new Date("2026-05-06T10:00:00.000Z"),
        signingToken: `${TEST_PREFIX}-token`,
      },
    });
    const legalDocument = await prisma.legalDocument.create({
      data: {
        operationId: provisionalId,
        propertyCode: provisionalId,
        documentKind: "NOTA_ENCARGO",
        status: "SENT_TO_SIGNATURE",
        cloudinaryUrl: "https://example.com/nota.pdf",
        signatureRequestId: signatureRequest.id,
      },
    });
    await prisma.notaEncargoSession.update({
      where: { id: nota.id },
      data: {
        signatureRequestId: signatureRequest.id,
        legalDocumentId: legalDocument.id,
      },
    });

    const result = await linkNotaEncargoOnPropertyCreated(
      propertyCreatedEvent(propertyCode),
    );

    expect(result).toMatchObject({
      linked: true,
      sessionId,
      propertyCode,
      ownerCopied: true,
    });

    const linkedSession = await prisma.notaEncargoSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(linkedSession.propertyCode).toBe(propertyCode);
    expect(linkedSession.propertyRef).toBe("URUS09VFEDE");
    expect(linkedSession.refCatastral).toBe(REF_CATASTRAL);
    expect(linkedSession.state).toBe("PENDING");
    expect(linkedSession.direccion).toContain("Calle Mayor, 1");
    expect(linkedSession.precio).toBe(275000);

    const property = await prisma.propertyCurrent.findUniqueOrThrow({
      where: { codigo: propertyCode },
    });
    expect(property.propietarioNombre).toBe("Laura Propietaria");
    expect(property.propietarioDni).toBe("12345678A");
    expect(property.notaEncargoSessionId).toBe(sessionId);

    const reboundSignature = await prisma.signatureRequest.findUniqueOrThrow({
      where: { id: signatureRequest.id },
    });
    expect(reboundSignature.operationId).toBe(propertyCode);
    expect(reboundSignature.propertyCode).toBe(propertyCode);

    const reboundDocument = await prisma.legalDocument.findUniqueOrThrow({
      where: { id: legalDocument.id },
    });
    expect(reboundDocument.operationId).toBe(propertyCode);
    expect(reboundDocument.propertyCode).toBe(propertyCode);
  });

  it("no hace nada cuando no hay sesión pendiente para la referencia catastral", async () => {
    const result = await linkNotaEncargoOnPropertyCreated(
      propertyCreatedEvent(`${TEST_PREFIX}-unmatched`),
    );

    expect(result.linked).toBe(false);
  });

  it("no vincula si la propiedad creada no trae referencia catastral", async () => {
    const event = propertyCreatedEvent(`${TEST_PREFIX}-without-catastro`);
    event.payload = {
      snapshot: {
        codigo: `${TEST_PREFIX}-without-catastro`,
        ref: "URUS09VFEDE",
        tipoOfer: "Venta",
      },
    } as EventRecord["payload"];

    const result = await linkNotaEncargoOnPropertyCreated(event);

    expect(result.linked).toBe(false);
  });
});
