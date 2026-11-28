#!/usr/bin/env node
// Verifies that duplicated prose blocks stay in sync with their canonical sources:
// 1. plugins/writing/references/sentence-shapes.md -> writing-style and the three output styles.
// 2. Shared sections between refactoring's and testing's audit-procedure.md.
// Pass --fix to rewrite the sentence-shapes blocks in place.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FIX = process.argv.includes("--fix");

const SENTENCE_SHAPES_SRC = "plugins/writing/references/sentence-shapes.md";
const SENTENCE_SHAPES_TARGETS = [
  "plugins/writing/skills/writing-style/SKILL.md",
  "plugins/writing/output-styles/direct.md",
  "plugins/writing/output-styles/impatient.md",
  "plugins/writing/output-styles/one-line.md",
];

const BEGIN_MARK = "<!-- BEGIN:sentence-shapes -->";
const END_MARK = "<!-- END:sentence-shapes -->";

const REFACTORING_AUDIT = "plugins/refactoring/skills/codebase-health/references/audit-procedure.md";
const TESTING_AUDIT = "plugins/testing/references/audit-procedure.md";
const SHARED_AUDIT_SECTIONS = [
  "## Scan the current code on disk",
  "## Report state",
  "### Finding status",
  "### Resume",
  "## `--auto`",
];

function extractSection(text, heading) {
  const lines = text.split("\n");
  const level = heading.match(/^#+/)?.[0].length ?? 2;
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("```")) inFence = !inFence;
    if (!inFence) {
      const m = lines[i].match(/^(#+)\s+/);
      if (m && m[1].length <= level) {
        end = i;
        break;
      }
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function extractFirstFence(text) {
  const m = text.match(/```markdown\n[\s\S]*?\n```/);
  return m ? m[0].trim() : null;
}

let failures = 0;

// 1. Check sentence-shapes sync
const canonical = readFileSync(resolve(ROOT, SENTENCE_SHAPES_SRC), "utf8").trim();
for (const rel of SENTENCE_SHAPES_TARGETS) {
  const abs = resolve(ROOT, rel);
  const content = readFileSync(abs, "utf8");
  const re = new RegExp(`${BEGIN_MARK}[\\s\\S]*?${END_MARK}`);
  const match = content.match(re);
  if (!match) {
    console.error(`ERROR: ${rel} is missing ${BEGIN_MARK} ... ${END_MARK} markers.`);
    failures++;
    continue;
  }
  const expectedBlock = `${BEGIN_MARK}\n${canonical}\n${END_MARK}`;
  if (match[0] !== expectedBlock) {
    if (FIX) {
      writeFileSync(abs, content.replace(re, expectedBlock), "utf8");
      console.log(`Synced ${rel}`);
    } else {
      console.error(`DRIFT: ${rel} differs from ${SENTENCE_SHAPES_SRC} (run with --fix to sync).`);
      failures++;
    }
  }
}

// 2. Check shared audit-procedure.md sections + report skeleton
const refAudit = readFileSync(resolve(ROOT, REFACTORING_AUDIT), "utf8");
const testAudit = readFileSync(resolve(ROOT, TESTING_AUDIT), "utf8");

for (const heading of SHARED_AUDIT_SECTIONS) {
  const a = extractSection(refAudit, heading);
  const b = extractSection(testAudit, heading);
  if (a === null || b === null) {
    console.error(`ERROR: Missing shared section "${heading}" in audit-procedure.md.`);
    failures++;
  } else if (a !== b) {
    console.error(`DRIFT: Shared section "${heading}" differs between ${REFACTORING_AUDIT} and ${TESTING_AUDIT}.`);
    failures++;
  }
}

const refSkeleton = extractFirstFence(refAudit);
const testSkeleton = extractFirstFence(testAudit);
if (!refSkeleton || !testSkeleton || refSkeleton !== testSkeleton) {
  console.error(`DRIFT: Report format skeleton differs between ${REFACTORING_AUDIT} and ${TESTING_AUDIT}.`);
  failures++;
}

if (failures > 0) {
  process.exit(1);
}
console.log("Synced prose checks passed.");
