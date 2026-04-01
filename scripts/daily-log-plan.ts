import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PlanDayData = {
  dayNumber: number;
  dayName: string;
  heading: string;
  moduleScopes: string[];
  tasks: string[];
};

function cleanTaskText(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTableTasks(section: string): string[] {
  const tasks: string[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (line.includes("---")) continue;

    const cells = line.split("|").map((cell) => cell.trim());
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    if (cells.length < 3) continue;
    if (cells[0].toLowerCase() === "bloque") continue;

    const task = cleanTaskText(cells[2]);
    if (!task) continue;
    tasks.push(task);
  }

  return tasks;
}

export function readPlanDays(rootDir = process.cwd()): Map<number, PlanDayData> {
  const planPath = join(rootDir, "docs", "plan.md");
  const plan = readFileSync(planPath, "utf-8");
  const dayHeaderRegex = /^####\s+([^\n(]+)\s+\(D[ií]a\s+(\d+)\)\s+—\s+([^\n]+)$/gm;

  const headers: Array<{
    start: number;
    end: number;
    dayName: string;
    dayNumber: number;
    headingTail: string;
  }> = [];

  for (const match of plan.matchAll(dayHeaderRegex)) {
    const idx = match.index ?? -1;
    if (idx < 0) continue;

    headers.push({
      start: idx,
      end: idx + match[0].length,
      dayName: match[1].trim(),
      dayNumber: Number(match[2]),
      headingTail: match[3].trim(),
    });
  }

  const byDay = new Map<number, PlanDayData>();
  for (let i = 0; i < headers.length; i += 1) {
    const current = headers[i];
    const next = headers[i + 1];
    const section = plan.slice(current.end, next ? next.start : plan.length);
    const modules = Array.from(new Set(current.headingTail.match(/M\d+/g) ?? []));
    const tasks = parseTableTasks(section);

    byDay.set(current.dayNumber, {
      dayNumber: current.dayNumber,
      dayName: current.dayName,
      heading: current.headingTail,
      moduleScopes: modules,
      tasks,
    });
  }

  return byDay;
}
