"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Eye,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  PanelRightOpen,
  PanelRightClose,
  Heading1,
  Heading2,
  Type,
  HelpCircle,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { VariableNode } from "@/lib/contracts/templates/tiptap/variable-node";
import { SharedClauseNode } from "@/lib/contracts/templates/tiptap/shared-clause-node";
import { ConditionalBlockNode } from "@/lib/contracts/templates/tiptap/conditional-block-node";
import { LogoHeaderNode } from "@/lib/contracts/templates/tiptap/logo-header-node";
import { SignatureBlockNode } from "@/lib/contracts/templates/tiptap/signature-block-node";
import { VariablePanel } from "./variable-panel";
import { TemplatePreview } from "./template-preview";
import type { TemplateStructure, TemplateBlock } from "@/types/contract-template";
import type { ContractDocumentKind, SharedClauseBlockId } from "@/types/contracts";

type SaveState = "idle" | "saving" | "saved" | "error";

interface TemplateData {
  id: string;
  documentKind: string;
  version: string;
  name: string;
  isActive: boolean;
  structure: unknown;
  variableBindings: unknown;
  sharedClauseOverrides: unknown;
  publishedAt: string | null;
}

const DOC_KIND_LABELS: Record<string, string> = {
  arras: "Arras",
  senal_compra: "Senal de Compra",
  oferta_firme: "Oferta en Firme",
  anexo_mobiliario: "Anexo Mobiliario",
};

const SHARED_CLAUSE_IDS = [
  "gastos_itp_iva_plusvalia",
  "fuero_jurisdiccion",
  "penitencial_desistimiento_basico",
  "libre_cargas_cancelacion_propiedad",
  "libre_cargas_declaracion_vendedor",
  "estado_visitado_cuerpo_cierto",
  "arras_convocatoria_rescision_7_dias",
  "entrega_llaves_y_resto_precio",
] as const satisfies readonly SharedClauseBlockId[];

const DEFAULT_SHARED_CLAUSE_ID: SharedClauseBlockId = "fuero_jurisdiccion";

function toSharedClauseBlockId(value: unknown): SharedClauseBlockId {
  return SHARED_CLAUSE_IDS.includes(value as SharedClauseBlockId)
    ? (value as SharedClauseBlockId)
    : DEFAULT_SHARED_CLAUSE_ID;
}

function structureToTipTapContent(structure: TemplateStructure) {
  const content: Record<string, unknown>[] = [];

  for (const block of structure.blocks) {
    switch (block.type) {
      case "logo_header":
        content.push({ type: "logoHeader" });
        break;
      case "title":
      case "heading":
        content.push({
          type: "heading",
          attrs: { level: block.type === "title" ? 1 : 2 },
          content: block.content ? parseTextWithVariables(block.content) : undefined,
        });
        break;
      case "body_paragraph":
        content.push({
          type: "paragraph",
          content: block.content ? parseTextWithVariables(block.content) : undefined,
        });
        break;
      case "shared_clause":
        if (block.config.type === "shared_clause") {
          content.push({
            type: "sharedClause",
            attrs: {
              clauseId: block.config.clause.clauseId,
              enabled: block.config.clause.enabled,
              overrideText: block.config.clause.overrideText ?? null,
            },
          });
        }
        break;
      case "conditional_block":
        if (block.config.type === "conditional_block") {
          const c = block.config.condition;
          content.push({
            type: "conditionalBlock",
            attrs: {
              flagPath: c.flagPath,
              operator: c.operator,
              value: c.value ?? "",
              thenContent: c.thenBlocks?.map((b) => b.content).join("\n") ?? "",
              elseContent: c.elseBlocks?.map((b) => b.content).join("\n") ?? "",
            },
          });
        }
        break;
      case "signature_block":
        content.push({
          type: "signatureBlock",
          attrs: {
            labels: block.config.type === "signature_block" ? block.config.labels : ["PARTE A", "PARTE B"],
          },
        });
        break;
      case "additional_clauses_slot":
        content.push({
          type: "paragraph",
          content: [{ type: "text", text: "[Aqui se insertaran las clausulas adicionales por operacion]" }],
        });
        break;
      default:
        content.push({
          type: "paragraph",
          content: block.content ? parseTextWithVariables(block.content) : undefined,
        });
    }
  }

  return { type: "doc", content };
}

