import { unstable_cache } from "next/cache";
import { getDashboardColaboradores } from "./dashboard-queries";

export const getCachedDashboardColaboradores = unstable_cache(
  () => getDashboardColaboradores(),
  ["colaboradores-dashboard"],
  { revalidate: 60, tags: ["colaboradores-dashboard"] },
);
