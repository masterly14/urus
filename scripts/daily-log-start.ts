/**
 * Daily Log - Inicio de jornada
 * Uso:
 *   npm run daily-log:start
 *   npm run daily-log:start -- --day=2
 *   npm run daily-log:start -- --dev-day=2
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPlanDays } from "./daily-log-plan";

const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
] as const;

function getISOWeek(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  return Math.ceil((diff + start.getDay() * 86400000) / 604800000);
}

function parseDevDayArg(argv: string[]): number | null {
  const named = argv.find((arg) => arg.startsWith("--day=") || arg.startsWith("--dev-day="));
  if (named) {
    const value = Number(named.split("=")[1]);
    return Number.isFinite(value) ? value : null;
  }

  const positional = argv.find((arg) => /^\d+$/.test(arg));
  if (!positional) return null;

  const value = Number(positional);
  return Number.isFinite(value) ? value : null;
}

function buildPlanTasks(devDay: number): { tasks: string[]; sourceLabel: string } | null {
  const planDays = readPlanDays();
  const dayData = planDays.get(devDay);
  if (!dayData) return null;

  const taskPrefix = dayData.moduleScopes.length > 0 ? `[${dayData.moduleScopes.join("/")}] ` : "";
  const tasks = dayData.tasks.map((task) => `- [ ] ${taskPrefix}${task}`);
  const sourceLabel = `${dayData.dayName} (Dia ${dayData.dayNumber}) - ${dayData.heading}`;

  return { tasks, sourceLabel };
}

function getAvailablePlanDays(): number[] {
  return Array.from(readPlanDays().keys()).sort((a, b) => a - b);
}

function main() {
  const root = process.cwd();
  const logPath = join(root, "docs", "daily-log.md");

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const dia = DIAS[now.getDay()];
  const semana = getISOWeek(now);

  const sectionId = `## ${dateStr}`;
  if (existsSync(logPath)) {
    const content = readFileSync(logPath, "utf-8");
    if (content.includes(sectionId)) {
      console.log(`[daily-log] Ya existe entrada para hoy (${dateStr}). No se sobrescribe.`);
      process.exit(0);
    }
  } else {
    const bootstrap = "# Daily Log - Urus Capital\n\nRegistro diario segun rutina en docs/plan.md.\n\n";
    writeFileSync(logPath, bootstrap);
  }

  const devDay = parseDevDayArg(process.argv.slice(2));
  const planBlock = devDay ? buildPlanTasks(devDay) : null;

  if (devDay && !planBlock) {
    const available = getAvailablePlanDays();
    console.log(`[daily-log] Dia de desarrollo invalido: ${devDay}`);
    console.log(`[daily-log] Dias disponibles en docs/plan.md: ${available.join(", ")}`);
    process.exit(1);
  }

  const planTasks = planBlock?.tasks ?? ["- [ ] Tarea 1: ...", "- [ ] Tarea 2: ..."];
  const planMeta = planBlock
    ? `### Dia de desarrollo\n- ${planBlock.sourceLabel}\n- Fuente: docs/plan.md\n`
    : "";

  const block = `
${sectionId} (${dia} - Semana ${semana})
${planMeta}
### Plan del dia
${planTasks.join("\n")}
### Bloqueantes
- Ninguno / [descripcion]
`;

  appendFileSync(logPath, block);
  console.log(`[daily-log] Entrada creada: ${dateStr} (${dia}, Semana ${semana})`);
  if (planBlock) {
    console.log(`[daily-log] Tareas cargadas automaticamente para Dia ${devDay}.`);
  } else {
    console.log("[daily-log] Sin --day, se uso plantilla generica.");
  }
  console.log("[daily-log] Edita docs/daily-log.md para ajustar tareas y bloqueantes.");
}

main();
