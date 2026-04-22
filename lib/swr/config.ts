import type { SWRConfiguration } from "swr";

export const swrFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
};

export const swrAuthFetcher = async ([url, headers]: [string, Record<string, string>]) => {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
};

export const SWR_DEFAULTS: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
  errorRetryCount: 2,
};
