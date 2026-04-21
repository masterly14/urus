/**
 * Seed: convierte las plantillas hardcodeadas en ContractTemplate rows.
 *
 * Ejecutar:  npx tsx prisma/seed-templates.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const createId = () => randomUUID().replace(/-/g, "").slice(0, 25);
import type { TemplateBlock, TemplateStructure } from "@/types/contract-template";

const prisma = new PrismaClient();

function block(
  type: TemplateBlock["type"],
  content: string,
  config?: Partial<TemplateBlock["config"]>,
): TemplateBlock {
  return {
    id: createId(),
    type,
    content,
    config: (config ?? { type }) as TemplateBlock["config"],
  };
}

function arrasStructure(): TemplateStructure {
  return {
    blocks: [
      block("logo_header", "", { type: "logo_header" }),
      block("title", "CONTRATO DE ARRAS {{flags.arrasRegime === 'penitencial' ? 'PENITENCIALES' : 'CONFIRMATORIAS'}}"),
      block("heading", "REUNIDOS"),
      block("body_paragraph", "En {{signPlace}}, a {{documentDateIso}}."),
      block("variable_list", "", {
        type: "variable_list",
        list: {
          sourcePath: "buyers",
          itemTemplate: "{{item.fullName}}, con DNI {{item.nationalId}}, domicilio fiscal en {{item.fiscalAddress.streetLine}}, {{item.fiscalAddress.municipality}}",
          separator: "; ",
        },
      }),
      block("body_paragraph", "PARTE COMPRADORA: {{_resolved_buyers}}."),
      block("variable_list", "", {
        type: "variable_list",
        list: {
          sourcePath: "sellers",
          itemTemplate: "{{item.fullName}}, con DNI {{item.nationalId}}, domicilio fiscal en {{item.fiscalAddress.streetLine}}, {{item.fiscalAddress.municipality}}",
          separator: "; ",
        },
      }),
      block("body_paragraph", "PARTE VENDEDORA: {{_resolved_sellers}}."),
      block("heading", "INMUEBLE"),
      block("body_paragraph", "TIPO DE INMUEBLE: {{property.urbanDescriptionLine}}."),
      block("body_paragraph", "Direccion: {{property.addressLine}} ({{property.municipality}})."),
      block("body_paragraph", "Registro de la Propiedad: {{property.registryOfficeName}}. Finca: {{property.fincaNumber}}. CRU: {{property.cru}}. Referencia catastral: {{property.cadastralReference}}."),
      block("heading", "ESTIPULACIONES"),
      block("heading", "PRIMERA.- PRECIO Y ARRAS"),
      block("body_paragraph", "Se fija el precio total de la compraventa en {{totalPurchasePrice}}."),
      block("body_paragraph", "En este acto, la parte compradora entrega {{arrasAmount}} mediante transferencia al IBAN {{arrasPaymentAccount.iban}} de {{arrasPaymentAccount.bankName}}, titulares: {{arrasPaymentAccount.holdersLine}}."),
      block("conditional_block", "", {
        type: "conditional_block",
        condition: {
          flagPath: "flags.arrasRegime",
          operator: "eq",
          value: "penitencial",
          thenBlocks: [
            block("body_paragraph", "Esta cantidad se entrega en concepto de arras penitenciales con los efectos previstos en el articulo 1454 del Codigo Civil: si desiste la parte compradora, pierde la cantidad entregada; si desiste la parte vendedora, devolvera el doble de lo recibido."),
          ],
          elseBlocks: [
            block("body_paragraph", "Esta cantidad se entrega en concepto de arras confirmatorias, como anticipo del precio y prueba del perfeccionamiento del acuerdo, con obligacion de cumplimiento contractual para ambas partes."),
          ],
        },
      }),
      block("conditional_block", "", {
        type: "conditional_block",
        condition: {
          flagPath: "flags.validitySubjectToSellerReceipt",
          operator: "truthy",
          thenBlocks: [
            block("body_paragraph", "La validez juridica del contrato queda supeditada al efectivo cobro de la cantidad entregada por la parte vendedora."),
          ],
          elseBlocks: [
            block("body_paragraph", "La validez juridica del contrato no queda supeditada al efectivo cobro, al constar acreditada la orden de transferencia."),
          ],
        },
      }),
      block("body_paragraph", "El resto del precio, {{remainderAtPublicDeed}}, sera abonado en el acto de firma de la escritura publica."),
      block("heading", "SEGUNDA.- PLAZO PARA ESCRITURA"),
      block("body_paragraph", "El plazo maximo para otorgar escritura publica sera el {{timelines.maxDeedDateIso}}."),
      block("body_paragraph", "La parte compradora notificara de forma fehaciente a la parte vendedora la fecha y hora de notaria con una antelacion minima de {{timelines.convocatoriaNotaryMinNaturalDays}} dias naturales."),
      block("heading", "TERCERA.- ENTREGA DE LLAVES"),
      block("conditional_block", "", {
        type: "conditional_block",
        condition: {
          flagPath: "flags.keysHandover",
          operator: "eq",
          value: "same_day_as_deed",
          thenBlocks: [
            block("body_paragraph", "La entrega de llaves y toma de posesion se realizara el mismo dia de la firma de la escritura publica de compraventa, con fecha limite {{timelines.maxDeedDateIso}}."),
          ],
          elseBlocks: [
            block("body_paragraph", "La entrega de llaves se realizara por acuerdo entre las partes, y en todo caso no mas tarde de {{timelines.maxKeysHandoverDateIso}}."),
          ],
        },
      }),
      block("heading", "CUARTA.- GASTOS E IMPUESTOS"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "gastos_itp_iva_plusvalia", enabled: true },
      }),
      block("heading", "QUINTA.- CARGAS"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "libre_cargas_cancelacion_propiedad", enabled: true },
      }),
      block("heading", "SEXTA.- ESTADO DEL INMUEBLE"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "estado_visitado_cuerpo_cierto", enabled: true },
      }),
      block("heading", "SEPTIMA.- FUERO"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "fuero_jurisdiccion", enabled: true },
      }),
      block("additional_clauses_slot", ""),
      block("body_paragraph", "Y para que asi conste, firman las partes en la fecha y lugar indicados."),
      block("signature_block", "", {
        type: "signature_block",
        labels: ["VENDEDOR", "COMPRADOR"],
      }),
    ],
  };
}

function senalCompraStructure(): TemplateStructure {
  return {
    blocks: [
      block("logo_header", "", { type: "logo_header" }),
      block("title", "DOCUMENTO DE SENAL DE COMPRA"),
      block("heading", "PARTES"),
      block("body_paragraph", "La agencia {{agency.companyLegalName}}, con CIF {{agency.companyTaxId}}, representada por {{agency.representative.fullName}}."),
      block("body_paragraph", "El comprador {{purchaser.fullName}}, con DNI {{purchaser.nationalId}}."),
      block("heading", "OBJETO"),
      block("body_paragraph", "Inmueble sito en {{property.addressLine}} ({{property.municipality}}), referencia catastral {{property.cadastralReference}}."),
      block("heading", "SENAL Y PRECIO"),
      block("body_paragraph", "El comprador entrega la cantidad de {{senalAmount}} en concepto de senal, sobre un precio ofrecido de {{offeredPrice}}."),
      block("heading", "PLAZOS"),
      block("body_paragraph", "Las partes dispondran de {{timelines.businessDaysToArrasContract}} dias habiles para la firma del contrato de arras."),
      block("body_paragraph", "El plazo maximo para escritura sera de {{timelines.maxNaturalDaysToEscrituraFromSenalSignature}} dias naturales desde la firma de la senal."),
      block("body_paragraph", "Antelacion minima de convocatoria notarial: {{timelines.convocatoriaNotaryMinNaturalDays}} dias naturales."),
      block("conditional_block", "", {
        type: "conditional_block",
        condition: {
          flagPath: "flags.includeFinancingFallbackClause",
          operator: "truthy",
          thenBlocks: [
            block("body_paragraph", "En el caso de que el comprador no pueda conseguir la financiacion hipotecaria se le devolvera al comprador el importe que aporto en el contrato de senal."),
          ],
        },
      }),
      block("heading", "GASTOS"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "gastos_itp_iva_plusvalia", enabled: true },
      }),
      block("heading", "FUERO"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "fuero_jurisdiccion", enabled: true },
      }),
      block("additional_clauses_slot", ""),
      block("signature_block", "", {
        type: "signature_block",
        labels: ["LA AGENCIA", "EL COMPRADOR"],
      }),
    ],
  };
}

function ofertaFirmeStructure(): TemplateStructure {
  return {
    blocks: [
      block("logo_header", "", { type: "logo_header" }),
      block("title", "OFERTA EN FIRME"),
      block("heading", "PARTES"),
      block("body_paragraph", "La agencia {{agency.companyLegalName}}, con CIF {{agency.companyTaxId}}, representada por {{agency.representative.fullName}}."),
      block("variable_list", "", {
        type: "variable_list",
        list: {
          sourcePath: "offerers",
          itemTemplate: "{{item.fullName}}, con DNI {{item.nationalId}}",
          separator: "; ",
        },
      }),
      block("heading", "INMUEBLE"),
      block("body_paragraph", "Inmueble sito en {{property.addressLine}} ({{property.municipality}}), referencia catastral {{property.cadastralReference}}."),
      block("body_paragraph", "Precio de venta publicado: {{listingPrice}}."),
      block("heading", "CONDICIONES DE LA OFERTA"),
      block("body_paragraph", "Precio ofrecido: {{offeredPrice}}."),
      block("body_paragraph", "Deposito de oferta: {{offerDeposit}}."),
      block("body_paragraph", "Importe de arras previsto tras aceptacion: {{arrasAmountAfterAcceptance}}."),
      block("heading", "PLAZOS"),
      block("body_paragraph", "Validez de la oferta: {{timelines.offerValidityNaturalDays}} dias naturales desde la firma."),
      block("body_paragraph", "Plazo maximo para firma de arras desde aceptacion: {{timelines.arrasSigningMaxNaturalDaysFromAcceptance}} dias naturales."),
      block("body_paragraph", "Plazo maximo para escritura desde firma de arras: {{timelines.escrituraMaxNaturalDaysFromArrasSignature}} dias naturales."),
      block("heading", "FUERO"),
      block("shared_clause", "", {
        type: "shared_clause",
        clause: { clauseId: "fuero_jurisdiccion", enabled: true },
      }),
      block("additional_clauses_slot", ""),
      block("signature_block", "", {
        type: "signature_block",
        labels: ["LA AGENCIA", "EL/LOS OFERTANTE(S)"],
      }),
    ],
  };
}

async function main() {
  const VERSION = "2026.04-v1";

  const templates = [
    {
      documentKind: "arras",
      version: VERSION,
      name: "Contrato de Arras - Estandar",
      structure: arrasStructure(),
    },
    {
      documentKind: "senal_compra",
      version: VERSION,
      name: "Senal de Compra - Estandar",
      structure: senalCompraStructure(),
    },
    {
      documentKind: "oferta_firme",
      version: VERSION,
      name: "Oferta en Firme - Estandar",
      structure: ofertaFirmeStructure(),
    },
  ];

  for (const tpl of templates) {
    await prisma.contractTemplate.upsert({
      where: {
        documentKind_version: {
          documentKind: tpl.documentKind,
          version: tpl.version,
        },
      },
      create: {
        documentKind: tpl.documentKind,
        version: tpl.version,
        name: tpl.name,
        isActive: true,
        structure: tpl.structure as unknown as Prisma.InputJsonValue,
        variableBindings: [] as Prisma.InputJsonValue,
        sharedClauseOverrides: {} as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
      update: {
        name: tpl.name,
        structure: tpl.structure as unknown as Prisma.InputJsonValue,
      },
    });
    console.log(`Upserted: ${tpl.documentKind} (${tpl.version})`);
  }

  console.log("Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
