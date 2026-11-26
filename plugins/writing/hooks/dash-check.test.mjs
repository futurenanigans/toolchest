// Tests for the dash hook: only introduced lines get corrective advice, and the linter's masking and overrides apply.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRules } from "../bin/prose-lint.mjs";
import { dashAdvice } from "./dash-check.mjs";

const EM = "—";

function rulesFor(allow) {
  const dir = mkdtempSync(join(tmpdir(), "dash-check-"));
  mkdirSync(join(dir, ".git"));
  if (allow) {
    mkdirSync(join(dir, ".writing"));
    writeFileSync(join(dir, ".writing", "allow.txt"), allow);
  }
  return loadRules({ root: dir });
}

test("an edit to a dash-free line leaves an existing dash to the user", () => {
  const text = `old ${EM} line\nnew line\n`;
  const advice = dashAdvice({ path: "a.md", text, rules: rulesFor(), toolName: "Edit", toolInput: { old_string: "line two", new_string: "new line" } });
  assert.doesNotMatch(advice, /this edit put/);
  assert.match(advice, /line 1 that this edit did not introduce/);
});

test("a dash the edit adds is the one Claude is told to replace", () => {
  const text = `old ${EM} line\nnew ${EM} line\n`;
  const advice = dashAdvice({ path: "a.md", text, rules: rulesFor(), toolName: "Edit", toolInput: { old_string: "x", new_string: `new ${EM} line` } });
  assert.match(advice, /this edit put em-dashes or en-dashes in a\.md on line 2\./);
  assert.match(advice, /line 1 that this edit did not introduce/);
});

test("a dash inside Markdown code is masked, as the linter masks it", () => {
  const text = `\`a ${EM} b\`\n\n\`\`\`\nx ${EM} y\n\`\`\`\n`;
  assert.equal(dashAdvice({ path: "a.md", text, rules: rulesFor(), toolName: "Write", toolInput: { content: text } }), null);
});

test("a project that allows the dash rules gets no advice", () => {
  const text = `new ${EM} line\n`;
  assert.equal(dashAdvice({ path: "a.md", text, rules: rulesFor("em-dash\n"), toolName: "Write", toolInput: { content: text } }), null);
});

test("a Write over an existing file corrects only lines missing from the original", () => {
  const original = `kept ${EM} line\n`;
  const text = `kept ${EM} line\nadded ${EM} line\n`;
  const advice = dashAdvice({ path: "a.ts", text, rules: rulesFor(), toolName: "Write", toolInput: { content: text }, toolResponse: { originalFile: original } });
  assert.match(advice, /on line 2\./);
  assert.match(advice, /line 1 that this edit did not introduce/);
});
