import { Packer } from "docx";
import type { ContractFieldIssue, ContractTemplateInput } from "@/types/contracts";
import { buildArrasDocument } from "./builders/arras";
import { validateContractTemplateInput } from "./validators";

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

export async function generateContractDocx(
  input: ContractTemplateInput,
): Promise<GenerateContractDocxResult> {
  const issues = validateContractTemplateInput(input);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  if (input.kind !== "arras") {
    return {
      ok: false,
      issues: [
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: input.kind,
          fieldPath: "kind",
          message: `No existe builder DOCX para kind=${input.kind}.`,
        },
      ],
    };
  }

  const doc = buildArrasDocument(input.payload);
  const buffer = await Packer.toBuffer(doc);

  const versionSuffix = input.templateVersion ?? "m8-v1";
  const fileName = `Contrato_Arras_${versionSuffix}.docx`;
  return { ok: true, buffer, fileName };
}
