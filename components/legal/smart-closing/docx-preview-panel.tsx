"use client";

import { createPortal } from "react-dom";
import { Download, FileText, Loader2, Maximize2, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { base64ToArrayBuffer } from "@/lib/legal/smart-closing/docx-to-html";
import type { ContractTemplateInput } from "@/types/contracts";
import { cn } from "@/lib/utils";
import { getSectionCatalogForKind } from "@/lib/contracts/section-addendums/catalog";
import type { PreviewFieldAnchor } from "@/lib/legal/smart-closing/preview-field-anchors";

const KIND_LABEL: Record<ContractTemplateInput["kind"], string> = {
  arras: "Contrato de arras",
  senal_compra: "Señal de compra",
  oferta_firme: "Oferta en firme",
  anexo_mobiliario: "Anexo mobiliario",
};

interface DocxPreviewPanelProps {
  contractTemplateInput: ContractTemplateInput;
  docxBase64: string | null;
  docxFileName: string | null;
  previewHtml: string;
  loading: boolean;
  converting: boolean;
  previewFieldAnchors?: PreviewFieldAnchor[];
  onAddDetailClick?: (sectionId: string) => void;
  onDeleteClauseClick?: (clauseNumber: number) => void;
  onInlineFieldSave?: (path: string, rawValue: string) => Promise<boolean>;
  renderInlineEditor?: (sectionId: string, onClose: () => void) => React.ReactNode;
  renderClauseInlineEditor?: (onClose: () => void) => React.ReactNode;
  renderInlineFieldEditor?: (
    anchor: PreviewFieldAnchor,
    onClose: () => void,
  ) => React.ReactNode;
}

/**
 * Marca interna que aplicamos al wrapper de cada sección interactiva.
 * Usamos un id único por instancia para no entrar en conflicto con
 * estilos globales ni con un segundo preview (Ampliado).
 */
const INTERACTIVE_SECTION_CLASS = "urus-interactive-section";
const ADD_DETAIL_BTN_CLASS = "urus-add-detail-btn";
const ADD_CLAUSE_ZONE_CLASS = "urus-add-clause-zone";
const ADD_CLAUSE_BTN_CLASS = "urus-add-clause-btn";
const INTERACTIVE_CLAUSE_HEADING_CLASS = "urus-interactive-clause-heading";
const DELETE_CLAUSE_BTN_CLASS = "urus-delete-clause-btn";
const INTERACTIVE_FIELD_VALUE_CLASS = "urus-inline-field-value";
const PREVIEW_DEBUG = true;

function previewDebugLog(...args: unknown[]) {
  if (!PREVIEW_DEBUG) return;
  console.log("[DocxPreviewDebug]", ...args);
}

interface PreviewSurfaceProps {
  html: string;
  sectionCatalog: ReturnType<typeof getSectionCatalogForKind>;
  previewFieldAnchors: PreviewFieldAnchor[];
  onSectionClick: (sectionId: string) => void;
  onAddClauseClick: () => void;
  onDeleteClauseClick: (clauseNumber: number) => void;
  onFieldClick: (path: string) => void;
  activeInlineSectionId: string | null;
  activeClauseEditor: boolean;
  activeInlineFieldPath: string | null;
  renderInlineEditor?: (sectionId: string, onClose: () => void) => React.ReactNode;
  renderClauseInlineEditor?: (onClose: () => void) => React.ReactNode;
  renderInlineFieldEditor?: (
    anchor: PreviewFieldAnchor,
    onClose: () => void,
  ) => React.ReactNode;
  onCloseInline: () => void;
  onCloseClauseInline: () => void;
  onCloseInlineField: () => void;
}

/**
 * Componente que renderiza el HTML del DOCX (vía mammoth) y, post-mount,
 * detecta las secciones interactivas en el DOM, las wrappea en un div con
 * borde, e inyecta el botón "+" (estilo Notion). El editor inline se
 * monta vía portal dentro del propio wrapper.
 */
function InteractivePreviewSurface({
  html,
  sectionCatalog,
  previewFieldAnchors,
  onSectionClick,
  onAddClauseClick,
  onDeleteClauseClick,
  onFieldClick,
  activeInlineSectionId,
  activeClauseEditor,
  activeInlineFieldPath,
  renderInlineEditor,
  renderClauseInlineEditor,
  renderInlineFieldEditor,
  onCloseInline,
  onCloseClauseInline,
  onCloseInlineField,
}: PreviewSurfaceProps) {
  const containerId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const onSectionClickRef = useRef(onSectionClick);
  const onAddClauseClickRef = useRef(onAddClauseClick);
  const onDeleteClauseClickRef = useRef(onDeleteClauseClick);
  const onFieldClickRef = useRef(onFieldClick);

  useEffect(() => {
    onSectionClickRef.current = onSectionClick;
  }, [onSectionClick]);

  useEffect(() => {
    onAddClauseClickRef.current = onAddClauseClick;
  }, [onAddClauseClick]);

  useEffect(() => {
    onDeleteClauseClickRef.current = onDeleteClauseClick;
  }, [onDeleteClauseClick]);

  useEffect(() => {
    onFieldClickRef.current = onFieldClick;
  }, [onFieldClick]);

  // Importante: seteamos innerHTML manualmente SOLO cuando cambia `html`.
  // Así evitamos que React sobrescriba el DOM mutado (wrappers + listeners)
  // en re-renders por estado interno.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = html;
    previewDebugLog("raw html injected", { htmlLength: html.length });
  }, [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (sectionCatalog.length === 0) return;
    previewDebugLog("init interactive surface", {
      htmlLength: html.length,
      sectionCatalogSize: sectionCatalog.length,
      sectionCatalog,
    });

    // Mapa: texto normalizado del heading -> sectionId
    // Normalizamos quitando espacios extra y pasando a minúsculas para
    // tolerar variaciones (mammoth a veces añade espacios sutiles).
    const headingMap = new Map<string, string>();
    for (const entry of sectionCatalog) {
      if (!entry.docxHeading) continue;
      const normalized = entry.docxHeading.trim().toLowerCase().replace(/\s+/g, " ");
      headingMap.set(normalized, entry.id);
    }
    previewDebugLog("heading map built", {
      size: headingMap.size,
      keys: Array.from(headingMap.keys()),
    });

    if (headingMap.size === 0) {
      // Nada que enriquecer para este tipo de contrato.
      previewDebugLog("abort: no docxHeading configured in catalog");
      return;
    }

    // Limpieza de wrappings previos (por si el HTML cambió):
    // sacamos los hijos de cualquier wrapper anterior y eliminamos el wrapper.
    container.querySelectorAll(`.${INTERACTIVE_SECTION_CLASS}`).forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) return;
      // Quitamos botones inyectados antes de devolver los nodos al árbol.
      wrapper.querySelectorAll(`.${ADD_DETAIL_BTN_CLASS}`).forEach((b) => b.remove());
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    });
    container.querySelectorAll(`.${ADD_CLAUSE_ZONE_CLASS}`).forEach((zone) => zone.remove());
    container.querySelectorAll(`.${INTERACTIVE_CLAUSE_HEADING_CLASS}`).forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (!parent) return;
      wrapper.querySelectorAll(`.${DELETE_CLAUSE_BTN_CLASS}`).forEach((b) => b.remove());
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    });
    container.querySelectorAll(`.${INTERACTIVE_FIELD_VALUE_CLASS}`).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });

    // Localizamos los nodos que parecen heading estructural:
    // <p><strong>...</strong></p> cuyo texto es exactamente el del <strong>.
    // Luego, de esos headings, solo algunos serán "editables" (los del catálogo).
    type SectionStart = { node: Element; sectionId: string };
    const starts: SectionStart[] = [];
    const headingLikeNodes = new Set<Element>();

    const candidates = Array.from(container.querySelectorAll("p")) as HTMLElement[];
    previewDebugLog("paragraph candidates found", candidates.length);
    for (const p of candidates) {
      const strong = p.querySelector("strong");
      if (!strong) continue;
      // El texto del párrafo debe ser SOLO el heading, sin más cuerpo
      // (evitamos falsos positivos como "Esta cláusula primera...").
      const fullText = (p.textContent ?? "").trim();
      const strongText = (strong.textContent ?? "").trim();
      if (strongText.length === 0) continue;
      if (strongText !== fullText) continue;
      headingLikeNodes.add(p);

      const normalized = strongText.toLowerCase().replace(/\s+/g, " ");
      const sectionId = headingMap.get(normalized);
      if (sectionId) {
        starts.push({ node: p, sectionId });
        previewDebugLog("matched section heading", { normalized, sectionId, fullText });
      }
    }
    previewDebugLog("section starts detected", {
      count: starts.length,
      sectionIds: starts.map((s) => s.sectionId),
    });

    if (starts.length === 0) {
      // No matcheó ningún heading; no hay nada que wrappear.
      // Esto pasaría si el catálogo no tiene `docxHeading` configurado
      // o si los builders cambian la redacción literal.
      console.warn(
        "[InteractivePreviewSurface] No section headings matched. Catalog has",
        sectionCatalog.length,
        "entries with docxHeading:",
        Array.from(headingMap.keys()),
      );
      previewDebugLog(
        "sample strong headings in DOM",
        candidates
          .map((p) => (p.querySelector("strong")?.textContent ?? "").trim())
          .filter(Boolean)
          .slice(0, 25),
      );
      return;
    }

    // Por cada heading editable encontrado, agrupamos el heading + todos los
    // siguientes hermanos hasta el próximo heading estructural (o el final).
    for (const start of starts) {
      const parent = start.node.parentNode;
      if (!parent) continue;
      previewDebugLog("wrapping section", { sectionId: start.sectionId });

      // Construimos el wrapper.
      const wrapper = document.createElement("div");
      wrapper.className = `${INTERACTIVE_SECTION_CLASS} group relative my-2 -mx-3 rounded-md border border-transparent p-3 transition-all hover:border-border hover:bg-accent/30`;
      wrapper.setAttribute("data-section-id", start.sectionId);
      wrapper.addEventListener("mouseenter", () => {
        previewDebugLog("section hover", { sectionId: start.sectionId });
      });

      // Botón "+ Añadir detalle" (oculto, aparece en hover).
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${ADD_DETAIL_BTN_CLASS} absolute -top-3 right-3 z-10 hidden items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground shadow-card transition-colors hover:bg-accent focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group-hover:flex`;
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        <span>Añadir detalle</span>
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        previewDebugLog("add button clicked", { sectionId: start.sectionId });
        onSectionClickRef.current(start.sectionId);
      });
      wrapper.appendChild(btn);

      // Insertamos el wrapper antes del nodo heading.
      parent.insertBefore(wrapper, start.node);

      // Movemos al wrapper el heading y todos los siguientes hermanos
      // hasta encontrar otro heading estructural o llegar al final.
      let current: ChildNode | null = start.node;
      while (current) {
        const next: ChildNode | null = current.nextSibling;
        // Si el nodo actual ya es otro heading estructural, paramos
        // (sin mover ese nodo, para que el siguiente wrapper lo procese).
        if (
          current !== start.node &&
          current instanceof Element &&
          headingLikeNodes.has(current)
        ) {
          break;
        }
        wrapper.appendChild(current);
        current = next;
        if (
          current &&
          current instanceof Element &&
          headingLikeNodes.has(current)
        ) {
          break;
        }
      }
    }
    previewDebugLog("wrapping finished", {
      wrappersInDom: container.querySelectorAll(`.${INTERACTIVE_SECTION_CLASS}`).length,
    });

    if (renderClauseInlineEditor) {
      const zone = document.createElement("div");
      zone.className = `${ADD_CLAUSE_ZONE_CLASS} mt-6 w-full`;

      const btnRow = document.createElement("div");
      btnRow.className = "flex justify-center";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${ADD_CLAUSE_BTN_CLASS} inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`;
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        <span>Añadir cláusula</span>
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        previewDebugLog("add clause button clicked");
        onAddClauseClickRef.current();
      });
      btnRow.appendChild(btn);
      zone.appendChild(btnRow);
      container.appendChild(zone);
    }

    if (renderClauseInlineEditor) {
      const clauseHeadingRegex = /^CLAUSULA\s+(\d+)\s*\.-/i;
      const headingCandidates = Array.from(container.querySelectorAll("p")) as HTMLElement[];
      for (const p of headingCandidates) {
        const strong = p.querySelector("strong");
        if (!strong) continue;
        const fullText = (p.textContent ?? "").trim();
        const strongText = (strong.textContent ?? "").trim();
        if (!fullText || fullText !== strongText) continue;
        const match = fullText.match(clauseHeadingRegex);
        if (!match) continue;

        const clauseNumber = Number(match[1]);
        if (!Number.isFinite(clauseNumber)) continue;
        const parent = p.parentNode;
        if (!parent) continue;

        const row = document.createElement("div");
        row.className = `${INTERACTIVE_CLAUSE_HEADING_CLASS} group relative my-1 -mx-2 rounded-md px-2 py-0.5`;
        parent.insertBefore(row, p);
        row.appendChild(p);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = `${DELETE_CLAUSE_BTN_CLASS} absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1 text-[11px] text-destructive shadow-sm transition-colors hover:bg-destructive/10 focus-visible:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background group-hover:inline-flex`;
        deleteBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          <span>Borrar</span>
        `;
        deleteBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          onDeleteClauseClickRef.current(clauseNumber);
        });
        row.appendChild(deleteBtn);
      }
    }

    if (previewFieldAnchors.length > 0) {
      const findTextNodes = (needle: string): Text[] => {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const found: Text[] = [];
        let current = walker.nextNode();
        while (current) {
          const node = current as Text;
          const parent = node.parentElement;
          if (!parent) {
            current = walker.nextNode();
            continue;
          }
          if (
            parent.closest(`.${INTERACTIVE_FIELD_VALUE_CLASS}`) ||
            parent.closest(`.${ADD_CLAUSE_ZONE_CLASS}`)
          ) {
            current = walker.nextNode();
            continue;
          }
          if (node.textContent?.includes(needle)) {
            found.push(node);
          }
          current = walker.nextNode();
        }
        return found;
      };

      const sortedAnchors = [...previewFieldAnchors]
        .filter((anchor) => anchor.value.trim().length >= 2)
        .sort((a, b) => b.value.length - a.value.length);

      for (const anchor of sortedAnchors) {
        const nodes = findTextNodes(anchor.value);
        if (nodes.length === 0) continue;

        for (const node of nodes) {
          const text = node.textContent ?? "";
          if (!text.includes(anchor.value)) continue;

          const parts = text.split(anchor.value);
          const frag = document.createDocumentFragment();

          parts.forEach((part, i) => {
            if (part) frag.appendChild(document.createTextNode(part));
            if (i >= parts.length - 1) return;

            const span = document.createElement("span");
            span.className = `${INTERACTIVE_FIELD_VALUE_CLASS}`;
            span.setAttribute("data-field-path", anchor.path);
            span.setAttribute("data-field-label", anchor.label);
            span.setAttribute("title", `Editar: ${anchor.label}`);
            span.setAttribute("tabindex", "0");
            span.setAttribute("role", "button");
            span.setAttribute("aria-label", `Editar campo ${anchor.label}`);
            span.textContent = anchor.value;
            span.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              onFieldClickRef.current(anchor.path);
            });
            span.addEventListener("keydown", (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              onFieldClickRef.current(anchor.path);
            });
            frag.appendChild(span);
          });

          node.parentNode?.replaceChild(frag, node);
        }
      }
    }

    if (previewFieldAnchors.length > 0) {
      previewDebugLog("field anchors injected", {
        count: previewFieldAnchors.length,
        domAnchors: container.querySelectorAll(`.${INTERACTIVE_FIELD_VALUE_CLASS}`).length,
      });
    }

    return () => {
      previewDebugLog("cleanup wrappers");
      // Cleanup al desmontar o cuando el html cambie: deshacer los wrappers.
      container.querySelectorAll(`.${INTERACTIVE_SECTION_CLASS}`).forEach((wrapper) => {
        const parent = wrapper.parentNode;
        if (!parent) return;
        wrapper.querySelectorAll(`.${ADD_DETAIL_BTN_CLASS}`).forEach((b) => b.remove());
        while (wrapper.firstChild) {
          parent.insertBefore(wrapper.firstChild, wrapper);
        }
        parent.removeChild(wrapper);
      });
      container.querySelectorAll(`.${ADD_CLAUSE_ZONE_CLASS}`).forEach((zone) => zone.remove());
      container.querySelectorAll(`.${INTERACTIVE_CLAUSE_HEADING_CLASS}`).forEach((wrapper) => {
        const parent = wrapper.parentNode;
        if (!parent) return;
        wrapper.querySelectorAll(`.${DELETE_CLAUSE_BTN_CLASS}`).forEach((b) => b.remove());
        while (wrapper.firstChild) {
          parent.insertBefore(wrapper.firstChild, wrapper);
        }
        parent.removeChild(wrapper);
      });
      container.querySelectorAll(`.${INTERACTIVE_FIELD_VALUE_CLASS}`).forEach((span) => {
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
      });
    };
  }, [html, previewFieldAnchors, sectionCatalog, renderClauseInlineEditor]);

  const inlineHost = useMemo(() => {
    if (!activeInlineSectionId || typeof document === "undefined") return null;
    const root = document.getElementById(containerId);
    if (!root) return null;
    const found = root.querySelector<HTMLDivElement>(`[data-section-id="${activeInlineSectionId}"]`);
    previewDebugLog("inline host lookup", {
      activeInlineSectionId,
      found: !!found,
    });
    return found;
  }, [activeInlineSectionId, containerId]);

  const clauseInlineHost = useMemo(() => {
    if (!activeClauseEditor || typeof document === "undefined") return null;
    const root = document.getElementById(containerId);
    return root?.querySelector<HTMLDivElement>(`.${ADD_CLAUSE_ZONE_CLASS}`) ?? null;
  }, [activeClauseEditor, containerId]);

  const inlineFieldHost = useMemo(() => {
    if (!activeInlineFieldPath || typeof document === "undefined") return null;
    const root = document.getElementById(containerId);
    if (!root) return null;
    return Array.from(root.querySelectorAll<HTMLSpanElement>(`.${INTERACTIVE_FIELD_VALUE_CLASS}`)).find(
      (node) => node.getAttribute("data-field-path") === activeInlineFieldPath,
    ) ?? null;
  }, [activeInlineFieldPath, containerId]);

  const activeInlineFieldAnchor = useMemo(() => {
    if (!activeInlineFieldPath) return null;
    return previewFieldAnchors.find((anchor) => anchor.path === activeInlineFieldPath) ?? null;
  }, [activeInlineFieldPath, previewFieldAnchors]);

  return (
    <>
      <div ref={containerRef} id={containerId} className="contract-mammoth-preview" />
      {inlineHost && renderInlineEditor && activeInlineSectionId
        ? createPortal(
            <div className="mt-4 rounded-md border border-border bg-card p-4 text-card-foreground shadow-card">
              {renderInlineEditor(activeInlineSectionId, onCloseInline)}
            </div>,
            inlineHost,
          )
        : null}
      {clauseInlineHost && renderClauseInlineEditor
        ? createPortal(
            <div className="mt-3 w-full rounded-md border border-border bg-card p-4 text-card-foreground shadow-card">
              {renderClauseInlineEditor(onCloseClauseInline)}
            </div>,
            clauseInlineHost,
          )
        : null}
      {inlineFieldHost && renderInlineFieldEditor && activeInlineFieldAnchor
        ? createPortal(
            <div className="mt-2 rounded-md border border-border bg-card p-3 text-card-foreground shadow-card">
              {renderInlineFieldEditor(activeInlineFieldAnchor, onCloseInlineField)}
            </div>,
            inlineFieldHost,
          )
        : null}
    </>
  );
}

export function DocxPreviewPanel({
  contractTemplateInput,
  docxBase64,
  docxFileName,
  previewHtml,
  loading,
  converting,
  previewFieldAnchors = [],
  onAddDetailClick,
  onDeleteClauseClick,
  onInlineFieldSave,
  renderInlineEditor,
  renderClauseInlineEditor,
  renderInlineFieldEditor,
}: DocxPreviewPanelProps) {
  const downloadObjectUrlRef = useRef<string | null>(null);
  const [expandOpen, setExpandOpen] = useState(false);
  const [activeInlineSectionId, setActiveInlineSectionId] = useState<string | null>(null);
  const [activeClauseEditor, setActiveClauseEditor] = useState(false);
  const [activeInlineFieldPath, setActiveInlineFieldPath] = useState<string | null>(null);

  const sectionCatalog = useMemo(
    () => getSectionCatalogForKind(contractTemplateInput.kind),
    [contractTemplateInput.kind],
  );

  const handleSectionClick = useCallback(
    (sectionId: string) => {
      previewDebugLog("handleSectionClick", {
        sectionId,
        hasInlineRenderer: !!renderInlineEditor,
        hasFallbackHandler: !!onAddDetailClick,
      });
      if (renderInlineEditor) {
        setActiveClauseEditor(false);
        setActiveInlineFieldPath(null);
        setActiveInlineSectionId(sectionId);
      } else if (onAddDetailClick) {
        onAddDetailClick(sectionId);
      }
    },
    [renderInlineEditor, onAddDetailClick],
  );

  const handleCloseInline = useCallback(() => {
    setActiveInlineSectionId(null);
  }, []);

  const handleAddClauseClick = useCallback(() => {
    setActiveInlineSectionId(null);
    setActiveInlineFieldPath(null);
    setActiveClauseEditor(true);
  }, []);

  const handleCloseClauseInline = useCallback(() => {
    setActiveClauseEditor(false);
  }, []);

  const handleDeleteClauseClick = useCallback(
    (clauseNumber: number) => {
      onDeleteClauseClick?.(clauseNumber);
    },
    [onDeleteClauseClick],
  );

  const handleFieldClick = useCallback(
    (path: string) => {
      if (!renderInlineFieldEditor || !onInlineFieldSave) return;
      setActiveInlineSectionId(null);
      setActiveClauseEditor(false);
      setActiveInlineFieldPath(path);
    },
    [onInlineFieldSave, renderInlineFieldEditor],
  );

  const handleCloseInlineField = useCallback(() => {
    setActiveInlineFieldPath(null);
  }, []);

  useEffect(() => {
    return () => {
      if (downloadObjectUrlRef.current) {
        URL.revokeObjectURL(downloadObjectUrlRef.current);
        downloadObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleDownload = useCallback(() => {
    if (!docxBase64 || !docxFileName) return;
    const buffer = base64ToArrayBuffer(docxBase64);
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    if (downloadObjectUrlRef.current) {
      URL.revokeObjectURL(downloadObjectUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    downloadObjectUrlRef.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = docxFileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [docxBase64, docxFileName]);

  const showSkeleton = loading || converting;
  const canExpand = !showSkeleton && Boolean(previewHtml);

  const previewSkeleton = (
    <div className="space-y-4 px-2">
      <Skeleton className="h-5 w-48 mx-auto" />
      <Skeleton className="h-3 w-32 mx-auto" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[92%]" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 w-full flex-col overflow-hidden">
        <div className="border-b border-border bg-background px-4 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] font-medium">{KIND_LABEL[contractTemplateInput.kind]}</span>
            {sectionCatalog.some((s) => s.docxHeading) && !showSkeleton && previewHtml ? (
              <span className="ml-2 hidden items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground sm:inline-flex">
                <Plus className="h-2.5 w-2.5" />
                Pasa el cursor sobre una sección para añadir detalle
              </span>
            ) : null}
            {previewFieldAnchors.length > 0 && !showSkeleton && previewHtml ? (
              <span className="hidden rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary sm:inline-flex">
                Variables resaltadas: click para editar
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              disabled={!canExpand}
              onClick={() => setExpandOpen(true)}
            >
              <Maximize2 className="h-3 w-3" />
              Ampliar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              disabled={!docxBase64 || !docxFileName}
              onClick={handleDownload}
            >
              {converting && !previewHtml ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              DOCX
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-muted/30 contract-preview-word-canvas overflow-auto">
          <div className="flex justify-center py-6 px-4 min-h-full">
            <div className={cn("contract-paper", "contract-paper--embedded")}>
              {showSkeleton ? (
                previewSkeleton
              ) : (
                <InteractivePreviewSurface
                  html={previewHtml}
                  sectionCatalog={sectionCatalog}
                  previewFieldAnchors={previewFieldAnchors}
                  onSectionClick={handleSectionClick}
                  onAddClauseClick={handleAddClauseClick}
                  onDeleteClauseClick={handleDeleteClauseClick}
                  onFieldClick={handleFieldClick}
                  activeInlineSectionId={activeInlineSectionId}
                  activeClauseEditor={activeClauseEditor}
                  activeInlineFieldPath={activeInlineFieldPath}
                  renderInlineEditor={renderInlineEditor}
                  renderClauseInlineEditor={renderClauseInlineEditor}
                  renderInlineFieldEditor={renderInlineFieldEditor}
                  onCloseInline={handleCloseInline}
                  onCloseClauseInline={handleCloseClauseInline}
                  onCloseInlineField={handleCloseInlineField}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={expandOpen} onOpenChange={setExpandOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "flex h-[min(92vh,960px)] max-h-[min(92vh,960px)] w-[min(96vw,1280px)] max-w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0",
            "top-[4%] left-1/2 -translate-x-1/2 translate-y-0 sm:top-[5%]",
            "sm:max-w-[min(96vw,1280px)]",
          )}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 text-left">
            <DialogTitle className="text-base">
              Vista previa — {KIND_LABEL[contractTemplateInput.kind]}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto bg-white contract-preview-word-canvas">
            <div className="flex justify-center p-6 pb-10">
              <div className={cn("contract-paper", "contract-paper--expanded")}>
                {showSkeleton ? (
                  previewSkeleton
                ) : (
                  <InteractivePreviewSurface
                    html={previewHtml}
                    sectionCatalog={sectionCatalog}
                    previewFieldAnchors={previewFieldAnchors}
                    onSectionClick={handleSectionClick}
                    onAddClauseClick={handleAddClauseClick}
                    onDeleteClauseClick={handleDeleteClauseClick}
                    onFieldClick={handleFieldClick}
                    activeInlineSectionId={activeInlineSectionId}
                    activeClauseEditor={activeClauseEditor}
                    activeInlineFieldPath={activeInlineFieldPath}
                    renderInlineEditor={renderInlineEditor}
                    renderClauseInlineEditor={renderClauseInlineEditor}
                    renderInlineFieldEditor={renderInlineFieldEditor}
                    onCloseInline={handleCloseInline}
                    onCloseClauseInline={handleCloseClauseInline}
                    onCloseInlineField={handleCloseInlineField}
                  />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
