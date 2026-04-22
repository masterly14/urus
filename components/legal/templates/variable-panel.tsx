"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Check } from "lucide-react";
import type { Editor } from "@tiptap/react";
import type { ContractDocumentKind } from "@/types/contracts";
import type { VariableCatalogEntry, VariableCategory } from "@/types/contract-template";
import {
  getVariablesByCategory,
  VARIABLE_CATEGORY_LABELS,
} from "@/lib/contracts/templates/variable-catalog";
import { cn } from "@/lib/utils";

interface Props {
  documentKind: ContractDocumentKind;
  editor: Editor | null;
}

export function VariablePanel({ documentKind, editor }: Props) {
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["comprador_vendedor", "inmueble", "importes"]),
  );
  const [insertedPath, setInsertedPath] = useState<string | null>(null);

  const grouped = useMemo(
    () => getVariablesByCategory(documentKind),
    [documentKind],
  );

  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const result: Partial<Record<VariableCategory, VariableCatalogEntry[]>> = {};
    for (const [cat, entries] of Object.entries(grouped)) {
      const filtered = entries.filter(
        (e) =>
          e.label.toLowerCase().includes(q) ||
          e.exampleValue.toLowerCase().includes(q),
      );
      if (filtered.length > 0) result[cat as VariableCategory] = filtered;
    }
    return result as Record<VariableCategory, VariableCatalogEntry[]>;
  }, [grouped, search]);

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function insertVariable(entry: VariableCatalogEntry) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "contractVariable",
        attrs: {
          variablePath: entry.path,
          label: entry.label,
          sourceType: entry.sourceType,
        },
      })
      .run();

    setInsertedPath(entry.path);
    setTimeout(() => setInsertedPath(null), 1200);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-[13px] font-semibold text-neutral-800 mb-1">
          Datos del contrato
        </h3>
        <p className="text-[11px] text-neutral-500 leading-relaxed mb-3">
          Coloca el cursor en el documento y haz clic en un dato para insertarlo.
        </p>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[13px] rounded border border-neutral-200 bg-white text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 transition-colors"
          />
        </div>
      </div>

      <div className="h-px bg-neutral-100" />

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(filteredGrouped).map(([category, entries]) => {
          if (!entries || entries.length === 0) return null;
          const expanded = expandedCategories.has(category);
          const label = VARIABLE_CATEGORY_LABELS[category as VariableCategory] ?? category;

          return (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-2 px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <span>{label}</span>
              </button>

              {expanded && (
                <div className="pb-2">
                  {entries.map((entry) => {
                    const justInserted = insertedPath === entry.path;

                    return (
                      <button
                        key={entry.path}
                        onClick={() => insertVariable(entry)}
                        className={cn(
                          "w-full text-left px-4 py-1.5 transition-colors group",
                          "hover:bg-neutral-50",
                          justInserted && "bg-neutral-50",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {justInserted ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-urus-success" />
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0" />
                          )}

                          <div className="min-w-0 flex-1">
                            <span className={cn(
                              "text-[13px] block truncate",
                              justInserted
                                ? "text-urus-success"
                                : "text-neutral-700 group-hover:text-neutral-900",
                            )}>
                              {justInserted ? "Insertada" : entry.label}
                            </span>

                            {!justInserted && (
                              <span className="text-[11px] text-neutral-400 block truncate">
                                Ej: {entry.exampleValue}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="h-px bg-neutral-100 mx-4" />
            </div>
          );
        })}

        {Object.keys(filteredGrouped).length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-[13px] text-neutral-400">
              Sin resultados
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
