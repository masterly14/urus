import { FOTOCASA_ROBOTS_URL, FOTOCASA_USER_AGENT } from "./config";
import type { RobotsDecision } from "./types";

type RobotsRule = {
  directive: "allow" | "disallow";
  pattern: string;
};

export type RobotsPolicy = {
  rules: RobotsRule[];
};

function normalizeLine(line: string): string {
  const hashIndex = line.indexOf("#");
  return (hashIndex >= 0 ? line.slice(0, hashIndex) : line).trim();
}

export function parseRobotsTxt(content: string, userAgent = "*"): RobotsPolicy {
  const rules: RobotsRule[] = [];
  let currentAgents: string[] = [];
  let groupApplies = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    if (!line) {
      currentAgents = [];
      groupApplies = false;
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      groupApplies =
        currentAgents.includes("*") ||
        currentAgents.some((candidate) => userAgent.toLowerCase().includes(candidate));
      continue;
    }

    if (!groupApplies) continue;
    if (key !== "allow" && key !== "disallow") continue;
    if (value === "") continue;

    rules.push({ directive: key, pattern: value });
  }

  return { rules };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

export function robotsPatternMatches(pattern: string, pathWithSearch: string): boolean {
  if (pattern === "/") return pathWithSearch.startsWith("/");

  const anchoredAtEnd = pattern.endsWith("$");
  const body = anchoredAtEnd ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    `^${body
      .split("*")
      .map(escapeRegExp)
      .join(".*")}${anchoredAtEnd ? "$" : ""}`,
  );
  return regex.test(pathWithSearch);
}

export function evaluateRobots(policy: RobotsPolicy, url: string): RobotsDecision {
  const parsed = new URL(url);
  const pathWithSearch = `${parsed.pathname}${parsed.search}`;

  let matched: RobotsRule | undefined;
  for (const rule of policy.rules) {
    if (!robotsPatternMatches(rule.pattern, pathWithSearch)) continue;
    if (!matched || rule.pattern.length > matched.pattern.length) {
      matched = rule;
    } else if (
      matched &&
      rule.pattern.length === matched.pattern.length &&
      rule.directive === "allow"
    ) {
      matched = rule;
    }
  }

  if (!matched) return { allowed: true };

  return {
    allowed: matched.directive === "allow",
    matchedRule: matched.pattern,
    matchedDirective: matched.directive,
  };
}

export async function fetchFotocasaRobots(): Promise<RobotsPolicy> {
  const response = await fetch(FOTOCASA_ROBOTS_URL, {
    headers: {
      "User-Agent": FOTOCASA_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar robots.txt de Fotocasa: HTTP ${response.status}`);
  }
  return parseRobotsTxt(await response.text());
}