const VARIABLE_PATH_TO_LABEL: Record<string, string> = {
  "buyers[].fullName": "Nombre del comprador",
  "buyers[].nationalId": "DNI del comprador",
  "buyers[].fiscalAddress.streetLine": "Domicilio del comprador",
  "buyers[].fiscalAddress.municipality": "Ciudad del comprador",
  "sellers[].fullName": "Nombre del vendedor",
  "sellers[].nationalId": "DNI del vendedor",
  "sellers[].fiscalAddress.streetLine": "Domicilio del vendedor",
  "sellers[].fiscalAddress.municipality": "Ciudad del vendedor",
  "purchaser.fullName": "Nombre del comprador",
  "purchaser.nationalId": "DNI del comprador",
  "offerers[].fullName": "Nombre del ofertante",
  "offerers[].nationalId": "DNI del ofertante",
  "property.addressLine": "Direccion del inmueble",
  "property.municipality": "Ciudad del inmueble",
  "property.cadastralReference": "Referencia catastral",
  "property.urbanDescriptionLine": "Descripcion de la finca",
  "property.registryOfficeName": "Registro de la Propiedad",
  "property.fincaNumber": "Numero de finca",
  "property.cru": "CRU",
  "agency.companyLegalName": "Nombre de la empresa",
  "agency.companyTaxId": "CIF de la empresa",
  "agency.representative.fullName": "Nombre del representante",
  "agency.depositBankAccount.iban": "IBAN de la empresa",
  "totalPurchasePrice": "Precio de compraventa",
  "arrasAmount": "Importe de arras",
  "remainderAtPublicDeed": "Resto pendiente a escritura",
  "offeredPrice": "Precio ofrecido",
  "listingPrice": "Precio publicado",
  "offerDeposit": "Deposito de la oferta",
  "senalAmount": "Importe de la senal",
  "arrasAmountAfterAcceptance": "Arras tras aceptacion",
  "arrasPaymentAccount.iban": "IBAN para arras",
  "arrasPaymentAccount.bankName": "Banco para arras",
  "arrasPaymentAccount.holdersLine": "Titular cuenta arras",
  "documentDateIso": "Fecha del contrato",
  "signPlace": "Lugar de firma",
  "timelines.maxDeedDateIso": "Fecha limite escritura",
  "timelines.maxKeysHandoverDateIso": "Fecha limite llaves",
  "timelines.convocatoriaNotaryMinNaturalDays": "Dias preaviso notario",
  "timelines.offerValidityNaturalDays": "Dias validez oferta",
  "timelines.arrasSigningMaxNaturalDaysFromAcceptance": "Plazo firma arras",
  "timelines.escrituraMaxNaturalDaysFromArrasSignature": "Plazo escritura desde arras",
  "timelines.businessDaysToArrasContract": "Dias para firmar arras",
  "flags.arrasRegime": "Tipo de arras",
  "flags.keysHandover": "Entrega de llaves",
  "jurisdiction.courtsMunicipality": "Ciudad de los juzgados",
};

