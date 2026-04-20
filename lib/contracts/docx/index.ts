import { Packer, type Document } from "docx";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import { isCanonicalContractVersionStem } from "@/lib/contracts/naming";
import { buildArrasDocument } from "./builders/arras";
import { buildSenalCompraDocument } from "./builders/senal-compra";
import { buildOfertaFirmeDocument } from "./builders/oferta-firme";
import { validateContractTemplateInput } from "./validators";
import type { AdditionalClausesDoc } from "@/lib/contracts/additional-clauses/types";

export type GenerateContractDocxResult =
  | {
      ok: true;
      buffer: Buffer;
      fileName: string;
    }
  | {
      ok: false;
      issues: ContractFieldIssue[];
    };

export interface GenerateContractDocxOptions {
  /**
   * Cláusulas adicionales libres escritas por el agente (TipTap JSON).
   * Opcional: si está vacío o ausente, los builders no inyectan la sección.
   */
  additionalClausesDoc?: AdditionalClausesDoc | null;
}

const KIND_FILE_PREFIX: Record<string, string> = {
  arras: "Contrato_Arras",
  senal_compra: "Senal_Compra",
  oferta_firme: "Oferta_Firme",
};

export async function generateContractDocx(
  input: ContractTemplateInput,
  options: GenerateContractDocxOptions = {},
): Promise<GenerateContractDocxResult> {
  const issues = validateContractTemplateInput(input);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const additionalClausesDoc = options.additionalClausesDoc ?? null;

  let doc: Document;

  switch (input.kind) {
    case "arras":
      doc = await buildArrasDocument(input.payload, { additionalClausesDoc });
      break;
    case "senal_compra":
      doc = await buildSenalCompraDocument(input.payload, { additionalClausesDoc });
      break;
    case "oferta_firme":
      doc = await buildOfertaFirmeDocument(input.payload, { additionalClausesDoc });
      break;
    default:
      return {
        ok: false,
        issues: [
          {
            event: "DATOS_INCOMPLETOS",
            documentKind: (input as ContractTemplateInput).kind,
            fieldPath: "kind",
            message: `No existe builder DOCX para kind=${(input as ContractTemplateInput).kind}.`,
          },
        ],
      };
  }

  const buffer = await Packer.toBuffer(doc);
  const versionSuffix = input.templateVersion ?? "m8-v1";
  const prefix = KIND_FILE_PREFIX[input.kind] ?? input.kind;
  const fileName = isCanonicalContractVersionStem(versionSuffix)
    ? `${versionSuffix}.docx`
    : `${prefix}_${versionSuffix}.docx`;
  return { ok: true, buffer, fileName };
}
