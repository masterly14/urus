"use client";

import { Mic, Square, Wand2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type VoicePanelPhase = "idle" | "recording" | "transcribing";

export interface SmartClosingVoicePanelProps {
  disabled?: boolean;
  busy?: boolean;
  /** Devuelve true si el contrato se actualizó correctamente (vista previa lista). */
  onApplyTranscript: (transcript: string) => Promise<boolean>;
}

export function SmartClosingVoicePanel({
  disabled,
  busy,
  onApplyTranscript,
}: SmartClosingVoicePanelProps) {
  const [phase, setPhase] = useState<VoicePanelPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setLocalError(null);
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        void (async () => {
          const blob = new Blob(chunksRef.current, { type: mime });
          chunksRef.current = [];
          if (blob.size === 0) {
            setLocalError("No se capturó audio.");
            setPhase("idle");
            return;
          }
          setPhase("transcribing");
          try {
            const form = new FormData();
            form.append("audio", blob, "grabacion.webm");
            form.append("language", "es");
            const res = await fetch("/api/stt/transcribe", {
              method: "POST",
              body: form,
            });
            const data = (await res.json()) as { text?: string; error?: string };
            if (!res.ok) {
              setLocalError(data.error ?? "Error al transcribir");
              setPhase("idle");
              return;
            }
            if (typeof data.text === "string") {
              setTranscript(data.text);
            }
            setPhase("idle");
          } catch {
            setLocalError("Error de red al transcribir");
            setPhase("idle");
          }
        })();
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setPhase("recording");
    } catch {
      setLocalError("No se pudo acceder al micrófono.");
      setPhase("idle");
    }
  }, []);

  const handleApply = useCallback(async () => {
    const t = transcript.trim();
    if (!t) {
      setLocalError("Escribe o dicta una instrucción antes de enviar.");
      return;
    }
    setLocalError(null);
    const ok = await onApplyTranscript(t);
    if (ok) {
      setTranscript("");
    }
  }, [onApplyTranscript, transcript]);

  const isRecording = phase === "recording";
  const isTranscribing = phase === "transcribing";
  const blocked = disabled || busy;

  return (
    <Card
      className={cn(
        "border-border/50 bg-card/60 backdrop-blur-sm transition-all duration-300",
        isRecording && "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          Instrucción por voz
          {isRecording && (
            <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <div className="flex justify-center gap-3 py-2">
          {!isRecording ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-16 w-16 rounded-full p-0"
              disabled={blocked || isTranscribing}
              onClick={startRecording}
              aria-label="Iniciar grabación"
            >
              <Mic className="h-7 w-7" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-16 w-16 rounded-full p-0"
              onClick={stopRecording}
              aria-label="Detener grabación"
            >
              <Square className="h-6 w-6" />
            </Button>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground min-h-[1.25rem]">
          {isRecording && "Grabando… pulsa cuadrado para detener."}
          {isTranscribing && "Transcribiendo…"}
          {!isRecording &&
            !isTranscribing &&
            "Pulsa el micrófono, dicta el cambio y detén. Luego revisa el texto."}
        </p>

        <Textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Transcripción editable (corrige si hace falta)…"
          disabled={blocked || isTranscribing}
          className="min-h-[80px] text-xs"
          aria-label="Transcripción de la instrucción"
        />

        {localError && (
          <p className="text-xs text-destructive" role="alert">
            {localError}
          </p>
        )}

        <Button
          type="button"
          className="w-full gap-2 bg-secondary hover:bg-secondary/90"
          disabled={blocked || isRecording || isTranscribing || !transcript.trim()}
          onClick={handleApply}
        >
          <Wand2 className="h-4 w-4" />
          Aplicar al contrato
        </Button>
      </CardContent>
    </Card>
  );
}
