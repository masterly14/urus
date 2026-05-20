import {
  AlignmentType,
  Document,
  HeadingLevel,
  LineRuleType,
  Paragraph,
  TextRun,
} from "docx";
import type { ArrasContractPayload } from "@/types/contracts";
import {
  buildArrasRegimeClause,
  buildArrasRegimeLabel,
  buildCargasClause,
  buildEstadoInmuebleClause,
  buildFueroClause,
  buildGastosClause,
  buildKeysClause,
} from "../blocks/shared";
import { buildLogoHeaderParagraphs } from "../blocks/logo-header";
import {
  formatDateEsFromIso,
  formatMoneyAmountEur,
  formatMoneyEur,
  formatPeopleList,
  toUpperLegal,
} from "../formatters";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";
import {
  additionalClausesNumberingConfig,
  buildAdditionalClausesParagraphs,
} from "@/lib/contracts/additional-clauses/docx-serializer";
import { buildLetterSectionProperties } from "@/lib/contracts/docx/document-defaults";
import type { SectionAddendumsList } from "@/lib/contracts/section-addendums/types";
import { buildSectionAddendumParagraphs } from "@/lib/contracts/section-addendums/docx-serializer";

export interface BuildArrasDocumentOptions {
  additionalClausesDoc?: AdditionalClausesDoc | null;
  /**
   * Bloques añadidos por el comercial dentro de una sección concreta
   * (ej. ampliar "INMUEBLE" con datos registrales extra, anejos, etc.).
   * Cada bloque se inyecta justo antes de cerrar su sección.
   */
  sectionAddendums?: SectionAddendumsList | null;
}

export interface ArrasRenderModel {
  title: string;
  paragraphs: string[];
  signatureLine: string;
}

const FONT = "Calibri";

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 140 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT, color: "1A365D" })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 140, line: 360, lineRule: LineRuleType.AUTO },
    indent: { firstLine: 420 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, size: 24, font: FONT })],
  });
}

export function buildArrasRenderModel(payload: ArrasContractPayload): ArrasRenderModel {
  const maxDeedDateEs = formatDateEsFromIso(payload.timelines.maxDeedDateIso);
  const maxKeysHandoverDateEs = formatDateEsFromIso(payload.timelines.maxKeysHandoverDateIso);

  const doubleArrasAmount =
    payload.doubleArrasAmount?.amount ?? payload.arrasAmount.amount * 2;
  const doubleArrasLine = payload.doubleArrasAmount
    ? formatMoneyEur(payload.doubleArrasAmount)
    : formatMoneyAmountEur(doubleArrasAmount);

  const title = `CONTRATO DE ARRAS ${buildArrasRegimeLabel(payload.flags.arrasRegime)}`;

  const partiesBlock = [
    `PARTE COMPRADORA: ${formatPeopleList(payload.buyers)}.`,
    `PARTE VENDEDORA: ${formatPeopleList(payload.sellers)}.`,
  ];

  const propertySummary = [
    `TIPO DE INMUEBLE: ${payload.property.urbanDescriptionLine ?? "URBANA"}.`,
    `Direccion: ${payload.property.addressLine} (${payload.property.municipality}).`,
    `Registro de la Propiedad: ${payload.property.registryOfficeName ?? "N/D"}${payload.property.registryOfficeNumber ? ` numero ${payload.property.registryOfficeNumber}` : ""}.`,
    `Finca: ${payload.property.fincaNumber ?? "N/D"}. CRU: ${payload.property.cru ?? "N/D"}. Referencia catastral: ${payload.property.cadastralReference}.`,
  ];

  const firstClause = [
    `Se fija el precio total de la compraventa en ${formatMoneyEur(payload.totalPurchasePrice)}.`,
    `En este acto, la parte compradora entrega ${formatMoneyEur(payload.arrasAmount)} mediante transferencia al IBAN ${payload.arrasPaymentAccount.iban} de ${payload.arrasPaymentAccount.bankName}, titulares: ${payload.arrasPaymentAccount.holdersLine}.`,
    buildArrasRegimeClause(payload.flags.arrasRegime, doubleArrasLine),
    payload.flags.validitySubjectToSellerReceipt
      ? "La validez juridica del contrato queda supeditada al efectivo cobro de la cantidad entregada por la parte vendedora."
      : "La validez juridica del contrato no queda supeditada al efectivo cobro, al constar acreditada la orden de transferencia.",
    `El resto del precio, ${formatMoneyEur(payload.remainderAtPublicDeed)}, sera abonado en el acto de firma de la escritura publica.`,
  ];

  const secondClause = [
    `El plazo maximo para otorgar escritura publica sera el ${maxDeedDateEs}.`,
    `La parte compradora notificara de forma fehaciente a la parte vendedora la fecha y hora de notaria con una antelacion minima de ${payload.timelines.convocatoriaNotaryMinNaturalDays} dias naturales.`,
  ];

  const thirdClause = [
    buildKeysClause(payload.flags.keysHandover, maxKeysHandoverDateEs, maxDeedDateEs),
  ];

  const paragraphs = [
    `En ${payload.signPlace}, a ${formatDateEsFromIso(payload.documentDateIso)}.`,
    ...partiesBlock,
    ...propertySummary,
    ...firstClause,
    ...secondClause,
    ...thirdClause,
    buildGastosClause(),
    buildCargasClause(),
    buildEstadoInmuebleClause(),
    buildFueroClause(payload.jurisdiction.courtsMunicipality),
    "Y para que asi conste, firman las partes en la fecha y lugar indicados.",
  ];

  const signatureLine = `${toUpperLegal("Vendedor")}                               ${toUpperLegal("Comprador")}`;

  return { title, paragraphs, signatureLine };
}

