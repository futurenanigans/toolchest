// Tests for the dash advice: only a dash the edit added gets corrective advice, and the linter's masking and overrides apply.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRules, dashAdvice } from "./core.mjs";

const EM = "\u2014";
const rules = compileRules();

test("an edit to a dash-free line leaves an existing dash to the user", () => {
  const original = `old ${EM} line\nline two\n`;
  const text = `old ${EM} line\nnew line\n`;
  const advice = dashAdvice({ path: "a.md", text, rules, original });
  assert.doesNotMatch(advice, /this edit put/);
  assert.match(advice, /line 1 that this edit did not introduce/);
});

test("a dash the edit adds is the one Claude is told to replace", () => {
  const original = `old ${EM} line\nx\n`;
  const text = `old ${EM} line\nnew ${EM} line\n`;
  const advice = dashAdvice({ path: "a.md", text, rules, original });
  assert.match(advice, /this edit put em-dashes or en-dashes in a\.md on line 2\./);
  assert.match(advice, /line 1 that this edit did not introduce/);
});

test("a dash added in the middle of a line counts as introduced", () => {
  const advice = dashAdvice({ path: "a.md", text: `prefix a ${EM} b suffix\n`, rules, original: "prefix a - b suffix\n" });
  assert.match(advice, /this edit put em-dashes or en-dashes in a\.md on line 1\./);
  assert.doesNotMatch(advice, /did not introduce/);
});

test("an edit elsewhere on a line that already had a dash does not claim the dash", () => {
  const advice = dashAdvice({ path: "a.md", text: `x ${EM} y changed\n`, rules, original: `x ${EM} y before\n` });
  assert.doesNotMatch(advice, /this edit put/);
  assert.match(advice, /line 1 that this edit did not introduce/);
});

test("a second dash added to a line that had one is introduced", () => {
  const advice = dashAdvice({ path: "a.md", text: `x ${EM} y ${EM} z\n`, rules, original: `x ${EM} y\n` });
  assert.match(advice, /this edit put em-dashes or en-dashes in a\.md on line 1\./);
});

test("a dash inside Markdown code is masked, as the linter masks it", () => {
  const text = `\`a ${EM} b\`\n\n\`\`\`\nx ${EM} y\n\`\`\`\n`;
  assert.equal(dashAdvice({ path: "a.md", text, rules, original: "" }), null);
});

test("a project that allows the dash rules gets no advice", () => {
  const text = `new ${EM} line\n`;
  assert.equal(dashAdvice({ path: "a.md", text, rules: compileRules({ allow: ["em-dash"] }), original: "" }), null);
});

test("a Write over an existing file corrects only lines missing from the original", () => {
  const original = `kept ${EM} line\n`;
  const text = `kept ${EM} line\nadded ${EM} line\n`;
  const advice = dashAdvice({ path: "a.ts", text, rules, original });
  assert.match(advice, /on line 2\./);
  assert.match(advice, /line 1 that this edit did not introduce/);
});

test("a dash added to a code file comes with the escape to write when it is data", () => {
  const advice = dashAdvice({ path: "a.ts", text: `const EM = '${EM}'\n`, rules, original: "const EM = '-'\n" });
  assert.match(advice, /on line 1\./);
  assert.ok(advice.includes("\\u2014"));
  assert.equal(dashAdvice({ path: "a.ts", text: "const EM = '&mdash;'\n", rules, original: "" }), null);
});
