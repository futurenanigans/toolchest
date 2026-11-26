#!/usr/bin/env node
// Lints prose against the writing-style rules in ../rules.json. Fenced code, inline code and front matter are masked
// with spaces so reported line and column stay true to the source. Exits 1 when any error-severity rule matches.
import { readFileSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RULES_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "rules.json");
const SEVERITIES = ["info", "warning", "error"];
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const OVERRIDE_DIR = ".writing";

const blank = (s) => s.replace(/[^\n]/g, " ");

export function mask(text, { frontMatter = true } = {}) {
  let out = text;
  if (frontMatter) out = out.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank);
  out = out.replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1?\2[`~]*[ \t]*$|(?![\s\S]))/gm, blank);
  out = out.replace(/(`+)(?!`)[^\n]*?[^`]\1(?!`)|``|`[^`\n]`/g, blank);
  return out;
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function wordsPattern(words) {
  return words.map((w) => `\\b${escapeRegex(w)}\\b`).join("|");
}

function readLines(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
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

export function loadRules({ root = process.cwd(), rulesPath = RULES_PATH } = {}) {
  const { rules } = JSON.parse(readFileSync(rulesPath, "utf8"));
  const base = findOverrideRoot(root);
  const allow = new Set(base ? readLines(join(base, OVERRIDE_DIR, "allow.txt")).map((l) => l.toLowerCase()) : []);
  const stop = base ? readLines(join(base, OVERRIDE_DIR, "stoplist.txt")) : [];
  const compiled = [];
  for (const rule of rules) {
    if (allow.has(rule.id.toLowerCase())) continue;
    let pattern = rule.pattern;
    if (rule.words) {
      const words = rule.words.filter((w) => !allow.has(w.toLowerCase()));
      if (words.length === 0) continue;
      pattern = wordsPattern(words);
    }
    compiled.push({ ...rule, regex: new RegExp(pattern, `${rule.flags ?? ""}gm`.replace(/(.)(?=.*\1)/g, "")) });
  }
  const stopWords = stop.filter((w) => !allow.has(w.toLowerCase()));
  if (stopWords.length > 0) {
    compiled.push({ id: "stoplist", severity: "warning", scope: "any", message: "Word on the project stoplist.", regex: new RegExp(wordsPattern(stopWords), "gim") });
  }
  return compiled;
}

export function lintText(text, { scope, rules, file = "<stdin>", raw = false }) {
  const masked = raw ? text : scope === "markdown" ? mask(text) : mask(text, { frontMatter: false });
  const lines = masked.split("\n");
  const hits = [];
  for (const rule of rules) {
    if (rule.scope !== "any" && rule.scope !== scope) continue;
    if (rule.skipFiles && new RegExp(rule.skipFiles).test(basename(file))) continue;
    lines.forEach((line, i) => {
      rule.regex.lastIndex = 0;
      for (const m of line.matchAll(rule.regex)) {
        const lead = m[0].length - m[0].trimStart().length;
        hits.push({ file, line: i + 1, col: m.index + lead + 1, rule: rule.id, severity: rule.severity, message: rule.message, match: m[0].trim() });
        if (m[0].length === 0) break;
      }
    });
  }
  return hits.sort((a, b) => a.line - b.line || a.col - b.col);
}

const GITHUB_LEVEL = { error: "error", warning: "warning", info: "notice" };
const ghEscape = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

export function format(hit, fmt) {
  const text = `${hit.message} (${hit.rule}: "${hit.match}")`;
  if (fmt === "github") return `::${GITHUB_LEVEL[hit.severity]} file=${hit.file},line=${hit.line},col=${hit.col},title=${hit.rule}::${ghEscape(text)}`;
  return `${hit.file}:${hit.line}:${hit.col}: ${hit.severity} ${text}`;
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
        if (!MARKDOWN_EXTENSIONS.has(extname(file).toLowerCase())) throw new Error(`not a Markdown file: ${file}`);
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
