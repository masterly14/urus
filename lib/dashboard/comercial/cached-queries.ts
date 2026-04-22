import { unstable_cache } from "next/cache";
import {
  getComercialesDashboard,
  getComercialDashboardDetail,
  getLeadScoreStatsByComercial,
  type DashboardDateRange,
} from "./queries";

export const getCachedComercialesDashboard = unstable_cache(
  (range: DashboardDateRange, options?: { includeInactive?: boolean }) =>
    getComercialesDashboard(range, options),
  ["dashboard-comerciales"],
  { revalidate: 120, tags: ["dashboard-comerciales"] },
);

export const getCachedLeadScoreStats = unstable_cache(
  (range: DashboardDateRange) => getLeadScoreStatsByComercial(range),
  ["dashboard-comerciales-leadscores"],
  { revalidate: 120, tags: ["dashboard-comerciales"] },
);

export function getCachedComercialDetail(
  comercialId: string,
  range: DashboardDateRange,
) {
  return unstable_cache(
    () => getComercialDashboardDetail(comercialId, range),
    [`dashboard-comercial-${comercialId}`, range.from.toISOString(), range.to.toISOString()],
    { revalidate: 120, tags: [`dashboard-comercial-${comercialId}`, "dashboard-comerciales"] },
  )();
}
