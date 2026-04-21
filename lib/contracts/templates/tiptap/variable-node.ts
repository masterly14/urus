import { Node, mergeAttributes } from "@tiptap/core";

export interface VariableNodeAttrs {
  variablePath: string;
  label: string;
  sourceType: string;
}

export const VariableNode = Node.create({
  name: "contractVariable",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      variablePath: { default: "" },
      label: { default: "" },
      sourceType: { default: "input" },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-contract-variable]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const displayLabel = HTMLAttributes.label || HTMLAttributes.variablePath;

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-contract-variable": HTMLAttributes.variablePath,
        "data-source-type": HTMLAttributes.sourceType,
        class: "contract-variable-chip",
        title: `Variable: ${HTMLAttributes.variablePath}`,
      }),
      displayLabel,
    ];
  },

  addCommands() {
    return {
      insertVariable:
        (attrs: VariableNodeAttrs) =>
        ({ commands }: { commands: Record<string, (...args: unknown[]) => boolean> }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    } as never;
  },
});
