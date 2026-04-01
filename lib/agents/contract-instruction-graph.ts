/**
 * M8 — Grafo LangGraph: transcripción del gestor → parche estructurado sobre contrato.
 * Soporta arras, señal de compra y oferta en firme.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { llm } from "./llm";
import type {
  ContractInstructionGraphInput,
  ContractVoiceStructuredPatch,
} from "./contract-instruction-types";

const KEYS_HANDOVER_ENUM = z.enum([
  "same_day_as_deed",
  "by_agreement_same_as_deed_when_occurs",
  "separate_agreed_date",
]);

const ContractVoicePatchSchema = z.object({
  confidence: z.number().min(0).max(1).describe("Confianza global en la interpretación (0–1)."),
  noOperationalChanges: z
    .boolean()
    .describe("true si el texto NO pide cambios al contrato (saludos, preguntas sin instrucción)."),

  arrasRegime: z
    .enum(["penitencial", "confirmatoria"])
    .nullable()
    .describe("Tipo de arras (penitencial / confirmatoria). null si no lo menciona. Aplica a arras."),
  keysHandover: KEYS_HANDOVER_ENUM.nullable().describe("Modo de entrega de llaves. null si no lo menciona. Aplica a arras y señal."),
  validitySubjectToSellerReceipt: z.boolean().nullable().describe("Contrato supeditado al cobro efectivo por vendedor. null si no lo menciona. Aplica a arras."),
  includeFinancingFallbackClause: z.boolean().nullable().describe("Incluir cláusula de devolución si no se obtiene financiación. null si no lo menciona. Aplica a señal de compra."),

  maxDeedDateIso: z.string().nullable().describe("Fecha máxima escritura YYYY-MM-DD si la da explícita. null si no."),
  maxKeysHandoverDateIso: z.string().nullable().describe("Fecha máxima entrega de llaves YYYY-MM-DD. null si no."),
  convocatoriaNotaryMinNaturalDays: z.number().nullable().describe("Días naturales mínimos antelación convocatoria notarial. null si no lo menciona."),
  maxDeedNaturalDaysFromDocumentDate: z.number().nullable().describe("Plazo en días naturales desde fecha del documento hasta escritura. null si no."),
  maxKeysHandoverNaturalDaysFromDocumentDate: z.number().nullable().describe("Plazo en días naturales desde fecha del documento hasta entrega de llaves. null si no."),

  businessDaysToArrasContract: z.number().nullable().describe("Días hábiles para firmar contrato de arras desde la señal. null si no. Aplica a señal de compra."),
  maxNaturalDaysToEscrituraFromSenalSignature: z.number().nullable().describe("Días naturales para escritura desde firma de señal. null si no. Aplica a señal de compra."),

  offerValidityNaturalDays: z.number().nullable().describe("Días naturales de validez de la oferta. null si no. Aplica a oferta en firme."),
  arrasSigningMaxNaturalDaysFromAcceptance: z.number().nullable().describe("Días naturales para firmar arras tras aceptar oferta. null si no. Aplica a oferta en firme."),
  escrituraMaxNaturalDaysFromArrasSignature: z.number().nullable().describe("Días naturales para escritura desde firma de arras tras oferta. null si no. Aplica a oferta en firme."),

  totalPurchasePriceEur: z.number().nullable().describe("Precio total compraventa en EUR. null si no. Aplica a arras."),
  arrasAmountEur: z.number().nullable().describe("Importe de arras en EUR. null si no. Aplica a arras."),
  offeredPriceEur: z.number().nullable().describe("Precio ofrecido en EUR. null si no. Aplica a señal y oferta."),
  offerDepositEur: z.number().nullable().describe("Depósito de oferta en EUR. null si no. Aplica a oferta en firme."),
  senalAmountEur: z.number().nullable().describe("Importe de señal en EUR. null si no. Aplica a señal de compra."),
  arrasAmountAfterAcceptanceEur: z.number().nullable().describe("Importe de arras previsto tras aceptación de oferta. null si no. Aplica a oferta en firme."),

  feesPercentOfFinalPrice: z.number().nullable().describe("Honorarios como % del precio final. null si no."),
  feesFixedNetEur: z.number().nullable().describe("Honorarios fijos netos en EUR. null si no."),
  feesVatRatePercent: z.number().nullable().describe("% de IVA sobre honorarios. null si no."),

  courtsMunicipality: z.string().nullable().describe("Municipio de los juzgados / fuero. null si no."),
  ambiguousPoints: z.array(z.string()).describe("Lista de ambigüedades. Vacía si no hay dudas."),
  reasoning: z.string().describe("Breve razonamiento para auditoría."),
});

const llmStructured = llm.withStructuredOutput(ContractVoicePatchSchema, {
  name: "interpretar_instrucciones_contrato",
});

function buildSystemPrompt(documentKind: string): string {
  const kindSpecific: Record<string, string> = {
    arras: `Modelo arras:
- flags.arrasRegime: "penitencial" | "confirmatoria"
- flags.keysHandover: "same_day_as_deed" | "by_agreement_same_as_deed_when_occurs" | "separate_agreed_date"
- flags.validitySubjectToSellerReceipt: boolean
- timelines.maxDeedDateIso, timelines.maxKeysHandoverDateIso: fechas YYYY-MM-DD
- timelines.convocatoriaNotaryMinNaturalDays: número (>0)
- totalPurchasePrice.amount / arrasAmount.amount / remainderAtPublicDeed (resto se recalcula)
- jurisdiction.courtsMunicipality: string`,

    senal_compra: `Modelo señal de compra:
- flags.includeFinancingFallbackClause: boolean (incluir devolución por no financiación)
- flags.keysHandover: "same_day_as_deed" | "by_agreement_same_as_deed_when_occurs" | "separate_agreed_date"
- senalAmount.amount / offeredPrice.amount
- timelines.businessDaysToArrasContract: días hábiles para firma de arras
- timelines.maxNaturalDaysToEscrituraFromSenalSignature: días naturales max para escritura
- timelines.convocatoriaNotaryMinNaturalDays: antelación notarial
- fees (model "fixed_net" con netAmount o "percent_of_final_price" con percentOfFinalPrice)
- jurisdiction.courtsMunicipality: string`,

    oferta_firme: `Modelo oferta en firme (pre-señal):
- flags.includePropertyAcceptanceSection: boolean (no suele cambiarse por voz)
- listingPrice.amount / offeredPrice.amount / offerDeposit.amount / arrasAmountAfterAcceptance.amount
- timelines.offerValidityNaturalDays: días de validez de la oferta
- timelines.arrasSigningMaxNaturalDaysFromAcceptance: días para firmar arras tras aceptación
- timelines.escrituraMaxNaturalDaysFromArrasSignature: días para escritura desde firma arras
- fees (model "fixed_net" o "percent_of_final_price")
- jurisdiction.courtsMunicipality: string`,
  };

  return `Eres el intérprete legal-operativo de un contrato inmobiliario en España.
El sistema NO edita texto libre: solo propones cambios en variables y flags del modelo de datos.

${kindSpecific[documentKind] ?? ""}

Reglas:
1. Usa el JSON del borrador actual como verdad: no inventes datos que el gestor no haya pedido cambiar.
2. Solo rellena un campo del parche si la instrucción es clara; en caso contrario null y añade ambigüedad en ambiguousPoints.
3. Si el gestor pide "arras penitenciales" o "confirmatorias", mapea a arrasRegime.
4. Plazos: si dice "X días" sin fecha concreta, usa el campo de días correspondiente (asume naturales) y menciona la suposición en ambiguousPoints si podría ser hábil.
5. Precios en euros (número). Porcentajes → convertir a importe solo si inequívoco con precio total actual; si no, ambiguousPoints.
6. noOperationalChanges=true solo cuando no hay instrucción de modificación contractual.
7. Campos que no aplican al tipo de documento "${documentKind}" deben venir en null.`;
}

const InstructionState = Annotation.Root({
  input: Annotation<ContractInstructionGraphInput>,
  patch: Annotation<ContractVoiceStructuredPatch | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  error: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
});

type InstructionStateType = typeof InstructionState.State;

function emptyPatch(raw: Record<string, unknown>): ContractVoiceStructuredPatch {
  return {
    confidence: (raw.confidence as number) ?? 0,
    noOperationalChanges: (raw.noOperationalChanges as boolean) ?? true,
    arrasRegime: (raw.arrasRegime as ContractVoiceStructuredPatch["arrasRegime"]) ?? null,
    keysHandover: (raw.keysHandover as ContractVoiceStructuredPatch["keysHandover"]) ?? null,
    validitySubjectToSellerReceipt: (raw.validitySubjectToSellerReceipt as boolean | null) ?? null,
    includeFinancingFallbackClause: (raw.includeFinancingFallbackClause as boolean | null) ?? null,
    maxDeedDateIso: (raw.maxDeedDateIso as string | null) ?? null,
    maxKeysHandoverDateIso: (raw.maxKeysHandoverDateIso as string | null) ?? null,
    convocatoriaNotaryMinNaturalDays: (raw.convocatoriaNotaryMinNaturalDays as number | null) ?? null,
    maxDeedNaturalDaysFromDocumentDate: (raw.maxDeedNaturalDaysFromDocumentDate as number | null) ?? null,
    maxKeysHandoverNaturalDaysFromDocumentDate: (raw.maxKeysHandoverNaturalDaysFromDocumentDate as number | null) ?? null,
    businessDaysToArrasContract: (raw.businessDaysToArrasContract as number | null) ?? null,
    maxNaturalDaysToEscrituraFromSenalSignature: (raw.maxNaturalDaysToEscrituraFromSenalSignature as number | null) ?? null,
    offerValidityNaturalDays: (raw.offerValidityNaturalDays as number | null) ?? null,
    arrasSigningMaxNaturalDaysFromAcceptance: (raw.arrasSigningMaxNaturalDaysFromAcceptance as number | null) ?? null,
    escrituraMaxNaturalDaysFromArrasSignature: (raw.escrituraMaxNaturalDaysFromArrasSignature as number | null) ?? null,
    totalPurchasePriceEur: (raw.totalPurchasePriceEur as number | null) ?? null,
    arrasAmountEur: (raw.arrasAmountEur as number | null) ?? null,
    offeredPriceEur: (raw.offeredPriceEur as number | null) ?? null,
    offerDepositEur: (raw.offerDepositEur as number | null) ?? null,
    senalAmountEur: (raw.senalAmountEur as number | null) ?? null,
    arrasAmountAfterAcceptanceEur: (raw.arrasAmountAfterAcceptanceEur as number | null) ?? null,
    feesPercentOfFinalPrice: (raw.feesPercentOfFinalPrice as number | null) ?? null,
    feesFixedNetEur: (raw.feesFixedNetEur as number | null) ?? null,
    feesVatRatePercent: (raw.feesVatRatePercent as number | null) ?? null,
    courtsMunicipality: (raw.courtsMunicipality as string | null) ?? null,
    ambiguousPoints: (raw.ambiguousPoints as string[]) ?? [],
    reasoning: (raw.reasoning as string) ?? "",
  };
}

async function interpretNode(state: InstructionStateType): Promise<Partial<InstructionStateType>> {
  const { transcript, documentKind, currentPayload } = state.input;

  try {
    const raw = await llmStructured.invoke([
      { role: "system", content: buildSystemPrompt(documentKind) },
      {
        role: "user",
        content:
          `Transcripción del gestor:\n"""${transcript}"""\n\n` +
          `Tipo de documento: ${documentKind}\n\n` +
          `Borrador actual (JSON):\n${JSON.stringify(currentPayload, null, 2)}`,
      },
    ]);

    return { patch: emptyPatch(raw as unknown as Record<string, unknown>) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Error interpretando instrucciones de contrato: ${msg}` };
  }
}

export const contractInstructionGraph = new StateGraph(InstructionState)
  .addNode("interpretar", interpretNode)
  .addEdge(START, "interpretar")
  .addEdge("interpretar", END)
  .compile();

export async function interpretContractVoiceInstructions(
  input: ContractInstructionGraphInput,
): Promise<ContractVoiceStructuredPatch> {
  const result = await contractInstructionGraph.invoke({ input });

  if (result.error) {
    throw new Error(result.error);
  }
  if (!result.patch) {
    throw new Error("El intérprete de contrato no produjo un parche");
  }
  return result.patch;
}
