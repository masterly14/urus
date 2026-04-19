/**
 * One-shot: wrap all Next.js app/api route modules with withObservedRoute.
 * Run: npx tsx scripts/wrap-api-routes-observability.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const root = process.cwd();
const apiRoot = path.join(root, "app", "api");

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkRouteFiles(p));
    else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

function routePathFromFile(filePath: string): string {
  const dir = path.dirname(filePath);
  const rel = path.relative(apiRoot, dir).split(path.sep).join("/");
  return "/api/" + rel;
}

function handlerConstName(method: string): string {
  return `${method.toLowerCase()}Handler`;
}

function collectReplacements(
  sf: ts.SourceFile,
  route: string,
): { start: number; end: number; text: string }[] {
  const replacements: { start: number; end: number; text: string }[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && HTTP_METHODS.has(node.name.text)) {
      const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExport = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExport && node.body) {
        const method = node.name.text;
        const h = handlerConstName(method);
        const params = node.parameters.map((p) => p.getText(sf)).join(", ");
        const ret = node.type ? `: ${node.type.getText(sf)}` : "";
        const bodyText = node.body.getText(sf);
        const inner = `const ${h} = async (${params})${ret} => ${bodyText}`;
        const exportLine = `export const ${method} = withObservedRoute({ method: "${method}", route: "${route}" }, ${h});`;
        const text = `${inner}\n\n${exportLine}`;
        replacements.push({ start: node.getStart(sf), end: node.end, text });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return replacements;
}

function insertImport(source: string, sf: ts.SourceFile): string {
  if (/from\s+["']@\/lib\/observability["']/.test(source)) return source;
  const importLine = `import { withObservedRoute } from "@/lib/observability";\n`;
  let lastImportEnd = 0;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      lastImportEnd = Math.max(lastImportEnd, node.end);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (lastImportEnd > 0) {
    return source.slice(0, lastImportEnd) + "\n" + importLine + source.slice(lastImportEnd);
  }
  return importLine + source;
}

function processFile(filePath: string): { ok: boolean; reason?: string } {
  const route = routePathFromFile(filePath);
  const source = fs.readFileSync(filePath, "utf8");
  if (source.includes("withObservedRoute")) {
    return { ok: true };
  }

  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const replacements = collectReplacements(sf, route);
  if (replacements.length === 0) {
    return { ok: false, reason: "no exported GET/POST/PUT/PATCH/DELETE function declaration found" };
  }

  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }

  const sf2 = ts.createSourceFile(filePath, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  out = insertImport(out, sf2);

  fs.writeFileSync(filePath, out, "utf8");
  return { ok: true };
}

function main() {
  if (!fs.existsSync(apiRoot)) {
    console.error("Missing app/api");
    process.exit(1);
  }
  const files = walkRouteFiles(apiRoot).sort();
  const failed: { file: string; reason: string }[] = [];
  let ok = 0;
  for (const f of files) {
    const r = processFile(f);
    if (r.ok) ok++;
    else if (r.reason) failed.push({ file: path.relative(root, f), reason: r.reason! });
  }
  console.log(`Processed ${files.length} route files. OK: ${ok}, failed: ${failed.length}`);
  for (const f of failed) {
    console.log(`  ${f.file}: ${f.reason}`);
  }
}

main();
