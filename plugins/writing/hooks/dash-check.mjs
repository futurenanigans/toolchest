#!/usr/bin/env node
// PostToolUse hook: after Write, Edit or MultiEdit, reports em-dashes and en-dashes as advisory context. It runs the
// prose linter's dash rules, so Markdown masking and a project's .writing/allow.txt apply, and it asks for a fix only
// on lines the edit introduced; dashes on untouched lines are named for the user, as the writing-style skill says.
// It never blocks; binary, oversized and vendored files are skipped.
import { readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintText, loadRules } from "../bin/prose-lint.mjs";

const MAX_BYTES = 2 * 1024 * 1024;
const SKIPPED_DIRS = ["node_modules", ".git"];
const DASH_RULES = new Set(["em-dash", "en-dash"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const MAX_LINES_LISTED = 20;

const splitLines = (text) => text.split(/\r?\n/);

function introducedLines(toolName, toolInput, toolResponse) {
  const pairs =
    toolName === "Edit"
      ? [[toolInput.old_string ?? "", toolInput.new_string ?? ""]]
      : toolName === "MultiEdit"
        ? (toolInput.edits ?? []).map((e) => [e.old_string ?? "", e.new_string ?? ""])
        : [[typeof toolResponse?.originalFile === "string" ? toolResponse.originalFile : "", toolInput.content ?? ""]];
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

export function dashAdvice({ path, text, rules, toolName, toolInput, toolResponse }) {
  const markdown = MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
  const hitLines = [
    ...new Set(
      lintText(text, { scope: markdown ? "markdown" : "code", raw: !markdown, rules: rules.filter((r) => DASH_RULES.has(r.id)), file: path }).map((h) => h.line),
    ),
  ];
  if (hitLines.length === 0) return null;
  const added = introducedLines(toolName, toolInput, toolResponse);
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

function main() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const path = input.tool_input?.file_path;
  if (!path || SKIPPED_DIRS.some((d) => path.split(/[\\/]/).includes(d))) return;
  let buf;
  try {
    if (statSync(path).size > MAX_BYTES) return;
    buf = readFileSync(path);
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw new Error(`dash check failed for ${path}`, { cause: e });
  }
  if (buf.includes(0)) return;
  const additionalContext = dashAdvice({
    path,
    text: buf.toString("utf8"),
    rules: loadRules({ root: dirname(path) }),
    toolName: input.tool_name,
    toolInput: input.tool_input,
    toolResponse: input.tool_response,
  });
  if (additionalContext) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
