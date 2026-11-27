// Lints prose against the writing-style rules in ../lint/rules.mjs. Fenced code, inline code and front matter are masked
// with spaces so reported line and column stay true to the source. Exits 1 when any error-severity rule matches.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKDOWN_EXTENSIONS, OVERRIDE_DIR, compileRules, extensionOf, format, lintText, mask, overrideLines } from "../lint/core.mjs";

export { lintText, mask };

const SEVERITIES = ["info", "warning", "error"];

function readLines(path) {
  return existsSync(path) ? overrideLines(readFileSync(path, "utf8")) : [];
}

function findOverrideRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, OVERRIDE_DIR)) || existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadRules({ root = process.cwd() } = {}) {
  const base = findOverrideRoot(root);
  if (!base) return compileRules();
  return compileRules({ allow: readLines(join(base, OVERRIDE_DIR, "allow.txt")), stop: readLines(join(base, OVERRIDE_DIR, "stoplist.txt")) });
}

function parseArgs(argv) {
  const opts = { files: [], format: "text", minSeverity: "info", stdin: false, scope: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stdin") opts.stdin = true;
    else if (a === "--scope") opts.scope = argv[++i];
    else if (a === "--format") opts.format = argv[++i];
    else if (a === "--min-severity") opts.minSeverity = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else opts.files.push(a);
  }
  if (!["text", "github"].includes(opts.format)) throw new Error(`--format must be text or github, got ${opts.format}`);
  if (!SEVERITIES.includes(opts.minSeverity)) throw new Error(`--min-severity must be one of ${SEVERITIES.join(", ")}`);
  if (opts.scope && !["markdown", "commit"].includes(opts.scope)) throw new Error(`--scope must be markdown or commit`);
  if (!opts.stdin && opts.files.length === 0) throw new Error("usage: prose-lint.mjs [--format text|github] [--min-severity info|warning|error] <file.md...> | --stdin [--scope commit]");
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const rules = loadRules();
  const inputs = opts.stdin
    ? [{ file: "<stdin>", text: readFileSync(0, "utf8"), scope: opts.scope ?? "commit" }]
    : opts.files.map((file) => {
        if (!MARKDOWN_EXTENSIONS.has(extensionOf(file))) throw new Error(`not a Markdown file: ${file}`);
        return { file, text: readFileSync(file, "utf8"), scope: opts.scope ?? "markdown" };
      });
  const floor = SEVERITIES.indexOf(opts.minSeverity);
  let failed = false;
  for (const input of inputs) {
    for (const hit of lintText(input.text, { scope: input.scope, rules, file: input.file })) {
      if (hit.severity === "error") failed = true;
      if (SEVERITIES.indexOf(hit.severity) >= floor) console.log(format(hit, opts.format));
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
