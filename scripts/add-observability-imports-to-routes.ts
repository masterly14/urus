import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const root = process.cwd();
const apiRoot = path.join(root, "app", "api");

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkRouteFiles(p));
    else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

function addImport(source: string): string {
  if (/from\s+["']@\/lib\/observability["']/.test(source)) return source;

  const sf = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let lastImportEnd = 0;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) lastImportEnd = Math.max(lastImportEnd, node.end);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const importLine = `import { withObservedRoute } from "@/lib/observability";\n`;
  if (lastImportEnd > 0) {
    return source.slice(0, lastImportEnd) + "\n" + importLine + source.slice(lastImportEnd);
  }
  return importLine + source;
}

let fixed = 0;
for (const f of walkRouteFiles(apiRoot)) {
  const s = fs.readFileSync(f, "utf8");
  if (!s.includes("withObservedRoute")) continue;
  const next = addImport(s);
  if (next !== s) {
    fs.writeFileSync(f, next, "utf8");
    fixed++;
  }
}
console.log(`Added import to ${fixed} files`);
