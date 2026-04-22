"use client";

import { SWRConfig } from "swr";
import { SWR_DEFAULTS, swrFetcher } from "./config";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ ...SWR_DEFAULTS, fetcher: swrFetcher }}>
      {children}
    </SWRConfig>
  );
}
