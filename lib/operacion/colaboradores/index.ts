export { listColaboradores, getColaboradorDetail } from "./queries";
export type {
  ColaboradorListRow,
  ColaboradorDetailRow,
  AsignacionWithHitos,
  HitoRow,
  DocumentoRow,
  ColaboradorListFilters,
  ColaboradorRankingRow,
} from "./queries";

export {
  classifyColaborador,
  classifyAll,
  CLASIFICACION_LABELS,
  CLASIFICACION_COLORS,
} from "./classify";
export type {
  ColaboradorClasificacion,
  ClasificacionResult,
  ClassifiedColaborador,
} from "./classify";

export { scanColaboradorSlaBreaches } from "./sla-scanner";
export type { SlaScanResult } from "./sla-scanner";

export { getDashboardColaboradores } from "./dashboard-queries";
export type {
  ColaboradorDashboardRow,
  TipoMetricas,
  DashboardResumen,
  DashboardColaboradoresPayload,
} from "./dashboard-queries";

export { generateAndPersistColaboradoresRecommendation } from "./recommendation-generator";
export type { RecommendationGeneratorResult } from "./recommendation-generator";

export { ColaboradoresRecommendationSchema } from "./recommendation-types";
export type {
  ColaboradoresRecommendation,
  RecomendacionItem,
  RecomendacionTipo,
  RecomendacionPrioridad,
} from "./recommendation-types";
