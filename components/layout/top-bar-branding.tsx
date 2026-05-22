"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const PREFIX = "Plataforma de gestión Interna";
const SUFFIX = "Urus Capital Group";
const INTRO_MS = 2800;
const WIPE_MS = 1100;

type Phase = "intro" | "wiping" | "done";

export function TopBarBranding() {
    const prefersReducedMotion = useReducedMotion();
    const prefixRef = useRef<HTMLSpanElement>(null);
    const [prefixWidth, setPrefixWidth] = useState(0);
    const [phase, setPhase] = useState<Phase>("intro");
    const [ready, setReady] = useState(false);

    useLayoutEffect(() => {
        if (!prefixRef.current) return;
        setPrefixWidth(prefixRef.current.offsetWidth);
        setReady(true);
    }, []);

    useEffect(() => {
        if (prefersReducedMotion) {
            setPhase("done");
        }
    }, [prefersReducedMotion]);

    useEffect(() => {
        if (!ready || phase !== "intro" || prefersReducedMotion) return;

        const wipeTimer = window.setTimeout(() => setPhase("wiping"), INTRO_MS);
        const doneTimer = window.setTimeout(() => setPhase("done"), INTRO_MS + WIPE_MS);

        return () => {
            clearTimeout(wipeTimer);
            clearTimeout(doneTimer);
        };
    }, [ready, phase, prefersReducedMotion]);

    if (phase === "done" || prefersReducedMotion) {
        return (
            <p className="min-w-0 truncate text-sm font-medium tracking-tight text-foreground">
                {SUFFIX}
            </p>
        );
    }

    const showCursor = phase === "intro" || phase === "wiping";
    const targetWidth = phase === "wiping" ? 0 : prefixWidth;

    const cursorLeft = ready ? targetWidth : 0;

    return (
        <p
            className="flex min-w-0 items-center text-sm font-medium tracking-tight text-foreground"
            style={{ opacity: ready ? 1 : 0 }}
        >
            <span className="relative inline-flex shrink-0 items-center">
                <motion.span
                    className="relative block overflow-hidden"
                    initial={false}
                    animate={{ width: ready ? targetWidth : prefixWidth || "auto" }}
                    transition={{ duration: WIPE_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
                >
                    <motion.span
                        ref={prefixRef}
                        className="inline-block whitespace-nowrap"
                        animate={{
                            filter: phase === "wiping" ? "blur(8px)" : "blur(0px)",
                            opacity: phase === "wiping" ? 0 : 1,
                        }}
                        transition={{ duration: WIPE_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
                    >
                        {PREFIX}
                    </motion.span>
                </motion.span>

                {showCursor && ready ? (
                    <motion.span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 pl-px text-muted-foreground"
                        initial={false}
                        animate={{
                            left: cursorLeft,
                            opacity: phase === "wiping" ? 0 : 1,
                        }}
                        transition={{ duration: WIPE_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
                    >
                        |
                    </motion.span>
                ) : null}
            </span>

            <span className="ml-1.5 shrink-0 whitespace-nowrap">{SUFFIX}</span>
        </p>
    );
}
