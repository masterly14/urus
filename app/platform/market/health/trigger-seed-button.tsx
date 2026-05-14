"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  seedId: string;
}

export function TriggerSeedButton({ seedId }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<"default" | "destructive">("default");

  async function trigger() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/market/crawls/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seedId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok === false) {
        setMessage(body.error ?? `Error HTTP ${response.status}`);
        setVariant("destructive");
      } else {
        setMessage(`Encolado runId=${body.runId}`);
        setVariant("default");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg);
      setVariant("destructive");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={trigger}
      >
        {loading ? "Encolando…" : "Disparar crawl"}
      </Button>
      {message && (
        <span
          className={`text-xs ${variant === "destructive" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