function parseTextWithVariables(text: string): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    const path = match[1];
    parts.push({
      type: "contractVariable",
      attrs: {
        variablePath: path,
        label: VARIABLE_PATH_TO_LABEL[path] ?? path,
        sourceType: "input",
      },
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", text }];
}

function tipTapToStructure(json: Record<string, unknown>): TemplateStructure {
  const content = json.content as Record<string, unknown>[];
  const blocks: TemplateBlock[] = [];
  let counter = 0;

  for (const node of content ?? []) {
    const id = `block-${++counter}`;
    const type = node.type as string;

    switch (type) {
      case "logoHeader":
        blocks.push({ id, type: "logo_header", content: "", config: { type: "logo_header" } });
        break;
      case "heading": {
        const level = (node.attrs as Record<string, unknown>)?.level;
        const text = extractText(node);
        blocks.push({
          id,
          type: level === 1 ? "title" : "heading",
          content: text,
          config: { type: level === 1 ? "title" : "heading" },
        });
        break;
      }
      case "paragraph": {
        const text = extractText(node);
        blocks.push({ id, type: "body_paragraph", content: text, config: { type: "body_paragraph" } });
        break;
      }
      case "sharedClause": {
        const attrs = node.attrs as Record<string, unknown>;
        blocks.push({
          id,
          type: "shared_clause",
          content: "",
          config: {
            type: "shared_clause",
            clause: {
              clauseId: toSharedClauseBlockId(attrs.clauseId),
              enabled: attrs.enabled !== false,
              overrideText: attrs.overrideText ? String(attrs.overrideText) : undefined,
            },
          },
        });
        break;
      }
      case "conditionalBlock": {
        const attrs = node.attrs as Record<string, unknown>;
        blocks.push({
          id,
          type: "conditional_block",
          content: "",
          config: {
            type: "conditional_block",
            condition: {
              flagPath: String(attrs.flagPath ?? ""),
              operator: (attrs.operator as "eq" | "neq" | "truthy" | "falsy") ?? "truthy",
              value: attrs.value ? String(attrs.value) : undefined,
              thenBlocks: attrs.thenContent
                ? [{ id: `${id}-then`, type: "body_paragraph", content: String(attrs.thenContent), config: { type: "body_paragraph" } }]
                : [],
              elseBlocks: attrs.elseContent
                ? [{ id: `${id}-else`, type: "body_paragraph", content: String(attrs.elseContent), config: { type: "body_paragraph" } }]
                : undefined,
            },
          },
        });
        break;
      }
      case "signatureBlock": {
        const attrs = node.attrs as Record<string, unknown>;
        blocks.push({
          id,
          type: "signature_block",
          content: "",
          config: {
            type: "signature_block",
            labels: Array.isArray(attrs.labels) ? attrs.labels.map(String) : ["PARTE A", "PARTE B"],
          },
        });
        break;
      }
      default: {
        const text = extractText(node);
        if (text.trim()) {
          blocks.push({ id, type: "body_paragraph", content: text, config: { type: "body_paragraph" } });
        }
      }
    }
  }

  return { blocks };
}

function extractText(node: Record<string, unknown>): string {
  const content = node.content as Record<string, unknown>[] | undefined;
  if (!content) return "";
  return content
    .filter((c) => c.type === "text" || c.type === "contractVariable")
    .map((c) => {
      if (c.type === "contractVariable") {
        const attrs = c.attrs as Record<string, string>;
        return `{{${attrs.variablePath}}}`;
      }
      return String(c.text ?? "");
    })
    .join("");
}

export function TemplateEditor({ template }: { template: TemplateData }) {
  const router = useRouter();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showPreview, setShowPreview] = useState(false);
  const [showVariables, setShowVariables] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const structure = template.structure as unknown as TemplateStructure;
  const initialContent = structureToTipTapContent(structure);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      TextStyle,
      VariableNode,
      SharedClauseNode,
      ConditionalBlockNode,
      LogoHeaderNode,
      SignatureBlockNode,
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "template-editor-content",
        style: "font-family: Calibri, 'Segoe UI', Inter, system-ui, sans-serif;",
      },
    },
  });

  const persist = useCallback(
    async (json: Record<string, unknown>) => {
      setSaveState("saving");
      try {
        const updatedStructure = tipTapToStructure(json);
        const res = await fetch(`/api/templates/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ structure: updatedStructure }),
        });
        if (!res.ok) throw new Error("Error al guardar");
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [template.id],
  );

  useEffect(() => {
    if (!editor) return undefined;
    const handleUpdate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persist(editor.getJSON() as Record<string, unknown>);
      }, 1000);
    };
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [editor, persist]);

  async function handlePublish() {
    setPublishing(true);
    try {
      if (editor) {
        const json = editor.getJSON() as Record<string, unknown>;
        const updatedStructure = tipTapToStructure(json);
        await fetch(`/api/templates/${template.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ structure: updatedStructure }),
        });
      }

      const res = await fetch(`/api/templates/${template.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(
          data.issues
            ? `Errores de validacion:\n${data.issues.map((i: { message: string }) => `- ${i.message}`).join("\n")}`
            : data.error ?? "Error al publicar",
        );
        return;
      }
      alert("Plantilla publicada como activa.");
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  const kindLabel = DOC_KIND_LABELS[template.documentKind] ?? template.documentKind;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full">
        {/* ── Top bar ── */}
        <header className="flex items-center justify-between h-12 px-4 border-b border-neutral-200 bg-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-neutral-500 hover:text-neutral-800"
              onClick={() => router.push("/platform/legal/plantillas")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <nav className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="text-neutral-400 shrink-0">Plantillas</span>
              <span className="text-neutral-300 shrink-0">/</span>
              <span className="font-medium text-neutral-800 truncate">{template.name}</span>
            </nav>

            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded shrink-0">
              {template.version}
            </span>

            {template.isActive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                <CheckCircle2 className="h-3 w-3" />
                Activa
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <SaveIndicator state={saveState} />

            <div className="w-px h-5 bg-neutral-200" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-neutral-400 hover:text-neutral-700"
                  onClick={() => setShowHelp(true)}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Como usar el editor</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              onClick={() => { setShowPreview(!showPreview); if (!showPreview) setShowVariables(false); }}
            >
              <Eye className="h-3.5 w-3.5" />
              Vista previa
            </Button>

            <Button
              size="sm"
              className="h-8 gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-white"
              disabled={publishing}
              onClick={handlePublish}
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Publicar
            </Button>
          </div>
        </header>

        {/* ── Toolbar ── */}
        {editor && (
          <div className="flex items-center gap-0.5 h-10 px-3 border-b border-neutral-200 bg-white shrink-0">
            <ToolbarGroup label="Formato">
              <ToolbarBtn
                tooltip="Negrita (Ctrl+B)"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                tooltip="Cursiva (Ctrl+I)"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-4 w-4" />
              </ToolbarBtn>
            </ToolbarGroup>

            <ToolbarSep />

            <ToolbarGroup label="Texto">
              <ToolbarBtn
                tooltip="Titulo"
                active={editor.isActive("heading", { level: 1 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              >
                <Heading1 className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                tooltip="Subtitulo"
                active={editor.isActive("heading", { level: 2 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                <Heading2 className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                tooltip="Parrafo"
                active={!editor.isActive("heading")}
                onClick={() => editor.chain().focus().setParagraph().run()}
              >
                <Type className="h-4 w-4" />
              </ToolbarBtn>
            </ToolbarGroup>

            <ToolbarSep />

            <ToolbarGroup label="Listas">
              <ToolbarBtn
                tooltip="Lista con vinetas"
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                tooltip="Lista numerada"
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarBtn>
            </ToolbarGroup>

            <ToolbarSep />

            <ToolbarGroup label="Historial">
              <ToolbarBtn
                tooltip="Deshacer (Ctrl+Z)"
                active={false}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo2 className="h-4 w-4" />
              </ToolbarBtn>
              <ToolbarBtn
                tooltip="Rehacer (Ctrl+Y)"
                active={false}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo2 className="h-4 w-4" />
              </ToolbarBtn>
            </ToolbarGroup>

            <div className="flex-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-neutral-400 hover:text-neutral-700"
                  onClick={() => { setShowVariables(!showVariables); if (!showVariables) setShowPreview(false); }}
                >
                  {showVariables ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showVariables ? "Ocultar panel" : "Mostrar panel de datos"}</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Main content area ── */}
        <div className="flex flex-1 overflow-hidden">
          <div className={cn(
            "flex-1 overflow-y-auto template-editor-scroll",
            (showPreview || showVariables) && "border-r border-neutral-200",
          )}>
            <div className="flex justify-center pt-6 pb-2">
              <span className="text-[11px] font-medium text-neutral-400 bg-white border border-neutral-200 px-3 py-1 rounded-full">
                {kindLabel}
              </span>
            </div>

            <div className="max-w-[816px] mx-auto mb-8 px-6">
              <div className="bg-white rounded shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.03)] border border-neutral-200/80 overflow-hidden">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {showPreview && (
            <div className="w-[400px] shrink-0 overflow-y-auto bg-white border-l border-neutral-200">
              <TemplatePreview templateId={template.id} />
            </div>
          )}

          {showVariables && !showPreview && (
            <div className="w-[300px] shrink-0 overflow-y-auto bg-white">
              <VariablePanel
                documentKind={template.documentKind as ContractDocumentKind}
                editor={editor}
              />
            </div>
          )}
        </div>

        {/* ── Help Modal ── */}
        <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
      </div>
    </TooltipProvider>
  );
}

/* ── Help Modal ── */

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[540px] bg-white">
        <DialogHeader>
          <DialogTitle className="text-lg text-neutral-800">Como editar una plantilla</DialogTitle>
          <DialogDescription className="text-neutral-500">
            Guia rapida para modificar el contenido de los contratos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2 text-[13px] text-neutral-700 leading-relaxed">
          <section>
            <h4 className="font-semibold text-neutral-800 mb-1.5">Editar el texto</h4>
            <p>
              Haz clic en cualquier parte del documento y escribe directamente, igual que en Word.
              Usa la barra de herramientas de arriba para poner negrita, cursiva, titulos o listas.
            </p>
          </section>

          <section>
            <h4 className="font-semibold text-neutral-800 mb-1.5">Que son las variables (datos automaticos)</h4>
            <p>
              Las etiquetas con fondo gris dentro del texto, como{" "}
              <span className="inline-block px-1.5 py-px bg-neutral-100 border border-neutral-300 rounded text-[12px] font-medium text-neutral-700">
                Nombre del comprador
              </span>
              , son <strong>datos que se rellenan solos</strong> cuando se genera un contrato real.
              El sistema los sustituye por la informacion del comprador, vendedor, inmueble, etc.
            </p>
          </section>

          <section>
            <h4 className="font-semibold text-neutral-800 mb-1.5">Como insertar una variable</h4>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Coloca el cursor donde quieras insertar el dato.</li>
              <li>En el panel derecho <strong>&quot;Datos del contrato&quot;</strong>, busca el dato que necesitas.</li>
              <li>Haz clic sobre el y se insertara automaticamente en la posicion del cursor.</li>
            </ol>
          </section>

          <section>
            <h4 className="font-semibold text-neutral-800 mb-1.5">Bloques especiales</h4>
            <ul className="space-y-1.5">
              <li>
                <strong>Clausulas compartidas</strong> (borde izquierdo azul) — texto legal estandar que se reutiliza
                en varios contratos.
              </li>
              <li>
                <strong>Condicionales</strong> (borde punteado) — secciones que solo aparecen si se cumple
                una condicion, por ejemplo &quot;Si incluye hipoteca&quot;.
              </li>
              <li>
                <strong>Zona de firmas</strong> — espacio reservado donde firmaran las partes.
              </li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold text-neutral-800 mb-1.5">Guardar y publicar</h4>
            <p>
              Los cambios se guardan automaticamente mientras editas. Cuando la plantilla este lista,
              pulsa <strong>&quot;Publicar&quot;</strong> para que sea la version activa que se usara en los
              nuevos contratos.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Sub-components ── */

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-xs transition-opacity",
      state === "saving" && "text-neutral-400",
      state === "saved" && "text-emerald-600",
      state === "error" && "text-red-500",
    )}>
      {state === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>}
      {state === "saved" && <><CheckCircle2 className="h-3 w-3" /> Guardado</>}
      {state === "error" && <><AlertCircle className="h-3 w-3" /> Error al guardar</>}
    </span>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {children}
    </div>
  );
}

function ToolbarSep() {
  return <div className="w-px h-5 bg-neutral-200 mx-1.5" />;
}

function ToolbarBtn({
  tooltip,
  active,
  onClick,
  children,
}: {
  tooltip: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={cn(
            "inline-flex items-center justify-center h-8 w-8 rounded-md text-neutral-400 transition-colors",
            "hover:bg-neutral-100 hover:text-neutral-700",
            active && "bg-neutral-100 text-neutral-800",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
