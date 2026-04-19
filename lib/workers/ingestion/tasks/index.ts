export { runTasksIngestionCycle } from "./tasks-worker";
export type { TasksIngestionResult } from "./tasks-worker";
export {
  parseNotaEncargoDescrip,
  extractPropertyDataFromRaw,
  isCaptacionTask,
  isValidCaptacionDetail,
  decodeHtmlEntities,
  parseTaskRow,
} from "./tasks-parser";
export type {
  RawTask,
  TaskDetail,
  ParsedDescrip,
} from "./tasks-parser";
