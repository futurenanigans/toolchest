// Lints prose against the writing-style rules in ../lint/rules.mjs. Fenced code, inline code and front matter are masked
// with spaces so reported line and column stay true to the source. Exits 1 when a finding is at or above the --fail-on severity (error unless given), 2 on a bad argument or
// an unreadable file.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKDOWN_EXTENSIONS, OVERRIDE_DIR, compileRules, extensionOf, format, lintText, mask, overrideLines } from "../lint/core.mjs";

export { lintText, mask };

const SEVERITIES = ["info", "warning", "error"];
const USAGE = "usage: prose-lint.mjs [--format text|github] [--min-severity info|warning|error] [--fail-on info|warning|error] <file.md...> | --stdin [--scope commit]";

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
  const opts = { files: [], format: "text", minSeverity: "info", failOn: "error", stdin: false, scope: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--stdin") opts.stdin = true;
    else if (a === "--scope") opts.scope = argv[++i];
    else if (a === "--format") opts.format = argv[++i];
    else if (a === "--min-severity") opts.minSeverity = argv[++i];
    else if (a === "--fail-on") opts.failOn = argv[++i];
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else opts.files.push(a);
  }
  if (!["text", "github"].includes(opts.format)) throw new Error(`--format must be text or github, got ${opts.format}`);
  if (!SEVERITIES.includes(opts.minSeverity)) throw new Error(`--min-severity must be one of ${SEVERITIES.join(", ")}`);
  if (!SEVERITIES.includes(opts.failOn)) throw new Error(`--fail-on must be one of ${SEVERITIES.join(", ")}, got ${opts.failOn}\n${USAGE}`);
  if (SEVERITIES.indexOf(opts.failOn) < SEVERITIES.indexOf(opts.minSeverity)) throw new Error(`--fail-on ${opts.failOn} is below --min-severity ${opts.minSeverity}: the run would fail on findings it does not print`);
  if (opts.scope && !["markdown", "commit"].includes(opts.scope)) throw new Error(`--scope must be markdown or commit`);
  if (!opts.stdin && opts.files.length === 0) throw new Error(USAGE);
  const notMarkdown = opts.stdin ? undefined : opts.files.find((file) => !MARKDOWN_EXTENSIONS.has(extensionOf(file)));
  if (notMarkdown !== undefined) throw new Error(`not a Markdown file: ${notMarkdown}`);
  return opts;
}

function readInputs(opts) {
  if (opts.stdin) return [{ file: "<stdin>", text: readFileSync(0, "utf8"), scope: opts.scope ?? "commit" }];
  return opts.files.map((file) => {
    try {
      return { file, text: readFileSync(file, "utf8"), scope: opts.scope ?? "markdown" };
    } catch (e) {
      throw new Error(`cannot read ${file}: ${e.message}`, { cause: e });
    }
  });
}

function main() {
  let opts;
  let inputs;
  try {
    opts = parseArgs(process.argv.slice(2));
    inputs = readInputs(opts);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const rules = loadRules();
  const floor = SEVERITIES.indexOf(opts.minSeverity);
  const failFloor = SEVERITIES.indexOf(opts.failOn);
  let failed = false;
  for (const input of inputs) {
    for (const hit of lintText(input.text, { scope: input.scope, rules, file: input.file })) {
      const level = SEVERITIES.indexOf(hit.severity);
      if (level >= failFloor) failed = true;
      if (level >= floor) console.log(format(hit, opts.format));
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
