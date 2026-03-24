/**
 * Prueba real M8: generación de DOCX de arras + subida a Cloudinary (raw).
 *
 * Uso:
 *   npx tsx scripts/test-contract-docx-cloudinary.ts
 *   npx tsx scripts/test-contract-docx-cloudinary.ts --docx-only
 *   npx tsx scripts/test-contract-docx-cloudinary.ts --out ./borrador-prueba.docx
 *
 * Requiere en .env (subida):
 *   CLOUDINARY_URL o CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
 *
 * Opcional:
 *   CONTRACT_TEST_FOLDER — carpeta en Cloudinary (default: contracts/script-test)
 *   CONTRACT_TEST_OPERATION_ID — sufijo de carpeta (default: timestamp ISO)
 */

import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  resolveCloudinaryCredentialsFromEnv,
  uploadContractDocument,
} from "@/lib/cloudinary";
import { generateContractDocx } from "@/lib/contracts/docx";
import type { ArrasContractPayload, ContractTemplateInput } from "@/types/contracts";

function buildSampleArrasInput(): ContractTemplateInput {
  const payload: ArrasContractPayload = {
    documentDateIso: "2026-05-21",
    signPlace: "Cordoba",
    buyers: [
      {
        fullName: "Ana Lopez",
        nationalId: "12345678A",
        fiscalAddress: {
          streetLine: "Calle Sol 1",
          municipality: "Cordoba",
        },
      },
    ],
    sellers: [
      {
        fullName: "Jose Perez",
        nationalId: "98765432B",
        fiscalAddress: {
          streetLine: "Avenida Luna 2",
          municipality: "Cordoba",
        },
      },
    ],
    property: {
      addressLine: "Calle Test 33",
      municipality: "Cordoba",
      cadastralReference: "1234567UH1233S0001AB",
      urbanDescriptionLine: "URBANA: vivienda",
      registryOfficeName: "Registro de Cordoba",
      registryOfficeNumber: "2",
      fincaNumber: "987",
      cru: "CRU12345",
    },
    totalPurchasePrice: { amount: 280000, literalEs: "doscientos ochenta mil euros" },
    arrasAmount: { amount: 28000, literalEs: "veintiocho mil euros" },
    remainderAtPublicDeed: {
      amount: 252000,
      literalEs: "doscientos cincuenta y dos mil euros",
    },
    arrasPaymentAccount: {
      iban: "ES1121000418450200051332",
      bankName: "CaixaBank",
      holdersLine: "Jose Perez",
    },
    timelines: {
      maxDeedDateIso: "2026-08-21",
      maxKeysHandoverDateIso: "2026-08-21",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: { courtsMunicipality: "Cordoba" },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: true,
    },
  };

  return {
    kind: "arras",
    templateVersion: "script-test-m8",
    payload,
  };
}

function parseArgs(argv: string[]): { docxOnly: boolean; outPath: string | null } {
  let docxOnly = false;
  let outPath: string | null = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--docx-only") docxOnly = true;
    else if (a === "--out" && argv[i + 1]) {
      outPath = argv[++i] ?? null;
    }
  }
  return { docxOnly, outPath };
}

async function main(): Promise<void> {
  const { docxOnly, outPath } = parseArgs(process.argv);

  console.log("[m8:test] Generando DOCX de arras (datos de muestra)…");
  const docx = await generateContractDocx(buildSampleArrasInput());

  if (!docx.ok) {
    console.error("[m8:test] Validación DOCX falló:");
    console.error(JSON.stringify(docx.issues, null, 2));
    process.exit(1);
  }

  console.log(
    `[m8:test] DOCX generado: ${docx.fileName} — ${docx.buffer.length} bytes (firma ZIP: ${docx.buffer.subarray(0, 2).toString()})`,
  );

  if (outPath) {
    const abs = resolve(process.cwd(), outPath);
    await writeFile(abs, docx.buffer);
    console.log(`[m8:test] Archivo escrito en: ${abs}`);
  }

  if (docxOnly) {
    console.log("[m8:test] Modo --docx-only: no se sube a Cloudinary.");
    return;
  }

  try {
    resolveCloudinaryCredentialsFromEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[m8:test] ${msg}`);
    console.error("Define CLOUDINARY_* en .env o usa --docx-only.");
    process.exit(1);
  }

  const operationId =
    process.env.CONTRACT_TEST_OPERATION_ID?.trim() ||
    `script-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const baseFolder =
    process.env.CONTRACT_TEST_FOLDER?.trim() || "contracts/script-test";
  const folder = `${baseFolder}/${operationId}`;

  console.log(`[m8:test] Subiendo a Cloudinary (folder=${folder})…`);

  const uploaded = await uploadContractDocument({
    buffer: docx.buffer,
    fileName: docx.fileName,
    folder,
    tags: ["draft", "script-test", "arras"],
    context: {
      source: "scripts/test-contract-docx-cloudinary",
      operationId,
    },
  });

  console.log("[m8:test] Subida correcta.");
  console.log(`  public_id: ${uploaded.publicId}`);
  console.log(`  secure_url: ${uploaded.secureUrl}`);
  console.log(`  bytes: ${uploaded.bytes}`);
}

main().catch((err) => {
  console.error("[m8:test] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
