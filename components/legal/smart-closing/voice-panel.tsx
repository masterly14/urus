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
  timestamp: number;
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
  appliedSummaries,
}: SmartClosingVoicePanelProps) {
  const [phase, setPhase] = useState<VoicePanelPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<AssistantBubble[]>([
    {
      id: "welcome",
      text: "Hola, soy tu asistente de contratos. Puedes dictarme cambios de precio, plazos, clausulas nuevas... lo que necesites. Pulsa el microfono o escribe directamente.",
      type: "assistant",
      timestamp: Date.now(),
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
      setBubbles((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          text: assistantMessage,
          type: "assistant",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [assistantMessage]);

  useEffect(() => {
    if (missingDataQuestions && missingDataQuestions.length > 0) {
      const text = missingDataQuestions.join("\n");
      setBubbles((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "missing-data" && last.text === text) return prev;
        return [
          ...prev,
          {
            id: `md-${Date.now()}`,
            text,
            type: "missing-data",
            timestamp: Date.now(),
          },
        ];
      });
    }
  }, [missingDataQuestions]);

  useEffect(() => {
    if (clarificationQuestions && clarificationQuestions.length > 0) {
      const text = clarificationQuestions.join("\n");
      setBubbles((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "missing-data" && last.text === text) return prev;
        return [
          ...prev,
          {
            id: `cl-${Date.now()}`,
            text,
            type: "missing-data",
            timestamp: Date.now(),
          },
        ];
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
        timestamp: Date.now(),
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
    <Card className="border-0 shadow-none bg-neutral-950 overflow-hidden flex flex-col h-full rounded-none">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-neutral-950">
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
                "rounded-xl px-3 py-2",
                b.type === "assistant" &&
                  "bg-neutral-900 border border-neutral-800 text-neutral-100",
                b.type === "user" &&
                  "bg-blue-600 text-white",
                b.type === "missing-data" &&
                  "bg-amber-50 border border-amber-200 text-amber-800",
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
            <div className="rounded-xl px-3 py-2 bg-neutral-900 border border-neutral-800 text-neutral-400 text-[13px]">
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
        <p className="text-xs text-red-300 px-4 py-1 bg-red-950/50" role="alert">
          {localError}
        </p>
      )}

      <div className="border-t border-neutral-800 p-3 bg-neutral-950">
        <div className="flex items-end gap-2">
          {!isRecording ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900"
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
              className="h-9 w-9 shrink-0 rounded-full text-red-400 hover:text-red-300 hover:bg-red-900/40"
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
              "min-h-[40px] max-h-[100px] flex-1 resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-[13px]",
              "text-neutral-100 caret-neutral-100 placeholder:text-neutral-400",
              "focus-visible:border-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-700/70 focus-visible:outline-none",
              "disabled:bg-neutral-800 disabled:text-neutral-500",
            )}
            rows={1}
            aria-label="Instruccion para el contrato"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full text-blue-400 hover:text-blue-300 hover:bg-blue-900/30"
            disabled={blocked || isRecording || isTranscribing || !transcript.trim()}
            onClick={handleApply}
            aria-label="Enviar instruccion"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {isRecording && (
          <p className="text-[11px] text-red-500 mt-1.5 text-center animate-pulse">
            Escuchando... pulsa el cuadrado para detener
          </p>
        )}
      </div>
    </Card>
  );
}
