/**
 * Daily Log - Sync por commit
 * Marca automaticamente tareas del Plan del dia usando el scope del commit.
 * Ejemplo esperado de commit: feat(M1): ...
 *
 * Uso:
 *   npm run daily-log:sync-commit
 * Hook:
 *   .husky/post-commit
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOG_PATH = join(process.cwd(), "docs", "daily-log.md");

function getLatestCommit(): { hash: string; subject: string } {
  const out = execSync("git log -1 --pretty=format:%h|%s", {
    encoding: "utf-8",
    cwd: process.cwd(),
  }).trim();

  const [hash, ...subjectParts] = out.split("|");
  return { hash, subject: subjectParts.join("|").trim() };
}

function extractCommitScopes(subject: string): string[] {
  const match = subject.match(/^[a-z]+\\(([^)]+)\\):/i);
  if (!match) return [];

  const rawScopes = match[1].split(/[\\s,\\/]+/).filter(Boolean);
  const moduleScopes = rawScopes
    .map((scope) => scope.toUpperCase())
    .filter((scope) => /^M\\d+$/.test(scope));

  return Array.from(new Set(moduleScopes));
}

function findTargetSection(content: string): { start: number; end: number } | null {
  const headers = Array.from(content.matchAll(/^##\\s+\\d{4}-\\d{2}-\\d{2}.*$/gm));
  if (headers.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);
  const todayMatch = headers.find((m) => m[0].startsWith(`## ${today}`));
  const selected = todayMatch ?? headers[headers.length - 1];
  const start = selected.index ?? -1;
  if (start < 0) return null;

  const index = headers.indexOf(selected);
  const next = headers[index + 1];
  const end = next?.index ?? content.length;
  return { start, end };
}

function markFirstMatchingTask(section: string, scopes: string[], hash: string): string {
  if (scopes.length === 0) return section;
  if (section.includes(`commit: ${hash}`)) return section;

  const planHeading = "### Plan del dia";
  const idxPlan = section.indexOf(planHeading);
  if (idxPlan === -1) return section;

  const idxNextHeading = section.indexOf("\n### ", idxPlan + planHeading.length);
  const planEnd = idxNextHeading === -1 ? section.length : idxNextHeading;
  const beforePlan = section.slice(0, idxPlan);
  const planBlock = section.slice(idxPlan, planEnd);
  const afterPlan = section.slice(planEnd);

  const lines = planBlock.split("\n");
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("- [ ] ")) continue;

    const matchesScope = scopes.some((scope) => line.includes(`[${scope}]`));
    if (!matchesScope) continue;

    lines[i] = `${line.replace("- [ ] ", "- [x] ")} (commit: ${hash})`;
    changed = true;
    break;
  }

  if (!changed) return section;
  return `${beforePlan}${lines.join("\n")}${afterPlan}`;
}

function main() {
  if (!existsSync(LOG_PATH)) process.exit(0);

  const { hash, subject } = getLatestCommit();
  const scopes = extractCommitScopes(subject);
  if (scopes.length === 0) process.exit(0);

  const content = readFileSync(LOG_PATH, "utf-8");
  const range = findTargetSection(content);
  if (!range) process.exit(0);

  const before = content.slice(0, range.start);
  const section = content.slice(range.start, range.end);
  const after = content.slice(range.end);
  const updatedSection = markFirstMatchingTask(section, scopes, hash);
  if (updatedSection === section) process.exit(0);

  writeFileSync(LOG_PATH, `${before}${updatedSection}${after}`);
  console.log(`[daily-log] Tarea marcada automaticamente por commit ${hash} (${scopes.join(", ")}).`);
}

main();
