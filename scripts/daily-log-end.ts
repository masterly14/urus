/**
 * Daily Log - Cierre de jornada
 * Uso: npm run daily-log:end
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOG_PATH = join(process.cwd(), "docs", "daily-log.md");

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCommitsToday(): string[] {
  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const sinceISO = since.toISOString();
    const out = execSync(`git log --since="${sinceISO}" --oneline`, {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    return out.trim() ? out.trim().split("\n") : [];
  } catch {
    return [];
  }
}

function main() {
  if (!existsSync(LOG_PATH)) {
    console.log("[daily-log] No existe docs/daily-log.md. Ejecuta antes: npm run daily-log:start");
    process.exit(1);
  }

  const dateStr = getTodayISO();
  const sectionId = `## ${dateStr}`;
  const content = readFileSync(LOG_PATH, "utf-8");

  if (!content.includes(sectionId)) {
    console.log(`[daily-log] No hay entrada para hoy (${dateStr}). Ejecuta antes: npm run daily-log:start`);
    process.exit(1);
  }

  const idxSection = content.indexOf(sectionId);
  const nextSection = content.indexOf("\n## ", idxSection + 1);
  const sectionEnd = nextSection === -1 ? content.length : nextSection;
  const section = content.slice(idxSection, sectionEnd);

  if (section.includes("### Completado")) {
    console.log("[daily-log] La entrada de hoy ya tiene bloque Completado. No se sobrescribe.");
    process.exit(0);
  }

  const commits = getCommitsToday();
  const commitRefs =
    commits.length > 0
      ? "\n<!-- Commits de hoy (copiar refs a Completado):\n" +
        commits.map((c) => `   ${c}`).join("\n") +
        "\n-->"
      : "";

  const block = `
### Completado
- [x] Tarea 1: descripcion + commit refs
- [ ] Tarea 2: motivo de no completarse
### Notas
- 
${commitRefs}
`;

  const before = content.slice(0, sectionEnd);
  const after = content.slice(sectionEnd);
  writeFileSync(LOG_PATH, before + block + after);
  console.log("[daily-log] Bloque Completado/Notas anadido para hoy.");
}

main();
