import {
  AlignmentType,
  Document,
  HeadingLevel,
  LineRuleType,
  Paragraph,
  TextRun,
} from "docx";
import type { SenalCompraContractPayload } from "@/types/contracts";
import {
  buildCargasClause,
  buildFueroClause,
  buildGastosClause,
  buildKeysClause,
  buildFinancingFallbackClause,
  buildSenalDesistimientoClause,
  buildSenalDevolucionClause,
} from "../blocks/shared";
import { buildLogoHeaderParagraphs } from "../blocks/logo-header";
import {
  formatDateEsFromIso,
  formatMoneyEur,
  formatMoneyAmountEur,
  formatPersonLegalLine,
  toUpperLegal,
} from "../formatters";

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

function formatAgencyFees(payload: SenalCompraContractPayload): string {
  const { fees } = payload;
  if (fees.model === "fixed_net") {
    return `${formatMoneyEur(fees.netAmount)} + ${fees.vatRatePercent}% de IVA`;
  }
  return `${fees.percentOfFinalPrice}% del precio final de venta + ${fees.vatRatePercent}% de IVA`;
}

export async function buildSenalCompraDocument(payload: SenalCompraContractPayload): Promise<Document> {
  const dateEs = formatDateEsFromIso(payload.documentDateIso);
  const maxEscrituraEs = `${payload.timelines.maxNaturalDaysToEscrituraFromSenalSignature} dias naturales desde la firma del presente contrato`;

  const doubleSenalAmount = payload.senalAmount.amount * 2;
  const doubleSenalLine = formatMoneyAmountEur(doubleSenalAmount);

  const paragraphs: string[] = [];

  // Encabezamiento
  paragraphs.push(
    `En ${payload.signPlace}, a ${dateEs}.`,
  );

  // Agencia
  paragraphs.push(
    `${payload.agency.representative.fullName}, mayor de edad, con DNI ${payload.agency.representative.nationalId}, quien actua en nombre y representacion de la agencia ${payload.agency.companyLegalName} con CIF: ${payload.agency.companyTaxId}, en ${payload.agency.companyMunicipality}. En adelante La Agencia.`,
  );

  // Manifiesta - Primero
  paragraphs.push(
    `Hemos recibido de ${formatPersonLegalLine(payload.purchaser)}, actuando en nombre y representacion propia, en adelante El Ofertante, la cantidad de ${formatMoneyEur(payload.senalAmount)} mediante transferencia bancaria o ingreso en cuenta al numero de cuenta ${payload.agency.depositBankAccount.iban} de la entidad bancaria ${payload.agency.depositBankAccount.bankName} siendo el representante de esta ${payload.agency.companyLegalName}, en concepto de senal de compra para la adquisicion del inmueble sito en: ${payload.property.addressLine} (${payload.property.municipality}). Referencia Catastral: ${payload.property.cadastralReference}.`,
  );

  // Precio ofrecido
  paragraphs.push(
    `El precio ofrecido para la compra del referido inmueble se fija en la cantidad de ${formatMoneyEur(payload.offeredPrice)}.`,
  );

  // Segundo - desistimiento
  paragraphs.push(
    buildSenalDesistimientoClause(doubleSenalLine),
  );

  // Tercero - devolucion si oferta no aceptada
  paragraphs.push(
    buildSenalDevolucionClause(),
  );

  // Cuarto - plazos
  paragraphs.push(
    `El plazo acordado para la firma del contrato de arras es de ${payload.timelines.businessDaysToArrasContract} dias habiles, desde la firma del presente contrato. Las partes convienen que la firma de escritura publica de compraventa ante notario tendra lugar en la fecha a determinar por acuerdo entre las partes, pero en ningun caso mas tarde de ${maxEscrituraEs}, salvo causa de fuerza mayor, debiendo notificar la parte compradora a la parte vendedora de forma fehaciente con una antelacion de, al menos, ${payload.timelines.convocatoriaNotaryMinNaturalDays} dias naturales, el dia y hora para su otorgamiento.`,
  );

  // Entrega de llaves
  paragraphs.push(
    buildKeysClause(
      payload.flags.keysHandover,
      `${payload.timelines.maxNaturalDaysToEscrituraFromSenalSignature} dias naturales desde la firma`,
      maxEscrituraEs,
    ),
  );

  // Quinto - financiacion (condicional)
  if (payload.flags.includeFinancingFallbackClause) {
    paragraphs.push(buildFinancingFallbackClause());
  }

  // Sexto - gastos e impuestos
  paragraphs.push(buildGastosClause());

  // Septimo - cargas
  paragraphs.push(buildCargasClause());

  // Octavo - honorarios
  paragraphs.push(
    `En caso de aceptacion de oferta y una vez firmado el contrato de senal, contrato privado o publico de compraventa del referido inmueble, las partes interesadas reconocen que abonaran los honorarios estipulados que ascienden a ${formatAgencyFees(payload)}, que seran facturados en concepto de asesoramiento, mediacion y gestion inmobiliaria del inmueble ofertado. El devengo de estos honorarios se producira en la firma del contrato de arras.`,
  );

  // Noveno - fuero
  paragraphs.push(buildFueroClause(payload.jurisdiction.courtsMunicipality));

  // Cierre
  paragraphs.push(
    "Y de conformidad con cuanto antecede firman en el presente documento en el lugar y fecha indicados en el encabezamiento.",
  );

  const clauseStartIndex = 4;
  let clauseNum = 0;

  const bodyChildren: Paragraph[] = [];

  const logoHeader = await buildLogoHeaderParagraphs();
  bodyChildren.push(...logoHeader);

  bodyChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 260 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "SEÑAL DE COMPRA", bold: true, color: "1A365D", size: 36, font: FONT })],
    }),
  );

  bodyChildren.push(body(paragraphs[0]));
  bodyChildren.push(body(paragraphs[1]));

  bodyChildren.push(heading("Manifiesta"));

  bodyChildren.push(heading("Primero."));
  bodyChildren.push(body(paragraphs[2]));
  bodyChildren.push(body(paragraphs[3]));

  bodyChildren.push(heading("Segundo."));
  bodyChildren.push(body(paragraphs[4]));

  bodyChildren.push(heading("Tercero."));
  bodyChildren.push(body(paragraphs[5]));

  bodyChildren.push(heading("Cuarto."));
  bodyChildren.push(body(paragraphs[6]));
  bodyChildren.push(body(paragraphs[7]));

  clauseNum = 5;
  let idx = 8;

  if (payload.flags.includeFinancingFallbackClause) {
    bodyChildren.push(heading(`${ordinalLabel(clauseNum)}.`));
    bodyChildren.push(body(paragraphs[idx]));
    clauseNum++;
    idx++;
  }

  bodyChildren.push(heading(`${ordinalLabel(clauseNum)}.`));
  bodyChildren.push(body(paragraphs[idx]));
  clauseNum++;
  idx++;

  bodyChildren.push(heading(`${ordinalLabel(clauseNum)}.`));
  bodyChildren.push(body(paragraphs[idx]));
  clauseNum++;
  idx++;

  bodyChildren.push(heading(`${ordinalLabel(clauseNum)}.`));
  bodyChildren.push(body(paragraphs[idx]));
  clauseNum++;
  idx++;

  bodyChildren.push(heading(`${ordinalLabel(clauseNum)}.`));
  bodyChildren.push(body(paragraphs[idx]));
  clauseNum++;
  idx++;

  bodyChildren.push(body(paragraphs[idx]));

  bodyChildren.push(
    new Paragraph({
      spacing: { before: 320, after: 140 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${toUpperLegal("Agencia")}                               ${toUpperLegal("Comprador")}`,
          size: 24,
        }),
      ],
    }),
  );

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 24 },
          paragraph: { spacing: { after: 140, line: 360 } },
        },
      },
    },
    sections: [{ properties: {}, children: bodyChildren }],
  });
}

const ORDINALS = [
  "", "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
  "Sexto", "Septimo", "Octavo", "Noveno", "Decimo",
];

function ordinalLabel(n: number): string {
  return ORDINALS[n] ?? `${n}º`;
}
