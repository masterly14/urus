"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Channel } from "pusher-js";
import type { AppNotification } from "@/lib/mock-data/types";
import { useAppSession } from "@/lib/hooks/use-session";

/** Máximo de notificaciones en cliente y en GET /api/notifications (debe coincidir con la lista del panel). */
export const MAX_NOTIFICATIONS = 50;
const PUSHER_EVENT_NAME = "notification";

function userChannel(userId: string): string {
  return `private-notifications-user-${userId}`;
}

export function useNotifications() {
  const { user, isCeoOrAdmin } = useAppSession();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const subscribedChannels = useRef<Channel[]>([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function fetchInitial() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
      } catch {
        // Silently fail — notifications will arrive via Pusher
      }
    }

    fetchInitial();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let pusherClient: import("pusher-js").default | null = null;

    async function setupPusher() {
      try {
        const { getPusherClient } = await import("@/lib/pusher/client");
        pusherClient = getPusherClient();
      } catch {
        return;
      }

      const channelNames = [
        "private-notifications-org",
        userChannel(user!.id),
      ];
      if (isCeoOrAdmin) {
        channelNames.push("private-notifications-management");
      }

      const channels: Channel[] = [];

      for (const name of channelNames) {
        const channel = pusherClient.subscribe(name);
        channels.push(channel);

        channel.bind(PUSHER_EVENT_NAME, (data: AppNotification) => {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === data.id)) return prev;
            return [data, ...prev].slice(0, MAX_NOTIFICATIONS);
          });
        });
      }

      subscribedChannels.current = channels;

      pusherClient.connection.bind("connected", () => setConnected(true));
      pusherClient.connection.bind("disconnected", () => setConnected(false));

      if (pusherClient.connection.state === "connected") {
        setConnected(true);
      }
    }

    setupPusher();

    return () => {
      for (const ch of subscribedChannels.current) {
        ch.unbind_all();
        try { ch.unsubscribe(); } catch { /* noop */ }
      }
      subscribedChannels.current = [];

      if (pusherClient) {
        pusherClient.connection.unbind("connected");
        pusherClient.connection.unbind("disconnected");
      }

      setConnected(false);
    };
  }, [user?.id, isCeoOrAdmin]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // Optimistic update already applied
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // Optimistic update already applied
    }
  }, []);

  return { notifications, unreadCount, markAsRead, markAllRead, connected };
}