export async function buildArrasDocument(
  payload: ArrasContractPayload,
  options: BuildArrasDocumentOptions = {},
): Promise<Document> {
  const model = buildArrasRenderModel(payload);
  const p = model.paragraphs;
  const logoHeader = await buildLogoHeaderParagraphs();
  const additionalClausesParagraphs = buildAdditionalClausesParagraphs(
    options.additionalClausesDoc ?? null,
  );

  const addendums = options.sectionAddendums ?? null;
  const sectionAddendum = (sectionId: string): Paragraph[] =>
    buildSectionAddendumParagraphs(addendums, sectionId);

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: 24,
          },
          paragraph: {
            spacing: {
              after: 140,
              line: 360,
            },
          },
        },
      },
    },
    numbering: additionalClausesNumberingConfig,
    sections: [
      {
        properties: buildLetterSectionProperties(),
        children: [
          ...logoHeader,
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 260 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: model.title, bold: true, color: "1A365D", size: 36, font: FONT })],
          }),
          heading("REUNIDOS"),
          body(p[0]),
          body(p[1]),
          body(p[2]),
          ...sectionAddendum("parties"),
          heading("INMUEBLE"),
          body(p[3]),
          body(p[4]),
          body(p[5]),
          body(p[6]),
          ...sectionAddendum("property"),
          heading("ESTIPULACIONES"),
          heading("PRIMERA.- PRECIO Y ARRAS"),
          body(p[7]),
          body(p[8]),
          body(p[9]),
          body(p[10]),
          body(p[11]),
          ...sectionAddendum("stipulation_first"),
          heading("SEGUNDA.- PLAZO PARA ESCRITURA"),
          body(p[12]),
          body(p[13]),
          ...sectionAddendum("stipulation_second"),
          heading("TERCERA.- ENTREGA DE LLAVES"),
          body(p[14]),
          ...sectionAddendum("stipulation_third"),
          heading("CUARTA.- GASTOS E IMPUESTOS"),
          body(p[15]),
          ...sectionAddendum("stipulation_fourth"),
          heading("QUINTA.- CARGAS"),
          body(p[16]),
          ...sectionAddendum("stipulation_fifth"),
          heading("SEXTA.- ESTADO DEL INMUEBLE"),
          body(p[17]),
          ...sectionAddendum("stipulation_sixth"),
          heading("SEPTIMA.- FUERO"),
          body(p[18]),
          ...sectionAddendum("stipulation_seventh"),
          ...additionalClausesParagraphs,
          body(p[19]),
          new Paragraph({
            spacing: { before: 320, after: 140 },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: model.signatureLine, size: 24 }),
            ],
          }),
        ],
      },
    ],
  });
}
