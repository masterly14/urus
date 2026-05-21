"use client";

import { useGlobalLoaderContext } from "@/components/loading/global-loader-provider";

export function useGlobalLoader() {
  return useGlobalLoaderContext();
}
