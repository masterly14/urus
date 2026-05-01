import { IDEALISTA_ROBOTS_URL, IDEALISTA_USER_AGENT } from "./config";
import type { RobotsDecision } from "./types";

type RobotsRule = {
  directive: "allow" | "disallow";
  pattern: string;
};

export type RobotsPolicy = {
  rules: RobotsRule[];
  verified: boolean;
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

  return { rules, verified: true };
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
    } else if (rule.pattern.length === matched.pattern.length && rule.directive === "allow") {
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

export async function fetchIdealistaRobots(options?: {
  allowUnverified?: boolean;
}): Promise<RobotsPolicy> {
  const response = await fetch(IDEALISTA_ROBOTS_URL, {
    headers: {
      "User-Agent": IDEALISTA_USER_AGENT,
      Accept: "text/plain,text/html,*/*",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    },
  }).catch((err: unknown) => {
    throw new Error(
      `No se pudo conectar con robots.txt de Idealista: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });

  if (!response.ok) {
    if (options?.allowUnverified) {
      return { rules: [], verified: false };
    }
    throw new Error(
      `No se pudo validar robots.txt de Idealista: HTTP ${response.status}. ` +
        "Ejecuta solo discovery manual con --allow-unverified-robots si tienes autorización para continuar.",
    );
  }

  return parseRobotsTxt(await response.text());
}
