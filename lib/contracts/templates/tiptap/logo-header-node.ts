import { Node, mergeAttributes } from "@tiptap/core";

export const LogoHeaderNode = Node.create({
  name: "logoHeader",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-logo-header]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-logo-header": "true",
        class: "logo-header-block",
        contenteditable: "false",
      }),
      "URUS CAPITAL GROUP",
    ];
  },
});
