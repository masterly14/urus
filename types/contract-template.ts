import type { ContractDocumentKind, SharedClauseBlockId } from "./contracts";

export type TemplateBlockType =
  | "logo_header"
  | "title"
  | "heading"
  | "body_paragraph"
  | "shared_clause"
  | "conditional_block"
  | "variable_list"
  | "signature_block"
  | "additional_clauses_slot";

export interface SharedClauseConfig {
  clauseId: SharedClauseBlockId;
  enabled: boolean;
  overrideText?: string;
}

export interface ConditionalBlockConfig {
  flagPath: string;
  operator: "eq" | "neq" | "truthy" | "falsy";
  value?: string;
  thenBlocks: TemplateBlock[];
  elseBlocks?: TemplateBlock[];
}

export interface VariableListConfig {
  sourcePath: string;
  itemTemplate: string;
  separator: string;
}

export type BlockConfig =
  | { type: "logo_header" }
  | { type: "title" }
  | { type: "heading" }
  | { type: "body_paragraph" }
  | { type: "shared_clause"; clause: SharedClauseConfig }
  | { type: "conditional_block"; condition: ConditionalBlockConfig }
  | { type: "variable_list"; list: VariableListConfig }
  | { type: "signature_block"; labels: string[] }
  | { type: "additional_clauses_slot" };

export interface TemplateBlock {
  id: string;
  type: TemplateBlockType;
  content: string;
  config: BlockConfig;
}

export interface TemplateStructure {
  blocks: TemplateBlock[];
}

export interface VariableBinding {
  variablePath: string;
  sourceType: "inmovilla" | "neon" | "derived" | "input" | "config";
  sourceDetail: string;
  exampleValue: string;
}

export type VariableCategory =
  | "comprador_vendedor"
  | "inmueble"
  | "agencia"
  | "importes"
  | "plazos"
  | "flags"
  | "jurisdiccion";

export interface VariableCatalogEntry {
  path: string;
  label: string;
  category: VariableCategory;
  tsType: string;
  sourceType: "inmovilla" | "neon" | "derived" | "input" | "config";
  sourceDetail: string;
  applicableKinds: ContractDocumentKind[];
  exampleValue: string;
  isArray: boolean;
  formatFn?: string;
}
