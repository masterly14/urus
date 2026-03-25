import {
  AlignmentType,
  Document,
  HeadingLevel,
  LineRuleType,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";
import type { OfertaFirmeContractPayload } from "@/types/contracts";
import {
  buildCargasClause,
  buildFueroClause,
  buildGastosClause,
  buildSenalDevolucionClause,
} from "../blocks/shared";
import { buildLogoHeaderParagraphs } from "../blocks/logo-header";
import {
  formatDateEsFromIso,
  formatMoneyEur,
  formatPeopleList,
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

function formatAgencyFees(payload: OfertaFirmeContractPayload): string {
  const { fees } = payload;
  if (fees.model === "fixed_net") {
    return `${formatMoneyEur(fees.netAmount)} + ${fees.vatRatePercent}% de IVA`;
  }
  return `${fees.percentOfFinalPrice}% del precio final de venta del inmueble + ${fees.vatRatePercent}% de IVA`;
}

function formatPropertyRegistryBlock(payload: OfertaFirmeContractPayload): string {
  const p = payload.property;
  const parts: string[] = [];
  if (p.fincaNumber) parts.push(`FINCA NUMERO ${p.fincaNumber} DE ${p.municipality.toUpperCase()}`);
  if (p.cru) parts.push(`CRU: ${p.cru}`);
  parts.push(`Referencia catastral: ${p.cadastralReference}`);
  if (p.tomo) parts.push(`Tomo: ${p.tomo}`);
  if (p.libro) parts.push(`Libro: ${p.libro}`);
  if (p.folio) parts.push(`Folio: ${p.folio}`);
  if (p.inscripcion) parts.push(`Inscripcion: ${p.inscripcion}`);
  if (p.registryOfficeName || p.registryOfficeNumber) {
    parts.push(`del Registro de la Propiedad numero ${p.registryOfficeNumber ?? "N/D"} de ${p.municipality}`);
  }
  return parts.join(". ") + ".";
}

export async function buildOfertaFirmeDocument(payload: OfertaFirmeContractPayload): Promise<Document> {
  const dateEs = formatDateEsFromIso(payload.documentDateIso);

  const paragraphs: string[] = [];

  // Encabezamiento
  paragraphs.push(`En ${payload.signPlace}, a ${dateEs}.`);

  // Agencia
  paragraphs.push(
    `${payload.agency.representative.fullName}, mayor de edad, con DNI ${payload.agency.representative.nationalId}, quien actua en nombre y representacion de la agencia ${payload.agency.companyLegalName} con CIF: ${payload.agency.companyTaxId}, en ${payload.agency.companyMunicipality}. En adelante La Agencia.`,
  );

  // Manifiesta - Primero: ofertante + deposito + inmueble
  paragraphs.push(
    `Hemos recibido de ${formatPeopleList(payload.offerers)}, actuando en nombre y representacion propia, en adelante El Ofertante, la cantidad de ${formatMoneyEur(payload.offerDeposit)} mediante transferencia bancaria o ingreso en cuenta al numero de cuenta ${payload.agency.depositBankAccount.iban} de la entidad bancaria ${payload.agency.depositBankAccount.bankName} siendo el representante de esta ${payload.agency.companyLegalName}, en concepto de oferta para la adquisicion del inmueble sito en ${payload.signPlace}, ${payload.property.addressLine}, cuyo precio de venta asciende a la cantidad de ${formatMoneyEur(payload.listingPrice)}.`,
  );

  // Datos registrales
  paragraphs.push(formatPropertyRegistryBlock(payload));

  // Precio ofrecido + validez
  paragraphs.push(
    `El precio ofrecido para la compra del referido inmueble se fija en la cantidad de ${formatMoneyEur(payload.offeredPrice)}. La presente oferta tiene una validez de ${payload.timelines.offerValidityNaturalDays} dias naturales a partir de la firma del presente documento.`,
  );

  // Segundo - arras penitenciales tras aceptacion
  paragraphs.push(
    `En caso de que la presente oferta sea aceptada por la propiedad, se suscribira contrato de arras penitenciales, por un importe de ${formatMoneyEur(payload.arrasAmountAfterAcceptance)}, en un plazo maximo de ${payload.timelines.arrasSigningMaxNaturalDaysFromAcceptance} dias naturales a partir de la aceptacion de la presente oferta, con una fecha maxima para elevar la escritura publica de compraventa de ${payload.timelines.escrituraMaxNaturalDaysFromArrasSignature} dias naturales a partir de la firma de dicho contrato de arras penitenciales. El importe entregado en esta oferta se imputara a cuenta de las arras y a su vez el de las arras al precio de venta del inmueble. La propiedad se compromete a no aceptar otras ofertas desde la aceptacion de la presente y hasta la fecha prevista y senalada de firma del contrato de arras penitenciales.`,
  );

  // Tercero - devolucion si no se acepta
  paragraphs.push(buildSenalDevolucionClause());

  // Cuarto - gastos e impuestos
  paragraphs.push(buildGastosClause());

  // Quinto - cargas
  paragraphs.push(buildCargasClause());

  // Sexto - honorarios
  paragraphs.push(
    `En caso de aceptacion de oferta y una vez firmado el contrato de arras, contrato privado o publico de compraventa del referido inmueble, la parte interesada reconoce que abonara los honorarios estipulados que ascienden al ${formatAgencyFees(payload)}, que seran facturados en concepto de asesoramiento, mediacion y gestion inmobiliaria del inmueble ofertado. El devengo de estos honorarios se producira en la firma del contrato de arras.`,
  );

  // Septimo - fuero
  paragraphs.push(buildFueroClause(payload.jurisdiction.courtsMunicipality));

  // Cierre
  paragraphs.push(
    "Y de conformidad con cuanto antecede firman en el presente documento en el lugar y fecha indicados en el encabezamiento.",
  );

  const bodyChildren: Paragraph[] = [];

  const logoHeader = await buildLogoHeaderParagraphs();
  bodyChildren.push(...logoHeader);

  bodyChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 260 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "OFERTA DE COMPRA", bold: true, color: "1A365D", size: 36, font: FONT })],
    }),
  );

  bodyChildren.push(body(paragraphs[0]));
  bodyChildren.push(body(paragraphs[1]));

  bodyChildren.push(heading("Manifiesta"));

  bodyChildren.push(heading("Primero."));
  bodyChildren.push(body(paragraphs[2]));
  bodyChildren.push(body(paragraphs[3]));
  bodyChildren.push(body(paragraphs[4]));

  bodyChildren.push(heading("Segundo."));
  bodyChildren.push(body(paragraphs[5]));

  bodyChildren.push(heading("Tercero."));
  bodyChildren.push(body(paragraphs[6]));

  bodyChildren.push(heading("Cuarto."));
  bodyChildren.push(body(paragraphs[7]));

  bodyChildren.push(heading("Quinto."));
  bodyChildren.push(body(paragraphs[8]));

  bodyChildren.push(heading("Sexto."));
  bodyChildren.push(body(paragraphs[9]));

  bodyChildren.push(heading("Septimo."));
  bodyChildren.push(body(paragraphs[10]));

  bodyChildren.push(body(paragraphs[11]));

  const signLine = payload.flags.includePropertyAcceptanceSection
    ? `${toUpperLegal("El Ofertante")}                    ${toUpperLegal("La Agencia")}                    ${toUpperLegal("La Propiedad")}\n\nACEPTA    RECHAZA`
    : `${toUpperLegal("El Ofertante")}                               ${toUpperLegal("La Agencia")}`;

  bodyChildren.push(
    new Paragraph({
      spacing: { before: 320, after: 140 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: signLine,
          underline: { type: UnderlineType.SINGLE },
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
