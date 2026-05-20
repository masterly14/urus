import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { ArrasContractPayload, ContractTemplateInput } from "@/types/contracts";
import { buildArrasRenderModel } from "../builders/arras";
import { generateContractDocx } from "../index";

type ArrasInput = Extract<ContractTemplateInput, { kind: "arras" }>;

async function extractDocumentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml no encontrado en el docx");
  return await entry.async("string");
}

function buildArrasInput(overrides?: Partial<ArrasContractPayload>): ArrasInput {
  const basePayload: ArrasContractPayload = {
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
    remainderAtPublicDeed: { amount: 252000, literalEs: "doscientos cincuenta y dos mil euros" },
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
    jurisdiction: {
      courtsMunicipality: "Cordoba",
    },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: true,
    },
  };

  return {
    kind: "arras",
    templateVersion: "2025.03.m8-v1",
    payload: {
      ...basePayload,
      ...overrides,
      flags: {
        ...basePayload.flags,
        ...(overrides?.flags ?? {}),
      },
    },
  };
}

describe("contracts/docx arras generator", () => {
  it("genera un DOCX valido y no vacio", async () => {
    const result = await generateContractDocx(buildArrasInput());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Se esperaba resultado OK");
    }

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(result.fileName).toContain("Contrato_Arras");
  });

  it("usa basename canónico sin prefijo Contrato_Arras cuando templateVersion es stem M8", async () => {
    const input = buildArrasInput();
    input.templateVersion = "OP-2026-0001_Arras_v1";
    const result = await generateContractDocx(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.fileName).toBe("OP-2026-0001_Arras_v1.docx");
  });

  it("inyecta la cláusula numerada adicional cuando se pasa additionalClausesDoc", async () => {
    const result = await generateContractDocx(buildArrasInput(), {
      additionalClausesDoc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "CLAUSULA 8.- LIMPIEZA", marks: [{ type: "bold" }] }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "La parte vendedora se compromete a dejar el inmueble limpio." },
            ],
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const xml = await extractDocumentXml(result.buffer);
    expect(xml).toContain("CLAUSULA 8.- LIMPIEZA");
    expect(xml).toContain("dejar el inmueble limpio");
  });

  it("inyecta un section addendum DENTRO de la sección INMUEBLE (antes de ESTIPULACIONES)", async () => {
    const result = await generateContractDocx(buildArrasInput(), {
      sectionAddendums: [
        {
          id: "addendum-property-1",
          sectionId: "property",
          type: "registry_extra",
          contentDoc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Incluye plaza de garaje numero 12 vinculada a la finca registral.",
                  },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const xml = await extractDocumentXml(result.buffer);

    expect(xml).not.toContain("Datos registrales adicionales:");
    expect(xml).toContain("plaza de garaje numero 12");

    const addendumIdx = xml.indexOf("plaza de garaje numero 12");
    const stipulationsIdx = xml.indexOf("ESTIPULACIONES");
    expect(addendumIdx).toBeGreaterThan(0);
    expect(stipulationsIdx).toBeGreaterThan(0);
    expect(addendumIdx).toBeLessThan(stipulationsIdx);
  });

  it("no modifica el DOCX cuando additionalClausesDoc está vacío", async () => {
    const base = await generateContractDocx(buildArrasInput());
    const withEmpty = await generateContractDocx(buildArrasInput(), {
      additionalClausesDoc: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(base.ok && withEmpty.ok).toBe(true);
    if (!base.ok || !withEmpty.ok) throw new Error("expected ok");
    const baseXml = await extractDocumentXml(base.buffer);
    const emptyXml = await extractDocumentXml(withEmpty.buffer);
    expect(baseXml).not.toContain("CLAUSULA ");
    expect(emptyXml).not.toContain("CLAUSULA ");
  });

  it("fuerza tamaño Letter y márgenes de 1 pulgada en la sección", async () => {
    const result = await generateContractDocx(buildArrasInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    const xml = await extractDocumentXml(result.buffer);
    expect(xml).toContain('w:pgSz w:w="12240" w:h="15840"');
    expect(xml).toContain('w:pgMar');
    expect(xml).toContain('w:top="1440"');
    expect(xml).toContain('w:right="1440"');
    expect(xml).toContain('w:bottom="1440"');
    expect(xml).toContain('w:left="1440"');
  });

  it("renderiza clausula penitencial o confirmatoria segun flags.arrasRegime", () => {
    const penitencialModel = buildArrasRenderModel(buildArrasInput().payload);
    const confirmatoriaModel = buildArrasRenderModel(
      buildArrasInput({
        flags: {
          arrasRegime: "confirmatoria",
          keysHandover: "same_day_as_deed",
          validitySubjectToSellerReceipt: true,
        },
      }).payload,
    );

    expect(penitencialModel.title).toContain("PENITENCIALES");
    expect(confirmatoriaModel.title).toContain("CONFIRMATORIAS");
    expect(
      penitencialModel.paragraphs.some((line) => line.includes("articulo 1454 del Codigo Civil")),
    ).toBe(true);
    expect(
      confirmatoriaModel.paragraphs.some((line) => line.includes("arras confirmatorias")),
    ).toBe(true);
  });

  it("cambia la clausula de entrega de llaves segun keysHandover", () => {
    const sameDay = buildArrasRenderModel(buildArrasInput().payload);
    const separateDate = buildArrasRenderModel(
      buildArrasInput({
        flags: {
          arrasRegime: "penitencial",
          keysHandover: "separate_agreed_date",
          validitySubjectToSellerReceipt: true,
        },
        timelines: {
          maxDeedDateIso: "2026-08-21",
          maxKeysHandoverDateIso: "2026-09-10",
          convocatoriaNotaryMinNaturalDays: 7,
        },
      }).payload,
    );

    expect(sameDay.paragraphs.some((line) => line.includes("mismo dia de la firma"))).toBe(true);
    expect(
      separateDate.paragraphs.some((line) =>
        line.includes("fecha separada pactada entre las partes"),
      ),
    ).toBe(true);
  });

  it("incluye o excluye la validez supeditada al cobro segun flag", () => {
    const withReceiptCondition = buildArrasRenderModel(buildArrasInput().payload);
    const withoutReceiptCondition = buildArrasRenderModel(
      buildArrasInput({
        flags: {
          arrasRegime: "penitencial",
          keysHandover: "same_day_as_deed",
          validitySubjectToSellerReceipt: false,
        },
      }).payload,
    );

    expect(
      withReceiptCondition.paragraphs.some((line) =>
        line.includes("supeditada al efectivo cobro"),
      ),
    ).toBe(true);
    expect(
      withoutReceiptCondition.paragraphs.some((line) =>
        line.includes("no queda supeditada al efectivo cobro"),
      ),
    ).toBe(true);
  });

  it("devuelve issues si faltan campos obligatorios", async () => {
    const result = await generateContractDocx(
      buildArrasInput({
        arrasPaymentAccount: {
          iban: "",
          bankName: "CaixaBank",
          holdersLine: "Jose Perez",
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Se esperaba resultado con errores");
    }
    expect(result.issues.some((issue) => issue.fieldPath === "arrasPaymentAccount.iban")).toBe(
      true,
    );
  });
});
