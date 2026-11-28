// The prose linter's pure core, shared by bin/prose-lint.mjs and the dash hook: Markdown masking, rule compilation
// with a project's allow and stop lists, matching, and the dash advice. It touches no file system, so the hook can run
// it inside Claude Code; callers read the override files and the text themselves.
import { RULES } from "./rules.mjs";

export const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
export const OVERRIDE_DIR = ".writing";
const DASH_RULES = new Set(["em-dash", "en-dash"]);
const MAX_LINES_LISTED = 20;
const ESCAPE_ADVICE = "Where the code needs the character itself as data, write its escape (\\u2014 for an em-dash, \\u2013 for an en-dash), never the character.";

const blank = (s) => s.replace(/[^\n]/g, " ");
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsPattern = (words) => words.map((w) => `\\b${escapeRegex(w)}\\b`).join("|");
const inflected = (w) => (!/^[a-z]+$/i.test(w) ? escapeRegex(w) : /e$/i.test(w) ? `${w.slice(0, -1)}(?:e|es|ed|ing)` : `${w}(?:s|es|ed|ing)?`);
const inflectedPattern = (words) => words.map((w) => `\\b${inflected(w)}\\b`).join("|");
const splitLines = (text) => text.split(/\r?\n/);
const baseName = (path) => path.split(/[\\/]/).pop() ?? path;

export function extensionOf(path) {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export function mask(text, { frontMatter = true } = {}) {
  let out = text;
  if (frontMatter) out = out.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank);
  out = out.replace(/^\uFEFF/, " ");
  out = out.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[`~]*[ \t]*\r?$|(?![\s\S]))/gm, blank);
  out = out.replace(/(`+)(?!`)[^\n]*?[^`]\1(?!`)|``|`[^`\n]`/g, blank);
  out = out.replace(/<!--[\s\S]*?-->/g, blank);
  out = out.replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, blank);
  out = out.replace(/(?<=\]\()(?:<[^>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)/g, blank);
  out = out.replace(/^( {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*)(\S+)/gm, (_, label, url) => label + blank(url));
  out = out.replace(/\bhttps?:\/\/[^\s<>]*[^\s<>.,;:!?)\]'"]/g, blank);
  out = out.replace(/^((?!\d+[.)]\s)[ \t]*[^\s\-*_+>#|][^\n]*\n {0,3})(-+)(?=[ \t]*\r?$)/gm, (_, above, rule) => above + blank(rule));
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
      pattern = inflectedPattern(words);
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
        const lead = m[0].match(/^[ \t]*/)[0].length;
        hits.push({ file, line: i + 1, col: m.index + lead + 1, rule: rule.id, severity: rule.severity, message: rule.message, match: m[0].slice(lead).replace(/[ \t\r]+$/, "") });
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

function changedSpan(before, after) {
  const max = Math.min(before.length, after.length);
  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return [head, after.length - tail];
}

function addedLines(before, after) {
  const removed = new Map();
  for (const line of splitLines(before)) removed.set(line, (removed.get(line) ?? 0) + 1);
  return splitLines(after).map((line) => {
    const left = removed.get(line) ?? 0;
    if (left > 0) removed.set(line, left - 1);
    return left === 0;
  });
}

export function dashAdvice({ path, text, rules, original }) {
  const markdown = MARKDOWN_EXTENSIONS.has(extensionOf(path));
  const hits = lintText(text, { scope: markdown ? "markdown" : "code", raw: !markdown, rules: rules.filter((r) => DASH_RULES.has(r.id)), file: path });
  if (hits.length === 0) return null;
  const [start, end] = changedSpan(original, text);
  const added = addedLines(original, text);
  const lineStarts = [0];
  for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) lineStarts.push(at + 1);
  const byLine = new Map();
  for (const hit of hits) {
    const offset = lineStarts[hit.line - 1] + hit.col - 1;
    const isNew = added[hit.line - 1] && offset < end && offset + hit.match.length > start;
    byLine.set(hit.line, isNew || (byLine.get(hit.line) ?? false));
  }
  const introduced = [...byLine].filter(([, isNew]) => isNew).map(([n]) => n);
  const untouched = [...byLine].filter(([, isNew]) => !isNew).map(([n]) => n);
  const list = (ns) => (ns.length === 1 ? "line " : "lines ") + ns.slice(0, MAX_LINES_LISTED).join(", ") + (ns.length > MAX_LINES_LISTED ? ` and ${ns.length - MAX_LINES_LISTED} more` : "");
  const parts = [];
  if (introduced.length > 0) {
    parts.push(`writing-style: this edit put em-dashes or en-dashes in ${path} on ${list(introduced)}. Replace each with a period, colon, semicolon or parentheses (a hyphen in compounds, "to" in ranges).`);
    if (!markdown) parts.push(ESCAPE_ADVICE);
  }
  if (untouched.length > 0) {
    parts.push(`writing-style: ${path} also has dashes on ${list(untouched)} that this edit did not introduce. Leave them; name them to the user and offer to clean them up.`);
  }
  return parts.join(" ");
}
