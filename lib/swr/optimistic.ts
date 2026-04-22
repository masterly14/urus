import { mutate } from "swr";

/**
 * Helper for performing optimistic updates with SWR.
 * Optimistically updates the local cache, fires the server request,
 * then revalidates to sync with the actual server state.
 */
export async function optimisticMutate<T>(
  key: string,
  updater: (current: T) => T,
  serverAction: () => Promise<void>,
): Promise<void> {
  await mutate(
    key,
    async (current: T | undefined) => {
      if (!current) return current as T;
      await serverAction();
      return updater(current);
    },
    {
      optimisticData: (current: T | undefined) =>
        current ? updater(current) : (current as T),
      rollbackOnError: true,
      revalidate: true,
    },
  );
}

/**
 * Revalidate all SWR keys matching a prefix (e.g. "/api/operaciones").
 * Useful after mutations that affect list endpoints with varying query params.
 */
export function revalidatePrefix(prefix: string): void {
  mutate(
    (key: unknown) => typeof key === "string" && key.startsWith(prefix),
    undefined,
    { revalidate: true },
  );
}
