"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Generic real-time data simulation hook.
 * Takes initial data, a mutator function that produces slight variations,
 * and an interval in ms. Returns the fluctuating data.
 */
export function useRealTime<T>(
    initialData: T,
    mutator: (current: T) => T,
    intervalMs: number = 5000
): T {
    const [data, setData] = useState<T>(initialData);
    const mutatorRef = useRef(mutator);
    mutatorRef.current = mutator;

    useEffect(() => {
        const interval = setInterval(() => {
            setData((prev) => mutatorRef.current(prev));
        }, intervalMs);
        return () => clearInterval(interval);
    }, [intervalMs]);

    return data;
}

/**
 * Fluctuates a number by a random percentage within the given range.
 */
export function randomFluctuation(base: number, maxPercent: number = 2): number {
    const change = base * (maxPercent / 100) * (Math.random() * 2 - 1);
    return Math.round(base + change);
}

/**
 * Picks a random item from an array.
 */
export function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generates a time series of `count` data points with slight random variations
 * around a base value.
 */
export function generateTimeSeries(base: number, count: number = 12, volatility: number = 10): number[] {
    const series: number[] = [];
    let current = base * 0.7;
    const step = (base - current) / count;
    for (let i = 0; i < count; i++) {
        current += step + randomFluctuation(step, volatility * 100 / step);
        series.push(Math.round(current));
    }
    return series;
}
