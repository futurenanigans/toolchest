#!/usr/bin/env node
// PostToolUse hook: after Write, Edit or MultiEdit, reports em-dash and en-dash lines in the edited file as advisory
// context. It never blocks; binary, oversized and vendored files are skipped.
import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = 2 * 1024 * 1024;
const SKIPPED_DIRS = ["node_modules", ".git"];
const DASH = /[\u2013\u2014]/;
const MAX_LINES_LISTED = 20;

function dashLines(path) {
  if (SKIPPED_DIRS.some((d) => path.split(/[\\/]/).includes(d))) return [];
  if (statSync(path).size > MAX_BYTES) return [];
  const buf = readFileSync(path);
  if (buf.includes(0)) return [];
  return buf.toString("utf8").split("\n").flatMap((line, i) => (DASH.test(line) ? [i + 1] : []));
}

const input = JSON.parse(readFileSync(0, "utf8"));
const path = input.tool_input?.file_path;
let lines = [];
try {
  if (path) lines = dashLines(path);
} catch (e) {
  if (e.code !== "ENOENT") throw new Error(`dash check failed for ${path}`, { cause: e });
}
if (lines.length > 0) {
  const shown = lines.slice(0, MAX_LINES_LISTED).join(", ");
  const more = lines.length > MAX_LINES_LISTED ? ` and ${lines.length - MAX_LINES_LISTED} more` : "";
  const additionalContext = `writing-style: ${path} has em-dashes or en-dashes on lines ${shown}${more}. Replace each with a period, colon, semicolon or parentheses (a hyphen in compounds, "to" in ranges).`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } }));
}
