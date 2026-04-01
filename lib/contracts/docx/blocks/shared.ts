import type { ArrasLegalRegime, KeysHandoverMode } from "@/types/contracts";

export const LEGAL_PARTY_LABELS = {
  buyerSingular: "COMPRADOR",
  buyerPlural: "COMPRADORES",
  sellerSingular: "VENDEDOR",
  sellerPlural: "VENDEDORES",
} as const;

export function buildArrasRegimeLabel(regime: ArrasLegalRegime): string {
  return regime === "penitencial" ? "PENITENCIALES" : "CONFIRMATORIAS";
}

export function buildArrasRegimeClause(regime: ArrasLegalRegime, doubleArrasLine: string): string {
  if (regime === "confirmatoria") {
    return "Esta cantidad se entrega en concepto de arras confirmatorias, como anticipo del precio y prueba del perfeccionamiento del acuerdo, con obligacion de cumplimiento contractual para ambas partes.";
  }

  return `Esta cantidad se entrega en concepto de arras penitenciales con los efectos previstos en el articulo 1454 del Codigo Civil: si desiste la parte compradora, pierde la cantidad entregada; si desiste la parte vendedora, devolvera el doble de lo recibido (${doubleArrasLine}).`;
}

export function buildGastosClause(): string {
  return "Todos los gastos e impuestos que se generen como consecuencia de la compraventa seran abonados por las partes de acuerdo a la ley: ITP, IVA y/u otros impuestos indirectos de la escritura publica e inscripcion seran por cuenta de la parte compradora; la plusvalia municipal sera por cuenta de la parte vendedora.";
}

export function buildCargasClause(): string {
  return "La parte vendedora declara que el inmueble se entregara libre de cargas, gravamenes y al corriente de pago de comunidad, arbitrios, tasas e impuestos que afecten a la finca. Cualquier carga registral previa sera cancelada por la parte vendedora, asumiendo los gastos asociados.";
}

export function buildEstadoInmuebleClause(): string {
  return "El precio se fija atendiendo al estado actual del inmueble, que la parte compradora declara conocer tras su visita, adquiriendolo a cuerpo cierto y aceptando sus condiciones fisicas y juridicas.";
}

export function buildFueroClause(courtsMunicipality: string): string {
  return `Para cuantas cuestiones deriven del presente contrato, las partes se someten expresamente al fuero de los Juzgados y Tribunales de ${courtsMunicipality}, con renuncia a cualquier otro fuero que pudiera corresponderles.`;
}

export function buildSenalDesistimientoClause(doubleSenalLine: string): string {
  return `La propiedad se compromete a no aceptar otras ofertas desde la aceptacion de la presente y hasta la fecha prevista y senalada de firma del contrato de arras. El desistimiento del compromiso adquirido, o si llegada la fecha prevista para el otorgamiento de la escritura de compraventa el COMPRADOR no comparece, perdera la cantidad entregada; si es la parte VENDEDORA quien desiste de la compraventa, debera devolver duplicada la cantidad entregada, esto es ${doubleSenalLine}.`;
}

export function buildSenalDevolucionClause(): string {
  return "En caso de que la presente oferta no sea aceptada por la propiedad, se devolvera al ofertante el importe integro entregado en este acto, en el plazo maximo de cuarenta y ocho horas a partir de su desistimiento, mediante devolucion de la transferencia referenciada en el presente documento.";
}

export function buildFinancingFallbackClause(): string {
  return "En el caso de que el comprador no pueda conseguir la financiacion hipotecaria se le devolvera al comprador el importe que aporto en el contrato de senal.";
}

export function buildKeysClause(
  mode: KeysHandoverMode,
  maxKeysHandoverDateEs: string,
  maxDeedDateEs: string,
): string {
  switch (mode) {
    case "same_day_as_deed":
      return `La entrega de llaves y toma de posesion se realizara el mismo dia de la firma de la escritura publica de compraventa, con fecha limite ${maxDeedDateEs}.`;
    case "separate_agreed_date":
      return `La entrega de llaves se realizara en fecha separada pactada entre las partes, sin superar la fecha maxima ${maxKeysHandoverDateEs}.`;
    case "by_agreement_same_as_deed_when_occurs":
    default:
      return `La entrega de llaves y toma de posesion se realizara por acuerdo entre las partes, y en todo caso no mas tarde de ${maxKeysHandoverDateEs}, siendo preferente que coincida con el otorgamiento de escritura (fecha maxima ${maxDeedDateEs}).`;
  }
}
