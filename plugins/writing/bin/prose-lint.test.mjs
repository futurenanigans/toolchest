// Tests for prose-lint: masking, positions, project overrides, commit scope and the exit code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
const lintMarkdown = (text) => lintText(text, { scope: "markdown", rules: loadRules({ root: repo() }) });

const CLI = fileURLToPath(new URL("./prose-lint.mjs", import.meta.url));

function cli(body, ...args) {
  const dir = repo();
  writeFileSync(join(dir, "a.md"), body);
  return spawnSync(process.execPath, [CLI, ...args, "a.md"], { cwd: dir, encoding: "utf8" });
}

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

test("code and addresses that Markdown does not render as prose are masked", () => {
  const cases = {
    "fence indented in a list item": `- item\n\n    \`\`\`sh\n    a ${EM} b\n    \`\`\`\n\nafter\n`,
    "fence closed on a CRLF line": `\`\`\`\r\na ${EM} b\r\n\`\`\`\r\nafter\r\n`,
    "code element": `Use <code>a ${EM} b</code> here.\n`,
    "pre element": `<pre class="x">\na ${EM} b\n</pre>\n`,
    "HTML comment": `<!-- a ${EM} b\nI hope this helps -->\n`,
    "link destination": `See [the page](https://example.com/a${EM}b/leverage_(x)) and ![shot](img/a${EM}b.png).\n`,
    "reference definition": `[page]: https://example.com/a${EM}b\n`,
    "bare address": `Read https://example.com/a${EM}b/robust.\n`,
  };
  for (const [name, text] of Object.entries(cases)) {
    assert.equal(mask(text).length, text.length, name);
    assert.deepEqual(lintMarkdown(text), [], name);
  }
});

test("prose beside a masked span is still linted", () => {
  const text = `- item\n\n    \`\`\`\n    code\n    \`\`\`\n\nafter ${EM} fence, [link ${EM} text](https://example.com/x) and <code>x</code> ${EM} tail\n`;
  const hits = lintMarkdown(text);
  assert.deepEqual(hits.map((h) => [h.rule, h.line]), [["em-dash", 7], ["em-dash", 7], ["em-dash", 7]]);
  assert.deepEqual(hits.map((h) => h.col), [...text.split("\n")[6].matchAll(new RegExp(EM, "g"))].map((m) => m.index + 1));
});

test("a product name in a heading is advisory", () => {
  const hits = lintMarkdown("## Visual Studio\n");
  assert.deepEqual(hits.map((hit) => [hit.rule, hit.severity]), [["title-case-heading", "info"]]);
});

test("a setext heading underline is not a separator, a rule after a blank line or a list item is", () => {
  assert.deepEqual(ids(lintMarkdown("Heading text\n---\n\nBody.\n")), []);
  assert.deepEqual(lintMarkdown("Body.\n\n---\n\n- item\n---\n").map((h) => [h.rule, h.line]), [["separator-line", 3], ["separator-line", 6]]);
});

test("a byte order mark at the start is not a zero-width character, one elsewhere is", () => {
  assert.deepEqual(lintMarkdown(`\uFEFF---\ntitle: a ${EM} b\n---\nBody.\n`), []);
  assert.deepEqual(lintMarkdown("\uFEFFBody.\n"), []);
  assert.deepEqual(lintMarkdown("Body\uFEFF.\n").map((h) => [h.rule, h.col]), [["zero-width-char", 5]]);
});

test("dash entities and the horizontal bar are dashes, a double hyphen is not", () => {
  const hits = lintMarkdown("a &mdash; b\nc &ndash; d\ne \u2015 f\nrun --flag -- now\n");
  assert.deepEqual(hits.map((h) => [h.rule, h.line, h.col]), [["em-dash", 1, 3], ["en-dash", 2, 3], ["em-dash", 3, 3]]);
  assert.deepEqual(lintText("a &mdash; b\n", { scope: "markdown", rules: loadRules({ root: repo({ "allow.txt": "em-dash\n" }) }) }), []);
});

test("a reply leftover with a curly apostrophe and a scaffold heading with a colon are caught", () => {
  const rules = loadRules({ root: repo() });
  assert.deepEqual(ids(lintText("I\u2019d be happy to help.\n", { scope: "markdown", rules })), ["chatbot-leftover"]);
  assert.deepEqual(ids(lintText("Adds a cache.\n\n## Summary:\n", { scope: "commit", rules })), ["commit-scaffold"]);
});

test("a vocabulary word is caught in its inflected forms and allowed by its base form", () => {
  const text = "It leverages a cache, utilizing what earned trust; the working tree and leveraged.md stay.\n";
  assert.deepEqual(lintMarkdown(text).map((h) => h.match), ["leverages", "utilizing", "earned", "leveraged"]);
  const allowed = lintText(text, { scope: "markdown", rules: loadRules({ root: repo({ "allow.txt": "leverage\n" }) }) });
  assert.deepEqual(allowed.map((h) => h.match), ["utilizing", "earned"]);
});

test("a stoplist word matches only as written", () => {
  const hits = lintText("We synergized daily.\n", { scope: "markdown", rules: loadRules({ root: repo({ "stoplist.txt": "synergize\n" }) }) });
  assert.deepEqual(hits, []);
});

test("--fail-on sets the lowest severity that fails the run", () => {
  const bodies = { info: "A robust thing.\n", warning: "Fine. Moreover, more.\n", error: `a ${EM} b\n` };
  const expected = {
    info: { default: 0, error: 0, warning: 0, info: 1 },
    warning: { default: 0, error: 0, warning: 1, info: 1 },
    error: { default: 1, error: 1, warning: 1, info: 1 },
  };
  for (const [severity, body] of Object.entries(bodies)) {
    assert.equal(cli(body).status, expected[severity].default, `${severity} finding, no --fail-on`);
    for (const failOn of ["error", "warning", "info"]) {
      assert.equal(cli(body, "--fail-on", failOn).status, expected[severity][failOn], `${severity} finding, --fail-on ${failOn}`);
    }
  }
});

test("a bad --fail-on value is a usage error, not a lint failure", () => {
  for (const args of [["--fail-on", "fatal"], ["--min-severity", "error", "--fail-on", "warning"]]) {
    const ran = cli(`a ${EM} b\n`, ...args);
    assert.equal(ran.status, 2, args.join(" "));
    assert.match(ran.stderr, /--fail-on/);
    assert.equal(ran.stdout, "");
  }
});

test("a file that cannot be linted is a usage error, not a lint failure", () => {
  const dir = repo();
  for (const name of ["missing.md", "notes.txt"]) {
    const ran = spawnSync(process.execPath, [CLI, name], { cwd: dir, encoding: "utf8" });
    assert.equal(ran.status, 2, name);
    assert.match(ran.stderr, new RegExp(name.replace(".", "\\.")));
  }
});


test("info-severity sentence-shape lints detect negative parallelism, noun triads, and flat variance", () => {
  const rules = loadRules({ root: "/" });
  const text = [
    "It's not about speed, it's about correctness and clarity, scalability, and reliability.",
    "",
    "The worker reads one job from the queue. The parser checks each field for valid types. The router sends each item to its handler. The store writes one row into the table. The client logs the status to the console.",
  ].join("\n");
  const hits = lintText(text, { scope: "markdown", rules, file: "doc.md" });
  const byRule = new Map(hits.map((h) => [h.rule, h.severity]));
  assert.equal(byRule.get("negative-parallelism"), "info");
  assert.equal(byRule.get("noun-triad"), "info");
  assert.equal(byRule.get("sentence-length-variance"), "info");
});
