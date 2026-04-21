"use client";

import { Download, FileText, Loader2, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
}

export function DocxPreviewPanel({
  contractTemplateInput,
  docxBase64,
  docxFileName,
  previewHtml,
  loading,
  converting,
}: DocxPreviewPanelProps) {
  const downloadObjectUrlRef = useRef<string | null>(null);
  const [expandOpen, setExpandOpen] = useState(false);

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
        <div className="border-b border-neutral-200 dark:border-neutral-800 px-4 py-2 flex items-center justify-between gap-2 shrink-0 bg-white dark:bg-neutral-950">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[13px] font-medium">{KIND_LABEL[contractTemplateInput.kind]}</span>
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

        <div className="flex-1 min-h-0 bg-neutral-100 dark:bg-neutral-900 contract-preview-word-canvas overflow-auto">
          <div className="flex justify-center py-6 px-4 min-h-full">
            <div className={cn("contract-paper", "contract-paper--embedded")}>
              {showSkeleton ? (
                previewSkeleton
              ) : (
                <div
                  className="contract-mammoth-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
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
                  <div
                    className="contract-mammoth-preview"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
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
