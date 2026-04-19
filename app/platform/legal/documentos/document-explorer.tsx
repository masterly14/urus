"use client";

import { useState, useMemo } from "react";
import { Folder, ArrowLeft, Download, FileText, ShieldCheck, PenTool, Eye, Calendar, User, Search, FilterX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface DocumentItem {
  id: string;
  operationId: string;
  propertyCode: string;
  documentKind: string;
  status: string;
  parties?: { role: string; fullName: string }[];
  urls: {
    cloudinary?: string | null;
    signed?: string | null;
    audit?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export function DocumentExplorer({ documents }: { documents: DocumentItem[] }) {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const folders = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((doc) => {
      counts[doc.documentKind] = (counts[doc.documentKind] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [documents]);

  const getMainSignerName = (parties?: { role: string; fullName: string }[]) => {
    if (!parties || parties.length === 0) return null;
    const priorityRoles = ["BUYER", "SIGNER", "PURCHASER", "OFFERER", "PROPIETARIO"];
    const mainParty = parties.find((p) => priorityRoles.includes(p.role));
    return mainParty?.fullName ?? parties[0].fullName;
  };

  const currentDocs = useMemo(() => {
    if (!currentFolder) return [];
    
    let filtered = documents.filter((doc) => doc.documentKind === currentFolder);

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((doc) => {
        const matchOp = doc.operationId?.toLowerCase().includes(term);
        const matchProp = doc.propertyCode?.toLowerCase().includes(term);
        const matchSigner = getMainSignerName(doc.parties)?.toLowerCase().includes(term);
        
        return matchOp || matchProp || matchSigner;
      });
    }

    if (startDate) {
      filtered = filtered.filter((doc) => new Date(doc.createdAt) >= new Date(startDate));
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((doc) => new Date(doc.createdAt) <= end);
    }

    return filtered;
  }, [documents, currentFolder, searchTerm, startDate, endDate]);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "SIGNED":
        return "default";
      case "SENT_TO_SIGNATURE":
        return "secondary";
      case "APPROVED":
        return "outline";
      case "DECLINED":
      case "CANCELED":
      case "EXPIRED":
        return "destructive";
      default:
        return "outline";
    }
  };

  const handleDownload = async (url: string | null | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url) return;
    
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = url.split("/").pop() || "documento.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error al descargar el archivo:", error);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handlePreview = (url: string | null | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (!currentFolder) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {folders.map((folder) => (
          <Card
            key={folder.name}
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => setCurrentFolder(folder.name)}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <Folder className="h-10 w-10 text-primary" />
              <div>
                <h3 className="font-semibold capitalize">{folder.name.replace(/_/g, " ")}</h3>
                <p className="text-sm text-muted-foreground">
                  {folder.count} {folder.count === 1 ? "documento" : "documentos"}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center pb-4">
        <div className="flex items-center">
          <Button variant="ghost" size="sm" onClick={() => { setCurrentFolder(null); setSearchTerm(""); setStartDate(""); setEndDate(""); }} className="mr-4 hover:bg-muted/60">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a carpetas
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-md">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold capitalize tracking-wide">{currentFolder.replace(/_/g, " ")}</h3>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, op..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-background text-sm w-[130px]"
                title="Fecha inicio"
              />
            </div>
            <span className="text-muted-foreground text-sm">-</span>
            <div className="relative">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-background text-sm w-[130px]"
                title="Fecha fin"
              />
            </div>
            {(searchTerm || startDate || endDate) && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => { setSearchTerm(""); setStartDate(""); setEndDate(""); }}
                title="Limpiar filtros"
                className="shrink-0"
              >
                <FilterX className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {currentDocs.length === 0 ? (
          <div className="col-span-full h-32 flex items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
            Carpeta vacía.
          </div>
        ) : (
          currentDocs.map((doc) => (
            <Card key={doc.id} className="flex flex-col h-full overflow-hidden transition-all hover:shadow-md border-transparent bg-card shadow-sm ring-1 ring-border/50">
              <div className="p-5 flex justify-between items-start gap-4">
                <div className="overflow-hidden">
                  <h4 className="font-semibold text-base truncate" title={doc.operationId}>{doc.operationId}</h4>
                  <p className="text-xs text-muted-foreground truncate" title={doc.propertyCode}>{doc.propertyCode}</p>
                </div>
                <Badge variant={getStatusBadgeVariant(doc.status)} className="shrink-0 shadow-sm">
                  {doc.status}
                </Badge>
              </div>
              
              <CardContent className="px-5 pb-5 pt-0 flex-1 flex flex-col gap-4">
                <div className="space-y-3 bg-muted/20 p-4 rounded-xl">
                  {getMainSignerName(doc.parties) && (
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Titular</span>
                        <span className="font-medium truncate text-foreground" title={getMainSignerName(doc.parties) || undefined}>
                          {getMainSignerName(doc.parties)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background border text-muted-foreground shadow-sm">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fecha de Creación</span>
                      <span className="font-medium text-foreground">
                        {new Date(doc.createdAt).toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">Documentos disponibles</p>
                  
                  {doc.urls.cloudinary && (
                    <div className="flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors p-2.5 rounded-lg group">
                      <div className="flex items-center gap-3 overflow-hidden mr-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm border border-border/50">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium truncate text-foreground/90">Borrador Original</span>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-background" onClick={(e) => handlePreview(doc.urls.cloudinary, e)} title="Previsualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-background" onClick={(e) => handleDownload(doc.urls.cloudinary, e)} title="Descargar">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {doc.urls.signed && (
                    <div className="flex items-center justify-between bg-primary/5 hover:bg-primary/10 transition-colors p-2.5 rounded-lg group border border-primary/10">
                      <div className="flex items-center gap-3 overflow-hidden mr-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm border border-primary/20">
                          <PenTool className="h-4 w-4 text-primary" />
                        </div>
                        <span className="text-sm font-medium truncate text-primary">Documento Firmado</span>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-background border-primary/20 hover:bg-primary/10 hover:text-primary" onClick={(e) => handlePreview(doc.urls.signed, e)} title="Previsualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-background border-primary/20 hover:bg-primary/10 hover:text-primary" onClick={(e) => handleDownload(doc.urls.signed, e)} title="Descargar">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {doc.urls.audit && (
                    <div className="flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors p-2.5 rounded-lg group">
                      <div className="flex items-center gap-3 overflow-hidden mr-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background shadow-sm border border-border/50">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium truncate text-foreground/90">Audit Trail</span>
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-background" onClick={(e) => handlePreview(doc.urls.audit, e)} title="Previsualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 bg-background" onClick={(e) => handleDownload(doc.urls.audit, e)} title="Descargar">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
