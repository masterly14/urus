import { FileText, ShieldCheck, CheckCircle2, XCircle, Smartphone, KeyRound, Loader2, RefreshCw, PenLine, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function FirmaHeader({
  operationId,
  documentTitle,
  isUiMock,
}: {
  operationId: string;
  documentTitle: string;
  isUiMock?: boolean;
}) {
  return (
    <header className="flex-none border-b border-slate-200 bg-white sticky top-0 z-20 shadow-sm">
      <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Firma Electrónica Segura
            </p>
            <p className="text-base font-semibold text-slate-900 leading-tight">
              {documentTitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div className="hidden md:block">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Expediente</p>
            <p className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {operationId}
            </p>
          </div>
        </div>
      </div>
      {isUiMock && (
        <div className="bg-urus-warning/10 border-b border-urus-warning/30 text-urus-warning">
          <p className="px-4 py-2 text-center text-xs font-medium md:px-6">
            Vista previa (mock): datos y PDF de demostración. Añade{" "}
            <code className="rounded bg-urus-warning/20 px-1 py-0.5 text-urus-warning border border-urus-warning/30">?mock=1</code> a la URL.
          </p>
        </div>
      )}
    </header>
  );
}

export function DeclineBlock({
  declineReason,
  setDeclineReason,
  declining,
  onDecline,
}: {
  declineReason: string;
  setDeclineReason: (v: string) => void;
  declining: boolean;
  onDecline: () => void | Promise<void>;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full text-xs text-slate-500 hover:text-urus-danger hover:bg-urus-danger/10 mt-4 transition-colors">
          No deseo firmar este documento
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-900">¿Rechazar la firma?</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-500">
            Si rechazas, el documento volverá a estado borrador y el equipo será notificado. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Textarea
            placeholder="Motivo del rechazo (opcional)"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            className="text-sm border-slate-200 focus:border-slate-400 focus:ring-slate-400"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-slate-200 text-slate-700 hover:bg-slate-50">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDecline}
            disabled={declining}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {declining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rechazando…
              </>
            ) : (
              "Confirmar rechazo"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StatusCard({
  status,
  date,
  documentUrl,
}: {
  status: "done" | "declined";
  date?: string;
  documentUrl?: string | null;
}) {
  if (status === "declined") {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-red-50 rounded-lg border border-red-100">
        <div className="rounded-full bg-red-100 p-3">
          <XCircle className="h-10 w-10 text-urus-danger" />
        </div>
        <div>
          <p className="text-lg font-semibold text-urus-danger">Firma rechazada</p>
          <p className="text-sm text-urus-danger/80 mt-1 max-w-sm">
            Has indicado que no deseas firmar este documento. El equipo ha sido notificado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-emerald-50 rounded-lg border border-emerald-100">
      <div className="rounded-full bg-emerald-100 p-3">
        <CheckCircle2 className="h-10 w-10 text-urus-success" />
      </div>
      <div>
        <p className="text-lg font-semibold text-emerald-900">Documento firmado con éxito</p>
        <p className="text-sm text-urus-success mt-1 max-w-sm">
          {date ? `Firmado el ${new Date(date).toLocaleDateString("es-ES")}` : "La firma se ha completado correctamente."}
        </p>
      </div>
      {documentUrl && (
        <Button asChild variant="outline" className="mt-2 bg-white border-urus-success/30 text-urus-success hover:bg-urus-success/10 hover:text-urus-success">
          <a href={documentUrl} target="_blank" rel="noopener noreferrer">
            Descargar documento firmado
          </a>
        </Button>
      )}
    </div>
  );
}
