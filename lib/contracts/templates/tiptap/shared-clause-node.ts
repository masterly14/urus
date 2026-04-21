import { Node, mergeAttributes } from "@tiptap/core";

const CLAUSE_LABELS: Record<string, string> = {
  fuero_jurisdiccion: "Fuero y Jurisdiccion",
  proteccion_datos: "Proteccion de Datos",
  ley_aplicable: "Ley Aplicable",
  gastos_impuestos: "Gastos e Impuestos",
  vicios_ocultos: "Vicios Ocultos",
  cargas_gravamenes: "Cargas y Gravamenes",
  penalizacion: "Penalizacion",
  condicion_resolutoria: "Condicion Resolutoria",
};

export const SharedClauseNode = Node.create({
  name: "sharedClause",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      clauseId: { default: "" },
      enabled: { default: true },
      overrideText: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-shared-clause]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const label = CLAUSE_LABELS[HTMLAttributes.clauseId] ?? HTMLAttributes.clauseId;

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-shared-clause": HTMLAttributes.clauseId,
        "data-enabled": String(HTMLAttributes.enabled),
        class: "shared-clause-block",
      }),
      label,
    ];
  },

  addCommands() {
    return {
      insertSharedClause:
        (clauseId: string) =>
        ({ commands }: { commands: Record<string, (...args: unknown[]) => boolean> }) =>
          commands.insertContent({
            type: this.name,
            attrs: { clauseId, enabled: true },
          }),
    } as never;
  },
});
