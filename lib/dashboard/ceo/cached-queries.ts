import { unstable_cache } from "next/cache";
import { getCeoOverview } from "./queries";

export const getCachedCeoOverview = unstable_cache(
  () => getCeoOverview(),
  ["ceo-overview"],
  { revalidate: 90, tags: ["ceo-overview"] },
);
