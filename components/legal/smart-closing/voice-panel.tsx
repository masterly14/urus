"use client";

import { Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type VoicePanelPhase = "idle" | "recording" | "transcribing";

interface AssistantBubble {
  id: string;
  text: string;
  type: "assistant" | "user" | "missing-data";
}

export interface SmartClosingVoicePanelProps {
  disabled?: boolean;
  busy?: boolean;
  onApplyTranscript: (transcript: string) => Promise<boolean>;
  assistantMessage?: string;
  missingDataQuestions?: string[];
  clarificationQuestions?: string[];
  appliedSummaries?: string[];
}

export function SmartClosingVoicePanel({
  disabled,
  busy,
  onApplyTranscript,
  assistantMessage,
  missingDataQuestions,
  clarificationQuestions,
}: SmartClosingVoicePanelProps) {
  const [phase, setPhase] = useState<VoicePanelPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<AssistantBubble[]>([
    {
      id: "welcome",
      text: "Hola, soy tu asistente de contratos. Puedes dictarme cambios de precio, plazos, clausulas nuevas... lo que necesites. Pulsa el microfono o escribe directamente.",
      type: "assistant",
    },
  ]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const prevAssistantMsgRef = useRef<string>("");

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  useEffect(() => {
    if (assistantMessage && assistantMessage !== prevAssistantMsgRef.current) {
      prevAssistantMsgRef.current = assistantMessage;
      queueMicrotask(() => {
        setBubbles((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            text: assistantMessage,
            type: "assistant",
          },
        ]);
      });
    }
  }, [assistantMessage]);

  useEffect(() => {
    if (missingDataQuestions && missingDataQuestions.length > 0) {
      const text = missingDataQuestions.join("\n");
      queueMicrotask(() => {
        setBubbles((prev) => {
          const last = prev[prev.length - 1];
          if (last?.type === "missing-data" && last.text === text) return prev;
          return [
            ...prev,
            {
              id: `md-${Date.now()}`,
              text,
              type: "missing-data",
            },
          ];
        });
      });
    }
  }, [missingDataQuestions]);

  useEffect(() => {
    if (clarificationQuestions && clarificationQuestions.length > 0) {
      const text = clarificationQuestions.join("\n");
      queueMicrotask(() => {
        setBubbles((prev) => {
          const last = prev[prev.length - 1];
          if (last?.type === "missing-data" && last.text === text) return prev;
          return [
            ...prev,
            {
              id: `cl-${Date.now()}`,
              text,
              type: "missing-data",
            },
          ];
        });
      });
    }
  }, [clarificationQuestions]);

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
            setLocalError("No se capturo audio.");
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
      setLocalError("No se pudo acceder al microfono.");
      setPhase("idle");
    }
  }, []);

  const handleApply = useCallback(async () => {
    const t = transcript.trim();
    if (!t) {
      setLocalError("Escribe o dicta una instruccion antes de enviar.");
      return;
    }
    setLocalError(null);

    setBubbles((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        text: t,
        type: "user",
      },
    ]);

    const ok = await onApplyTranscript(t);
    if (ok) {
      setTranscript("");
    }
  }, [onApplyTranscript, transcript]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleApply();
      }
    },
    [handleApply],
  );

  const isRecording = phase === "recording";
  const isTranscribing = phase === "transcribing";
  const blocked = disabled || busy;

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-none border-0 bg-background shadow-none">
      <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-3">
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={cn(
              "max-w-[85%] text-[13px] leading-relaxed",
              b.type === "user" && "ml-auto",
            )}
          >
            <div
              className={cn(
                "rounded-lg px-3 py-2",
                b.type === "assistant" &&
                  "border border-border bg-card text-card-foreground",
                b.type === "user" &&
                  "bg-primary text-primary-foreground",
                b.type === "missing-data" &&
                  "border border-urus-warning/25 bg-urus-warning-bg text-urus-warning",
              )}
            >
              {b.text.split("\n").map((line, i) => (
                <p key={i} className={i > 0 ? "mt-1" : undefined}>
                  {b.type === "missing-data" && i === 0 && (
                    <span className="font-medium">Te falta: </span>
                  )}
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}

        {busy && (
          <div className="max-w-[85%]">
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {localError && (
        <p
          className="border-y border-urus-danger/20 bg-urus-danger-bg px-4 py-1 text-xs text-urus-danger"
          role="alert"
        >
          {localError}
        </p>
      )}

      <div className="border-t border-border bg-background p-3">
        <div className="flex items-end gap-2">
          {!isRecording ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              disabled={blocked || isTranscribing}
              onClick={startRecording}
              aria-label="Iniciar grabacion"
            >
              <Mic className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-urus-danger hover:text-urus-danger hover:bg-urus-danger/10"
              onClick={stopRecording}
              aria-label="Detener grabacion"
            >
              <Square className="h-4 w-4" />
            </Button>
          )}

          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording
                ? "Grabando... pulsa cuadrado para detener"
                : isTranscribing
                  ? "Transcribiendo..."
                  : "Dicta un cambio o escribe aqui..."
            }
            disabled={blocked || isTranscribing}
            className={cn(
              "min-h-[40px] max-h-[100px] flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px]",
              "text-foreground caret-foreground placeholder:text-muted-foreground",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
              "disabled:bg-muted/50 disabled:text-muted-foreground",
            )}
            rows={1}
            aria-label="Instruccion para el contrato"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-primary hover:bg-primary/10 hover:text-primary"
            disabled={blocked || isRecording || isTranscribing || !transcript.trim()}
            onClick={handleApply}
            aria-label="Enviar instruccion"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {isRecording && (
          <p className="text-[11px] text-urus-danger mt-1.5 text-center animate-pulse">
            Escuchando... pulsa el cuadrado para detener
          </p>
        )}
      </div>
    </Card>
  );
}
