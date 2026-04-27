import { prisma } from "@/lib/prisma";
import { linkNotaEncargoOnPropertyCreated } from "@/lib/nota-encargo/ref-matcher";
import type { EventRecord } from "@/lib/event-store/types";

const RUN_ID = `nota-live-${Date.now()}`;
const propertyCode = `${RUN_ID}-prop`;
const sessionId = `${RUN_ID}-session`;
const propertyRef = "URUS09VFEDE";
const now = new Date();

async function cleanup() {
  await prisma.event.deleteMany({
    where: {
      OR: [
        { aggregateId: propertyCode },
        { aggregateId: propertyRef },
      ],
    },
  });
  await prisma.legalDocument.deleteMany({
    where: { operationId: { in: [`NOTA:${sessionId}`, propertyCode] } },
  });
  await prisma.signatureRequest.deleteMany({
    where: { operationId: { in: [`NOTA:${sessionId}`, propertyCode] } },
  });
  await prisma.notaEncargoSession.deleteMany({ where: { id: sessionId } });
  await prisma.propertyCurrent.deleteMany({ where: { codigo: propertyCode } });
  await prisma.propertySnapshot.deleteMany({ where: { codigo: propertyCode } });
}

function event(): EventRecord {
  return {
    id: `${RUN_ID}-event`,
    position: BigInt(1),
    type: "PROPIEDAD_CREADA",
    aggregateType: "PROPERTY",
    aggregateId: propertyCode,
    version: 1,
    payload: {
      snapshot: {
        codigo: propertyCode,
        ref: propertyRef,
        tipoOfer: "Venta",
        precio: 275000,
        ciudad: "Córdoba",
        zona: "Centro",
      },
    },
    metadata: null,
    correlationId: RUN_ID,
    causationId: null,
    occurredAt: now,
    createdAt: now,
  };
}

async function main() {
  await cleanup();

  await prisma.propertyCurrent.create({
    data: {
      codigo: propertyCode,
      ref: propertyRef,
      tipoOfer: "Venta",
      precio: 275000,
      ciudad: "Córdoba",
      zona: "Centro",
      agente: "",
      lastEventId: `${RUN_ID}-event`,
      lastEventPosition: BigInt(1),
      lastEventAt: now,
    },
  });
  await prisma.propertySnapshot.create({
    data: {
      codigo: propertyCode,
      ref: propertyRef,
      tipoOfer: "Venta",
      precio: 275000,
      ciudad: "Córdoba",
      zona: "Centro",
      estado: "Libre",
      raw: { calle: "Mayor", numero: "1", cp: "14001" },
    },
  });
  await prisma.notaEncargoSession.create({
    data: {
      id: sessionId,
      propertyRef,
      propertyCode: null,
      comercialId: `${RUN_ID}-comercial`,
      propietarioPhone: "34600111222",
      visitDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      state: "PENDIENTE_PROPIEDAD",
      tipoOperacion: "VENTA",
      propietarioNombre: "Propietario Demo",
      propietarioDni: "12345678A",
      propietarioTelefono: "600111222",
      domicilioFiscal: "Calle Fiscal 2",
    },
  });

  const result = await linkNotaEncargoOnPropertyCreated(event());
  if (!result.linked) {
    throw new Error("La nota de encargo no se vinculó");
  }

  const session = await prisma.notaEncargoSession.findUniqueOrThrow({
    where: { id: sessionId },
  });
  const property = await prisma.propertyCurrent.findUniqueOrThrow({
    where: { codigo: propertyCode },
  });

  if (session.propertyCode !== propertyCode) {
    throw new Error(`propertyCode inesperado: ${session.propertyCode}`);
  }
  if (property.propietarioNombre !== "Propietario Demo") {
    throw new Error("No se copiaron los datos del propietario a PropertyCurrent");
  }

  console.log("OK nota-encargo matching diferido", {
    sessionId,
    propertyCode,
    ownerCopied: result.ownerCopied,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
