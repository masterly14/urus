"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  ChevronDown,
  ChevronUp,
  FileText,
  Italic,
  List,
  ListOrdered,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Mark, mergeAttributes, type CommandProps } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  EMPTY_ADDITIONAL_CLAUSES_DOC,
  isAdditionalClausesDocEmpty,
  type AdditionalClauseFontSize,
  type AdditionalClausesDoc,
} from "@/lib/contracts/additional-clauses/types";

/**
 * Editor WYSIWYG para cláusulas adicionales.
 *
 * Diseño:
 * - Colapsado por defecto: el usuario lo expande solo si va a redactar.
 * - Estilo "documento": fondo blanco, Calibri (coherente con el docx final),
 *   padding generoso, line-height amplio — sensación "Word / Google Docs".
 * - Toolbar mínima: bold, italic, tamaño S/M/L, viñetas y numeración.
 * - Sin títulos/estilos adicionales: el contenido es libre. La integración
 *   en el docx añade automáticamente el encabezado "Cláusulas adicionales".
 *
 * Persistencia:
 * - Debounce 800ms sobre cambios del editor -> PATCH /api/contracts/[id].
 * - Bloqueado cuando el contrato no está en DRAFT (prop `readOnly`).
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

type SaveState = "idle" | "saving" | "saved" | "error";

export interface AdditionalClausesEditorProps {
  contractId: string;
  initialDoc: AdditionalClausesDoc | null;
  readOnly: boolean;
  /**
   * Se invoca tras un PATCH exitoso con el `updatedAt` devuelto por el
   * servidor y el documento tal cual quedó guardado. El componente padre
   * lo usa típicamente para re-renderizar la vista previa del DOCX.
   */
  onPersisted?: (
    updatedAt: string | null,
    doc: AdditionalClausesDoc | null,
  ) => void;
}

export function AdditionalClausesEditor({
  contractId,
  initialDoc,
  readOnly,
  onPersisted,
}: AdditionalClausesEditorProps) {
  const initialHasContent = !isAdditionalClausesDocEmpty(initialDoc);
  const [expanded, setExpanded] = useState(initialHasContent);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocRef = useRef<AdditionalClausesDoc>(
    initialDoc ?? EMPTY_ADDITIONAL_CLAUSES_DOC,
  );

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
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose-sm max-w-none focus:outline-none min-h-[260px] px-10 py-8 bg-white text-neutral-900 text-[15px] leading-[1.75] [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
        style: "font-family: Calibri, 'Segoe UI', Inter, system-ui, sans-serif;",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  const prevInitialDocRef = useRef(initialDoc);
  useEffect(() => {
    if (!editor || !initialDoc) return;
    if (initialDoc === prevInitialDocRef.current) return;
    prevInitialDocRef.current = initialDoc;

    const currentJson = JSON.stringify(editor.getJSON());
    const incomingJson = JSON.stringify(initialDoc);
    if (currentJson === incomingJson) return;

    editor.commands.setContent(initialDoc);
    latestDocRef.current = initialDoc;
    if (!expanded) setExpanded(true);
  }, [editor, initialDoc, expanded]);

  const persist = useCallback(
    async (doc: AdditionalClausesDoc) => {
      setSaveState("saving");
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/contracts/${contractId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ additionalClausesDoc: doc }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `Error HTTP ${response.status}`);
        }
        const data = (await response.json()) as {
          ok: true;
          additionalClausesUpdatedAt: string | null;
        };
        setSaveState("saved");
        onPersisted?.(
          data.additionalClausesUpdatedAt,
          isAdditionalClausesDocEmpty(doc) ? null : doc,
        );
      } catch (error) {
        setSaveState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "No se pudo guardar",
        );
      }
    },
    [contractId, onPersisted],
  );

  useEffect(() => {
    if (!editor) return undefined;

    const handleUpdate = () => {
      if (readOnly) return;
      const json = editor.getJSON() as AdditionalClausesDoc;
      latestDocRef.current = json;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persist(json);
      }, 800);
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, persist, readOnly]);

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

  const hasContent = !isAdditionalClausesDocEmpty(latestDocRef.current);

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden">
      <CardHeader className="py-2.5 pb-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between w-full gap-3 text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Cláusulas adicionales
            <span className="text-xs font-normal text-muted-foreground">
              {hasContent ? "(con contenido)" : "(opcional)"}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {saveState === "saving" && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando…
              </span>
            )}
            {saveState === "saved" && (
              <span className="text-[10px] text-[var(--urus-success)] flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Guardado
              </span>
            )}
            {saveState === "error" && (
              <span className="text-[10px] text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Error
              </span>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0 border-t border-border/30">
          {readOnly && (
            <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
              El contrato ya no está en borrador. Las cláusulas son solo de lectura.
            </div>
          )}

          <Toolbar
            editor={editor}
            disabled={readOnly}
            isBoldActive={isBoldActive}
            isItalicActive={isItalicActive}
            isBulletListActive={isBulletListActive}
            isOrderedListActive={isOrderedListActive}
            activeFontSize={activeFontSize}
          />

          <div className="bg-neutral-50 dark:bg-neutral-900/50 p-6 flex justify-center">
            <div
              className={cn(
                "w-full max-w-[780px] shadow-sm rounded-sm bg-white overflow-hidden border border-neutral-200",
                readOnly && "opacity-80",
              )}
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, rgba(0,0,0,0.02) 0%, transparent 4%)",
              }}
            >
              <EditorContent editor={editor} />
            </div>
          </div>

          {errorMessage && (
            <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              {errorMessage}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface ToolbarProps {
  editor: Editor | null;
  disabled: boolean;
  isBoldActive: boolean;
  isItalicActive: boolean;
  isBulletListActive: boolean;
  isOrderedListActive: boolean;
  activeFontSize: AdditionalClauseFontSize | null;
}

function Toolbar({
  editor,
  disabled,
  isBoldActive,
  isItalicActive,
  isBulletListActive,
  isOrderedListActive,
  activeFontSize,
}: ToolbarProps) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border/30 bg-card/60 flex-wrap">
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

      <div className="w-px h-5 bg-border/50 mx-1" />

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

      <div className="w-px h-5 bg-border/50 mx-1" />

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
        "h-7 px-2 text-muted-foreground",
        active && "bg-accent/50 text-foreground",
      )}
    >
      {children}
    </Button>
  );
}
