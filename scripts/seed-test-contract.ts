/**
 * Seed: inserta un LegalDocument de arras de ejemplo en la BD para
 * probar el asistente de voz en Smart Closing.
 *
 * Uso:
 *   npx tsx scripts/seed-test-contract.ts
 *
 * Requiere: DATABASE_URL en .env
 *
 * Tras ejecutar, abre en el navegador:
 *   /platform/legal/contratos/<id impreso en consola>
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { ArrasContractPayload, ContractTemplateInput } from "@/types/contracts";

const prisma = new PrismaClient();

const OPERATION_ID = "OP-TEST-VOICE-001";
const PROPERTY_CODE = "PROP-TEST-001";

function buildArrasPayload(): ArrasContractPayload {
  return {
    documentDateIso: new Date().toISOString().slice(0, 10),
    signPlace: "Cordoba",
    buyers: [
      {
        fullName: "Maria Garcia Lopez",
        nationalId: "12345678Z",
        fiscalAddress: {
          streetLine: "Calle Gran Via 15, 3o B",
          municipality: "Cordoba",
        },
      },
    ],
    sellers: [
      {
        fullName: "Antonio Ruiz Martinez",
        nationalId: "87654321X",
        fiscalAddress: {
          streetLine: "Avenida de la Libertad 42",
          municipality: "Cordoba",
        },
      },
    ],
    property: {
      addressLine: "Calle de la Plata 8, 2o A, 14001 Cordoba",
      municipality: "Cordoba",
      cadastralReference: "9872301UH4497N0001WX",
      urbanDescriptionLine:
        "URBANA: Vivienda en segunda planta, puerta A, con una superficie construida de 95 metros cuadrados",
      registryOfficeName: "Registro de la Propiedad de Cordoba n 3",
      registryOfficeNumber: "3",
      fincaNumber: "14523",
      cru: "14003000148523",
    },
    totalPurchasePrice: {
      amount: 245000,
      literalEs: "doscientos cuarenta y cinco mil euros",
    },
    arrasAmount: {
      amount: 24500,
      literalEs: "veinticuatro mil quinientos euros",
    },
    remainderAtPublicDeed: {
      amount: 220500,
      literalEs: "doscientos veinte mil quinientos euros",
    },
    arrasPaymentAccount: {
      iban: "ES6621000418401234567891",
      bankName: "CaixaBank",
      holdersLine: "Antonio Ruiz Martinez",
    },
    timelines: {
      maxDeedDateIso: "2026-09-15",
      maxKeysHandoverDateIso: "2026-09-15",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: {
      courtsMunicipality: "Cordoba",
    },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: true,
    },
  };
}

async function main() {
  console.log("[seed-test-contract] Creando contrato de prueba para el asistente de voz...\n");

  const contractInput: ContractTemplateInput = {
    kind: "arras",
    templateVersion: "test-voice-v1",
    payload: buildArrasPayload(),
  };

  const doc = await prisma.legalDocument.upsert({
    where: {
      operationId_documentKind: {
        operationId: OPERATION_ID,
        documentKind: "arras",
      },
    },
    update: {
      contractInput: JSON.parse(JSON.stringify(contractInput)),
      status: "DRAFT",
      templateVersion: "test-voice-v1",
      propertyCode: PROPERTY_CODE,
      additionalClausesDoc: null,
      additionalClausesUpdatedAt: null,
      approvedAt: null,
      approvedByUserId: null,
      cloudinaryUrl: null,
    },
    create: {
      operationId: OPERATION_ID,
      propertyCode: PROPERTY_CODE,
      documentKind: "arras",
      templateVersion: "test-voice-v1",
      status: "DRAFT",
      contractInput: JSON.parse(JSON.stringify(contractInput)),
    },
  });

  await prisma.legalDocumentParty.deleteMany({
    where: { legalDocumentId: doc.id },
  });

  await prisma.legalDocumentParty.createMany({
    data: [
      {
        legalDocumentId: doc.id,
        role: "buyer",
        fullName: "Maria Garcia Lopez",
        nifNie: "12345678Z",
        email: "maria.garcia@test.com",
        phone: "+34612345678",
        address: "Calle Gran Via 15, 3o B, Cordoba",
      },
      {
        legalDocumentId: doc.id,
        role: "seller",
        fullName: "Antonio Ruiz Martinez",
        nifNie: "87654321X",
        email: "antonio.ruiz@test.com",
        phone: "+34698765432",
        address: "Avenida de la Libertad 42, Cordoba",
      },
    ],
  });

  console.log("  Contrato creado con exito.\n");
  console.log(`  ID:            ${doc.id}`);
  console.log(`  Operacion:     ${OPERATION_ID}`);
  console.log(`  Propiedad:     ${PROPERTY_CODE}`);
  console.log(`  Tipo:          arras`);
  console.log(`  Estado:        DRAFT`);
  console.log(`  Partes:        Maria Garcia Lopez (compradora) + Antonio Ruiz Martinez (vendedor)`);
  console.log(`  Precio:        245.000 EUR`);
  console.log(`  Arras:         24.500 EUR`);
  console.log(`  Fecha escrit.: 15/09/2026`);
  console.log(`  Fecha llaves:  15/09/2026`);
  console.log(`  Llaves:        Mismo dia de escritura\n`);
  console.log("  ───────────────────────────────────────────────────────────");
  console.log(`  Abre en el navegador:`);
  console.log(`  http://localhost:3000/platform/legal/contratos/${doc.id}`);
  console.log("  ───────────────────────────────────────────────────────────\n");
  console.log("  Pruebas sugeridas con el asistente de voz:\n");
  console.log('  1. "Cambia el precio a 260.000 euros"');
  console.log('  2. "Pon arras confirmatorias"');
  console.log('  3. "La fecha limite de escritura es el 15 de septiembre de 2026"');
  console.log('  4. "Anade una clausula que diga que el vendedor se compromete a');
  console.log('      entregar la vivienda libre de cargas y gravamenes"');
  console.log('  5. "Pon que la entrega de llaves sera en fecha acordada por ambas partes"');
  console.log('  6. (Dictar) "Quiero agregar que el comprador tendra derecho a realizar');
  console.log('      dos visitas previas a la firma ante notario"\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed-test-contract] Error:", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
