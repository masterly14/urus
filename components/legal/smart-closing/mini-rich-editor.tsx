"use client";

import { useEffect, useMemo, useRef } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Mark, mergeAttributes, type CommandProps } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EMPTY_ADDITIONAL_CLAUSES_DOC,
  type AdditionalClauseFontSize,
  type AdditionalClausesDoc,
} from "@/lib/contracts/additional-clauses/types";

/**
 * Editor TipTap reutilizable basado en el mismo subset acotado que el
 * editor de cláusulas adicionales (paragraph, bold, italic, fontSize
 * S/M/L, listas). Pensado para vivir dentro de un Dialog/Popover de
 * altura controlada (mini-editor para "añadir detalle a una sección").
 *
 * No hace fetch ni persistencia: solo emite `onChange(doc)` con el JSON
 * del editor. El consumidor decide cuándo persistir.
 */

type FontSizeMarkAttrs = { size: AdditionalClauseFontSize | null };

const FontSize = Mark.create<Record<string, never>, FontSizeMarkAttrs>({
  name: "fontSize",
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) =>
          (element.getAttribute("data-size") as AdditionalClauseFontSize | null) ?? null,
        renderHTML: (attributes) => {
          if (!attributes.size) return {};
          return { "data-size": attributes.size };
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-size]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setFontSize:
        (size: AdditionalClauseFontSize) =>
        ({ commands }: CommandProps) =>
          commands.setMark("fontSize", { size }),
      unsetFontSize:
        () =>
        ({ commands }: CommandProps) =>
          commands.unsetMark("fontSize"),
    } as never;
  },
});

const FONT_SIZE_VISUAL: Record<AdditionalClauseFontSize, string> = {
  S: "0.875rem",
  M: "1rem",
  L: "1.25rem",
};

export interface MiniRichEditorProps {
  initialDoc: AdditionalClausesDoc | null;
  disabled?: boolean;
  placeholder?: string;
  onChange: (doc: AdditionalClausesDoc) => void;
  /** Opcional: minHeight del área editable (en clases Tailwind, p.ej. "min-h-[140px]"). */
  minHeightClassName?: string;
}

export function MiniRichEditor({
  initialDoc,
  disabled,
  onChange,
  minHeightClassName = "min-h-[140px]",
}: MiniRichEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      TextStyle,
      FontSize,
    ],
    content: initialDoc ?? EMPTY_ADDITIONAL_CLAUSES_DOC,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose-sm max-w-none focus:outline-none px-4 py-3 bg-white text-neutral-900 text-[14px] leading-[1.7] [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
          minHeightClassName,
        ),
        style: "font-family: Calibri, 'Segoe UI', Inter, system-ui, sans-serif;",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return undefined;
    const handler = () => {
      const json = editor.getJSON() as AdditionalClausesDoc;
      onChangeRef.current(json);
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor]);

  const isBoldActive = editor?.isActive("bold") ?? false;
  const isItalicActive = editor?.isActive("italic") ?? false;
  const isBulletListActive = editor?.isActive("bulletList") ?? false;
  const isOrderedListActive = editor?.isActive("orderedList") ?? false;
  const activeFontSize = useMemo<AdditionalClauseFontSize | null>(() => {
    if (!editor) return null;
    for (const size of ["S", "M", "L"] as const) {
      if (editor.isActive("fontSize", { size })) return size;
    }
    return null;
  }, [editor, editor?.state.selection]);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <MiniToolbar
        editor={editor}
        disabled={!!disabled}
        isBoldActive={isBoldActive}
        isItalicActive={isItalicActive}
        isBulletListActive={isBulletListActive}
        isOrderedListActive={isOrderedListActive}
        activeFontSize={activeFontSize}
      />
      <EditorContent editor={editor} />
    </div>
  );
}

interface MiniToolbarProps {
  editor: Editor | null;
  disabled: boolean;
  isBoldActive: boolean;
  isItalicActive: boolean;
  isBulletListActive: boolean;
  isOrderedListActive: boolean;
  activeFontSize: AdditionalClauseFontSize | null;
}

function MiniToolbar({
  editor,
  disabled,
  isBoldActive,
  isItalicActive,
  isBulletListActive,
  isOrderedListActive,
  activeFontSize,
}: MiniToolbarProps) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/40 bg-muted/30 flex-wrap">
      <ToolbarButton
        label="Negrita"
        active={isBoldActive}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Cursiva"
        active={isItalicActive}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>

      <div className="w-px h-5 bg-border/40 mx-1" />

      {(["S", "M", "L"] as const).map((size) => (
        <ToolbarButton
          key={size}
          label={`Tamaño ${size}`}
          active={activeFontSize === size}
          disabled={disabled}
          onClick={() => {
            const chain = editor.chain().focus();
            if (activeFontSize === size) {
              (chain as unknown as { unsetFontSize: () => typeof chain })
                .unsetFontSize()
                .run();
            } else {
              (chain as unknown as { setFontSize: (s: typeof size) => typeof chain })
                .setFontSize(size)
                .run();
            }
          }}
        >
          <span
            style={{ fontSize: FONT_SIZE_VISUAL[size] }}
            className="font-semibold leading-none px-0.5"
          >
            {size}
          </span>
        </ToolbarButton>
      ))}

      <div className="w-px h-5 bg-border/40 mx-1" />

      <ToolbarButton
        label="Lista con viñetas"
        active={isBulletListActive}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        label="Lista numerada"
        active={isOrderedListActive}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  active: boolean;
  disabled: boolean;
  children: React.ReactNode;
}

function ToolbarButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "h-6 px-1.5 text-muted-foreground",
        active && "bg-accent/50 text-foreground",
      )}
    >
      {children}
    </Button>
  );
}
