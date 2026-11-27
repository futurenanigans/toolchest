// The prose linter's pure core, shared by bin/prose-lint.mjs and the dash hook: Markdown masking, rule compilation
// with a project's allow and stop lists, matching, and the dash advice. It touches no file system, so the hook can run
// it inside Claude Code; callers read the override files and the text themselves.
import { RULES } from "./rules.mjs";

export const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
export const OVERRIDE_DIR = ".writing";
const DASH_RULES = new Set(["em-dash", "en-dash"]);
const MAX_LINES_LISTED = 20;

const blank = (s) => s.replace(/[^\n]/g, " ");
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsPattern = (words) => words.map((w) => `\\b${escapeRegex(w)}\\b`).join("|");
const splitLines = (text) => text.split(/\r?\n/);
const baseName = (path) => path.split(/[\\/]/).pop() ?? path;

export function extensionOf(path) {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export function mask(text, { frontMatter = true } = {}) {
  let out = text;
  if (frontMatter) out = out.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank);
  out = out.replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1?\2[`~]*[ \t]*$|(?![\s\S]))/gm, blank);
  out = out.replace(/(`+)(?!`)[^\n]*?[^`]\1(?!`)|``|`[^`\n]`/g, blank);
  return out;
}

export function overrideLines(text) {
  return splitLines(text).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

export function compileRules({ allow = [], stop = [], rules = RULES } = {}) {
  const allowed = new Set(allow.map((l) => l.toLowerCase()));
  const compiled = [];
  for (const rule of rules) {
    if (allowed.has(rule.id.toLowerCase())) continue;
    let pattern = rule.pattern;
    if (rule.words) {
      const words = rule.words.filter((w) => !allowed.has(w.toLowerCase()));
      if (words.length === 0) continue;
      pattern = wordsPattern(words);
    }
    compiled.push({ ...rule, regex: new RegExp(pattern, `${rule.flags ?? ""}gm`.replace(/(.)(?=.*\1)/g, "")) });
  }
  const stopWords = stop.filter((w) => !allowed.has(w.toLowerCase()));
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
    if (rule.skipFiles && new RegExp(rule.skipFiles).test(baseName(file))) continue;
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

// `before` and `after` pairs: an Edit's old and new string, each MultiEdit edit, or a Write's original file and content.
function introducedLines(pairs) {
  const added = new Map();
  for (const [before, after] of pairs) {
    const removed = new Map();
    for (const line of splitLines(before)) removed.set(line, (removed.get(line) ?? 0) + 1);
    for (const line of splitLines(after)) {
      const left = removed.get(line) ?? 0;
      if (left > 0) removed.set(line, left - 1);
      else added.set(line, (added.get(line) ?? 0) + 1);
    }
  }
  return added;
}

export function dashAdvice({ path, text, rules, pairs }) {
  const markdown = MARKDOWN_EXTENSIONS.has(extensionOf(path));
  const hitLines = [
    ...new Set(
      lintText(text, { scope: markdown ? "markdown" : "code", raw: !markdown, rules: rules.filter((r) => DASH_RULES.has(r.id)), file: path }).map((h) => h.line),
    ),
  ];
  if (hitLines.length === 0) return null;
  const added = introducedLines(pairs);
  const fileLines = splitLines(text);
  const introduced = [];
  const untouched = [];
  for (const n of hitLines) {
    const line = fileLines[n - 1];
    const left = added.get(line) ?? 0;
    if (left > 0) {
      added.set(line, left - 1);
      introduced.push(n);
    } else untouched.push(n);
  }
  const list = (ns) => (ns.length === 1 ? "line " : "lines ") + ns.slice(0, MAX_LINES_LISTED).join(", ") + (ns.length > MAX_LINES_LISTED ? ` and ${ns.length - MAX_LINES_LISTED} more` : "");
  const parts = [];
  if (introduced.length > 0) {
    parts.push(`writing-style: this edit put em-dashes or en-dashes in ${path} on ${list(introduced)}. Replace each with a period, colon, semicolon or parentheses (a hyphen in compounds, "to" in ranges).`);
  }
  if (untouched.length > 0) {
    parts.push(`writing-style: ${path} also has dashes on ${list(untouched)} that this edit did not introduce. Leave them; name them to the user and offer to clean them up.`);
  }
  return parts.join(" ");
}
