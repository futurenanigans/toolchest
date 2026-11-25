// Tests for prose-lint: masking, positions, project overrides and commit scope.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintText, loadRules, mask } from "./prose-lint.mjs";

const EM = "\u2014";

function repo(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prose-lint-"));
  mkdirSync(join(dir, ".git"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, ".writing"), { recursive: true });
    writeFileSync(join(dir, ".writing", name), body);
  }
  return dir;
}

const ids = (hits) => hits.map((h) => h.rule);

test("masking hides fenced code, inline code and front matter but keeps line lengths", () => {
  const text = `---\ntitle: a ${EM} b\n---\nUse \`x ${EM} y\` here.\n\`\`\`\nfoo ${EM} bar\n\`\`\`\n`;
  const masked = mask(text);
  assert.equal(masked.length, text.length);
  assert.equal(masked.split("\n").length, text.split("\n").length);
  assert.deepEqual(lintText(text, { scope: "markdown", rules: loadRules({ root: repo() }) }), []);
});

test("a dash hit reports the source line and column", () => {
  const text = `# Heading\n\nSome \`code\` then a ${EM} dash.\n`;
  const hits = lintText(text, { scope: "markdown", rules: loadRules({ root: repo() }) }).filter((h) => h.rule === "em-dash");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 3);
  assert.equal(hits[0].col, text.split("\n")[2].indexOf(EM) + 1);
  assert.equal(hits[0].severity, "error");
});

test("allow.txt drops a rule by id and a vocabulary word", () => {
  const text = `A robust and seamless thing ${EM} here.\n`;
  const before = ids(lintText(text, { scope: "markdown", rules: loadRules({ root: repo() }) }));
  assert.ok(before.includes("em-dash"));
  assert.equal(before.filter((r) => r === "vocabulary").length, 2);
  const after = lintText(text, { scope: "markdown", rules: loadRules({ root: repo({ "allow.txt": "em-dash\nrobust\n" }) }) });
  assert.deepEqual(after.map((h) => h.match), ["seamless"]);
});

test("stoplist.txt adds words as warnings", () => {
  const hits = lintText("We synergize daily.\n", { scope: "markdown", rules: loadRules({ root: repo({ "stoplist.txt": "synergize\n" }) }) });
  assert.deepEqual(hits.map((h) => [h.rule, h.severity]), [["stoplist", "warning"]]);
});

test("commit scope catches openers and scaffolds that markdown scope ignores", () => {
  const body = "This PR adds a cache.\n\n## Testing\n- [x] Unit tests pass\n";
  const rules = loadRules({ root: repo() });
  assert.deepEqual(ids(lintText(body, { scope: "commit", rules })), ["commit-opener", "commit-scaffold", "commit-scaffold"]);
  assert.ok(!ids(lintText(body, { scope: "markdown", rules })).some((r) => r.startsWith("commit-")));
});

test("leaked markup, zero-width characters and filler openers are caught", () => {
  const text = "See :contentReference[oaicite:1]{index=1}.\nzero\u200Bwidth\nFine. Moreover, more.\n";
  const got = ids(lintText(text, { scope: "markdown", rules: loadRules({ root: repo() }) }));
  for (const id of ["citation-markup", "zero-width-char", "filler-opener"]) assert.ok(got.includes(id), id);
});

test("bold-colon bullets are allowed in model instruction files only", () => {
  const rules = loadRules({ root: mkdtempSync(join(tmpdir(), "lint-")) });
  const text = "- **Label:** body\n";
  assert.equal(lintText(text, { scope: "markdown", rules, file: "plugins/x/skills/y/SKILL.md" }).filter((h) => h.rule === "bold-colon-bullet").length, 0);
  assert.equal(lintText(text, { scope: "markdown", rules, file: "README.md" }).filter((h) => h.rule === "bold-colon-bullet").length, 1);
});
