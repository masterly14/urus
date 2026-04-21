import { Node, mergeAttributes } from "@tiptap/core";

export const SignatureBlockNode = Node.create({
  name: "signatureBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      labels: { default: ["PARTE A", "PARTE B"] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-signature-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const labels = Array.isArray(HTMLAttributes.labels)
      ? HTMLAttributes.labels.join("  ·  ")
      : "PARTE A  ·  PARTE B";

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-signature-block": "true",
        class: "signature-block",
      }),
      `Zona de firmas: ${labels}`,
    ];
  },

  addCommands() {
    return {
      setSignatureLabels:
        (labels: string[]) =>
        ({ commands }: { commands: Record<string, (...args: unknown[]) => boolean> }) =>
          commands.updateAttributes(this.name, { labels }),
    } as never;
  },
});
