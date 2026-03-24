import {
  AlignmentType,
  Document,
  HeadingLevel,
  Paragraph,
  TextRun,
  UnderlineType,
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
import {
  formatDateEsFromIso,
  formatMoneyAmountEur,
  formatMoneyEur,
  formatPeopleList,
  toUpperLegal,
} from "../formatters";

export interface ArrasRenderModel {
  title: string;
  paragraphs: string[];
  signatureLine: string;
}

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text })],
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

export function buildArrasDocument(payload: ArrasContractPayload): Document {
  const model = buildArrasRenderModel(payload);

  return new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 220 },
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: model.title, bold: true })],
          }),
          heading("REUNIDOS"),
          ...model.paragraphs.map(body),
          new Paragraph({
            spacing: { before: 200, after: 120 },
            children: [
              new TextRun({
                text: model.signatureLine,
                underline: { type: UnderlineType.SINGLE },
              }),
            ],
          }),
        ],
      },
    ],
  });
}
