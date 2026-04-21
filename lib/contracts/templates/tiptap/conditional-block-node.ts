import { Node, mergeAttributes } from "@tiptap/core";

const FLAG_LABELS: Record<string, string> = {
  "flags.includesMortgage": "Incluye hipoteca",
  "flags.includesFurniture": "Incluye mobiliario",
  "flags.arrasRegime": "Tipo de arras",
  "flags.includesArrasConfirmation": "Incluye confirmacion de arras",
  "flags.isMortgagePending": "Hipoteca pendiente",
};

export const ConditionalBlockNode = Node.create({
  name: "conditionalBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      flagPath: { default: "" },
      operator: { default: "truthy" },
      value: { default: "" },
      thenContent: { default: "" },
      elseContent: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-conditional-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const friendlyFlag = FLAG_LABELS[HTMLAttributes.flagPath] ?? HTMLAttributes.flagPath;
    let label: string;

    if (HTMLAttributes.operator === "truthy") {
      label = `Si "${friendlyFlag}" esta activo`;
    } else if (HTMLAttributes.operator === "falsy") {
      label = `Si "${friendlyFlag}" NO esta activo`;
    } else if (HTMLAttributes.operator === "eq") {
      label = `Si "${friendlyFlag}" = "${HTMLAttributes.value}"`;
    } else {
      label = `Si "${friendlyFlag}" ≠ "${HTMLAttributes.value}"`;
    }

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-conditional-block": HTMLAttributes.flagPath,
        class: "conditional-block",
      }),
      label,
    ];
  },

  addCommands() {
    return {
      insertConditionalBlock:
        (attrs: { flagPath: string; operator: string; value?: string }) =>
        ({ commands }: { commands: Record<string, (...args: unknown[]) => boolean> }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    } as never;
  },
});
