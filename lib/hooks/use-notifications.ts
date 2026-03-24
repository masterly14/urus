"use client";

import { useState, useEffect, useCallback } from "react";
import type { AppNotification } from "@/lib/mock-data/types";
import { notificaciones, notificationTemplates } from "@/lib/mock-data/notificaciones";

let notifCounter = 100;

export function useNotifications(intervalMs: number = 8000) {
    const [notifications, setNotifications] = useState<AppNotification[]>(notificaciones);

    const unreadCount = notifications.filter((n) => !n.read).length;

    const markAsRead = useCallback((id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const template = notificationTemplates[Math.floor(Math.random() * notificationTemplates.length)];
            const newNotif: AppNotification = {
                ...template,
                id: `n-${++notifCounter}`,
                timestamp: new Date().toISOString(),
                read: false,
            };
            setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
        }, intervalMs);

        return () => clearInterval(interval);
    }, [intervalMs]);

    return { notifications, unreadCount, markAsRead, markAllRead };
}
