"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Loader2, Send, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatBubble, TypingIndicator } from "@/components/coach/chat-bubble";

interface CoachChatMessage {
  id: string;
  role: "comercial" | "coach";
  text: string;
  createdAt: string;
}

interface CoachChatData {
  id: string;
  isActive: boolean;
  turnCount: number;
  flujoActivo: string | null;
  nivelEnergia: number | null;
  lastMessageAt: string;
  messages: CoachChatMessage[];
}

export default function CoachChatPage() {
  const [data, setData] = useState<CoachChatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const messages = useMemo(() => data?.messages ?? [], [data]);

  const loadChat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/chat");
      const body = (await res.json()) as {
        ok: boolean;
        data?: CoachChatData;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: CoachChatData;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData(body.data);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }, [input, isSending]);

  const handleCloseSession = useCallback(async () => {
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch("/api/coach/chat/close", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      await loadChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSending(false);
    }
  }, [loadChat]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat del Coach Emocional"
        description="Conversación privada con el Coach IA para enfoque y rendimiento comercial."
        breadcrumbs={[
          { label: "Inicio", href: "/platform" },
          { label: "Coach", href: "/platform/coach" },
          { label: "Chat" },
        ]}
        actions={
          <Button
            variant="outline"
            onClick={handleCloseSession}
            disabled={loading || isSending}
          >
            Cerrar conversación
          </Button>
        }
      />

      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-urus-ai" />
              <p className="text-sm font-medium">Coach IA</p>
              <Badge variant="ai">IA</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {data ? `${data.turnCount} turnos` : "Sesión activa"}
            </p>
          </div>

          <div className="h-[56vh] min-h-[420px]">
            {loading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-16 w-[70%]" />
                <Skeleton className="ml-auto h-12 w-[65%]" />
                <Skeleton className="h-14 w-[60%]" />
              </div>
            ) : error ? (
              <EmptyState
                icon={XCircle}
                title="No se pudo cargar la conversación"
                description={error}
                action={
                  <Button variant="outline" onClick={() => void loadChat()}>
                    Reintentar
                  </Button>
                }
                className="h-full"
              />
            ) : messages.length === 0 ? (
              <EmptyState
                icon={Brain}
                title="Empieza tu conversación"
                description="Escribe cómo te sientes o qué necesitas preparar para hoy."
                className="h-full"
              />
            ) : (
              <ScrollArea className="h-full px-4 py-4">
                <div className="flex flex-col gap-3">
                  {messages.map((message, index) => (
                    <ChatBubble
                      key={message.id}
                      message={message.text}
                      sender={message.role === "coach" ? "bot" : "user"}
                      timestamp={new Date(message.createdAt).toLocaleTimeString(
                        "es-ES",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                      isNew={index === messages.length - 1}
                    />
                  ))}
                  {isSending && <TypingIndicator />}
                  <div ref={scrollEndRef} />
                </div>
              </ScrollArea>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
            className="space-y-2 border-t border-border/40 p-4"
          >
            <label
              htmlFor="coach-chat-input"
              className="text-xs font-medium text-foreground"
            >
              Mensaje
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id="coach-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe tu situación y el Coach te ayudará a enfocarte."
                disabled={loading || isSending || Boolean(error)}
                className="min-h-12"
              />
              <Button
                type="submit"
                disabled={!input.trim() || loading || isSending || Boolean(error)}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
