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
  if (!allowed.has("sentence-length-variance")) {
    compiled.push({ id: "sentence-length-variance", severity: "info", scope: "any", structural: true, message: "Flat sentence-length variance across 5+ consecutive sentences: vary sentence rhythm." });
  }
  return compiled;
}

function checkSentenceLengthVariance(lines, file, rule) {
  const hits = [];
  let paraStart = -1;
  let paraText = [];
  const flush = () => {
    if (paraStart < 0 || paraText.length === 0) return;
    const joined = paraText.join(" ").trim();
    const sentences = joined.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (sentences.length >= 5) {
      const counts = sentences.map((s) => (s.match(/[A-Za-z0-9']+/g) ?? []).length).filter((n) => n > 0);
      if (counts.length >= 5) {
        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((a, n) => a + (n - mean) ** 2, 0) / counts.length;
        const stddev = Math.sqrt(variance);
        if (mean >= 7 && stddev < 2.0) {
          hits.push({
            file,
            line: paraStart + 1,
            col: 1,
            rule: rule.id,
            severity: rule.severity,
            message: rule.message,
            match: `${counts.length} sentences, mean ${mean.toFixed(1)} words, stddev ${stddev.toFixed(2)}`,
          });
        }
      }
    }
    paraStart = -1;
    paraText = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|```)/.test(trimmed)) {
      flush();
    } else {
      if (paraStart < 0) paraStart = i;
      paraText.push(trimmed);
    }
  }
  flush();
  return hits;
}

export function lintText(text, { scope, rules, file = "<stdin>", raw = false }) {
  const masked = raw ? text : scope === "markdown" ? mask(text) : mask(text, { frontMatter: false });
  const lines = masked.split("\n");
  const hits = [];
  for (const rule of rules) {
    if (rule.scope !== "any" && rule.scope !== scope) continue;
    if (rule.skipFiles && new RegExp(rule.skipFiles).test(baseName(file))) continue;
    if (rule.structural && rule.id === "sentence-length-variance") {
      hits.push(...checkSentenceLengthVariance(lines, file, rule));
      continue;
    }
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

function sharedEnds(before, after) {
  const max = Math.min(before.length, after.length);
  let head = 0;
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return [head, tail];
}

function unmatchedLines(from, against) {
  const available = new Map();
  for (const line of against) available.set(line, (available.get(line) ?? 0) + 1);
  return from.map((line) => {
    const left = available.get(line) ?? 0;
    if (left > 0) available.set(line, left - 1);
    return left === 0;
  });
}

function introducedDashLines(hits, original, text) {
  const before = splitLines(original);
  const after = splitLines(text);
  const added = unmatchedLines(after, before);
  const dropped = unmatchedLines(before, after);
  const replaced = before.filter((_, i) => dropped[i]);
  const hitsByLine = new Map();
  for (const hit of hits) hitsByLine.set(hit.line, [...(hitsByLine.get(hit.line) ?? []), hit]);
  const byLine = new Map();
  for (const [lineNumber, lineHits] of hitsByLine) {
    const line = after[lineNumber - 1];
    if (!added[lineNumber - 1]) {
      byLine.set(lineNumber, false);
      continue;
    }
    const kept = (earlier) => {
      const [head, tail] = sharedEnds(earlier, line);
      return lineHits.filter((hit) => hit.col - 1 + hit.match.length <= head || hit.col - 1 >= line.length - tail).length;
    };
    const source = replaced.findIndex((earlier) => kept(earlier) > 0);
    const keptHits = source < 0 ? 0 : kept(replaced[source]);
    if (source >= 0) replaced.splice(source, 1);
    byLine.set(lineNumber, keptHits < lineHits.length);
  }
  return byLine;
}

export function dashAdvice({ path, text, rules, original }) {
  const markdown = MARKDOWN_EXTENSIONS.has(extensionOf(path));
  const hits = lintText(text, { scope: markdown ? "markdown" : "code", raw: !markdown, rules: rules.filter((r) => DASH_RULES.has(r.id)), file: path });
  if (hits.length === 0) return null;
  const byLine = introducedDashLines(hits, original, text);
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
