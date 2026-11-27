---
name: writing-style
description: House style for prose written to disk, on top of the always-on response rules. The why must be a property of the code, genre decides whether repo history belongs in a file, limits apply to editing prose someone else wrote, and a vocabulary list warns of register words. Use whenever prose is written or edited on disk (module docs, constraint comments, READMEs, doc pages, commit bodies, PR descriptions), or when the user asks for a "style sweep", "clean up the comments", or "rewrite this doc". Which comments may exist at all is the job of the `comments` skill.
---

# Writing style

This skill is what artifacts need on top of the always-on response rules, and it never relaxes them. Because a subagent or another output style may not carry those rules, the sentence-shape bans are restated here and apply to every sentence written to disk.

## Sentence shapes that mark text as machine-written

- **Negative parallelism.** "Not X, but Y", "it's not about X, it's about Y", "X rather than Y" for contrast. State the positive claim. Keep the negative half only when the reader would otherwise assume Y.
- **Rule of three for rhythm.** Three adjectives, three parallel clauses, a three-item list that pads. Three items are fine when there are exactly three things.
- **Copula avoidance.** Write "is". Never "serves as", "functions as", "acts as", "stands as", "represents", "marks".
- **Trailing participial commentary.** ", ensuring consistency", ", highlighting the importance of", ", allowing callers to". Promote it to a sentence or cut it. The same for a sentence-initial "This ensures" or "This allows" that only re-describes the previous line.
- **Rhetorical question answered immediately.** "So what changed? Everything."
- **Vague attribution.** "Studies show", "it is widely considered", "best practice suggests". Name the source or drop the claim.
- **Identifiers as sentence subjects.** A ticket key, task ID, or option label names nothing to a reader; name the thing and let the identifier trail it.
- **Invented shorthand.** A label coined mid-session ("the tier-2 group", "finding 27") is not a shared noun. Use the concrete reference.

## Punctuation in anything written to disk

No em-dashes, not one, in a file created or edited: comments, docstrings, Markdown, commit bodies, PR descriptions. Use a period, a colon, a semicolon, or parentheses, and prefer two shorter sentences. Cut en-dashes too: an en-dash used as a connector and a parenthetical dash pair are the same habit in a different coat. A hyphen in a compound word is fine; a numeric range takes "to". Accepting slightly worse English is the right trade.

A hook in this plugin runs the linter's dash rules over each file Claude writes or edits, as advice it never blocks on: it asks for a fix on lines the edit introduced and names the rest as pre-existing. That covers only Claude's own edits, so before reporting the work done run `node ${CLAUDE_SKILL_DIR}/../../bin/prose-lint.mjs <files>` (or `bun` in place of `node`, whichever is installed) over every Markdown file the change touched, and pipe commit and PR bodies through it with `--stdin --scope commit`. For code files, grep the touched files for dashes. The check is silent: a clean result gets no mention in the completion report, the same as every other rule in this skill. Speak only when a file does not match these rules, and then say what is off and offer to clean it up. Pre-existing violations in lines the change did not touch get the same treatment: name them and offer, never fix uninvited.

## Greppable checks

These rules are mechanical, and `prose-lint.mjs` runs them alongside the dash check, over the same files, with the same silence on a clean result. Its rules live in `${CLAUDE_SKILL_DIR}/../../lint/rules.mjs`; it masks fenced code, inline code and front matter, and exits 1 only on an error-severity rule. A project can drop a rule id or vocabulary word by listing it in `.writing/allow.txt`, and add its own warning words in `.writing/stoplist.txt`. For comments and docstrings in code, grep for the same patterns:

- Provenance offered as a why, in comments and docstrings: `as requested`, `per the requirements`, `to fix the (failing )?test`, `ticket \d+`, `from the review`, `we discussed`.
- Change history and block markers in comments: a comment starting with `Added`, `Removed`, `Changed`, `Updated`, `Fixed`, or an `end if` / `end of` marker.
- Markdown structure: emoji anywhere in a heading or bullet, a `---` rule used as a separator, a heading in Title Case, a bullet opening with a bold phrase and a colon.
- Commit and PR bodies: a body starting `This PR`, `This commit`, `This change`, or a `## Summary` / `## Changes` / `## Testing` scaffold with `- [ ]` checkboxes.
- Leaked chat output: citation markup such as `oaicite` or `contentReference`, zero-width characters, `I hope this helps` and similar reply leftovers, and sentences opening with Moreover, Furthermore or Additionally.
- The vocabulary warning list below, reported at info severity. A hit here is a prompt to reread the sentence, never a violation on its own.

The sentence-shape rules above are not reliably greppable and stay a reading pass.

## Vocabulary warning list

Not banned, because sometimes the word is simply correct. Each should survive a check that it is meant literally rather than reached for as register: crucial, pivotal, vital, essential, underscores, highlights, delve, tapestry, intricate, nuanced, robust, seamless, holistic, landscape, realm, navigate, foster, leverage, utilize, showcase, resonate, testament, quietly, actually, earn, land, compound, signal, "the work".

A second layer outlasts the first because it reads as ordinary writing. Hedges and meta-commentary that carry no content: "it's worth noting", "note that", "please note", "importantly", "notably", "it's important to", "in order to", "simply", "just", "feel free to". Register verbs that replace a plain one: ensure, enhance, streamline, facilitate, empower, elevate, unlock, comprehensive, effortlessly, "deep dive", "at its core", "a wide range of", "various". Delete the hedge; replace the verb with what actually happens.

This list goes stale as it gets published and avoided. The punctuation and sentence shapes are the durable part; when in doubt, enforce those.

## Markdown documents

A README or doc page written by a model is recognisable before a sentence is read. The structure gives it away.

- Headings are sentence case, contain no emoji, and exist only where a reader would jump to them. A page under about 300 words has no headings.
- No `---` separators. A blank line separates sections.
- A bullet is one or two sentences. A bullet that opens with a bold phrase and a colon is a heading in disguise; either the list is a table, or it is prose. Instruction files a model reads (`SKILL.md`, `CLAUDE.md`) are exempt: a labelled bullet there is a terse directive, and the linter skips them for this rule.
- No boilerplate sections. "Overview", "Key features", "Getting started", "Contributing", "License" appear only when they hold something a reader of this project needs and cannot get from the code or the package manifest. An "Overview" that restates the project name and one adjective is deleted.
- No closing summary, no "In summary", no "Happy coding".
- Length is a budget, the same as a comment. A doc page says what the reader needs to act and stops. Do not add a page when a paragraph in an existing one will do.

Bad:

```markdown
## 🚀 Overview

This library provides a **robust, seamless** way to parse configuration files. It's designed to be:

- **Fast**: Optimized for performance.
- **Flexible**: Supports multiple formats.
- **Easy to use**: Simple, intuitive API.

---

## ✨ Key features
```

Good:

```markdown
Parses TOML and YAML into one typed `Config`. Unknown keys are an error by default; pass `lenient()` to collect them into `Config::extra` instead.
```

## Commit and PR bodies

The subject line says what changed; the body says why, and only when the diff cannot. A body that walks the diff file by file is deleted.

- Never open with "This PR", "This commit", "This change". The reader is looking at it.
- No "Summary / Changes / Testing" scaffold and no checkbox lists. Verification is one sentence naming what ran and its scope.
- No credit to the process: "as discussed", "per review", "addresses feedback". Same rule as comments: the why is a property of the code.

Bad:

```
This PR introduces a new caching layer for the key ring.

## Changes
- Added `KeyRingCache`
- Updated `AuthMiddleware` to use the cache
- Added tests

## Testing
- [x] Unit tests pass
```

Good:

```
Cache the key ring in process

Redis evicts the ring under memory pressure, which invalidates every
issued cookie at once. An in-process copy refreshed every five minutes
survives eviction; a stale ring only delays revocation by that window.

Unit and integration suites pass under `dotnet test` at the solution root.
```

## When one paragraph will not hold the explanation

One paragraph is the budget for any single decision, comment, or finding. When an explanation will not fit, diagnose which of three cases applies before writing more.

Usually it is padding, so cut it. Sometimes the unit being described has too many responsibilities to summarize, and then the code is the problem: name the refactor instead of writing the second paragraph. The third case is real. A decision can be constrained by several independent external facts (platform behaviour, service tier limits, an infrastructure hazard), none of which any refactor removes. Split the explanation across the layers that own each part: the module doc for the mechanism, an anchored constraint comment or a test at the call site for the local guard, and the alternatives not taken in project docs. Do not blame the code for a constraint the code did not create.

## The why is always in the code

**The only admissible why is the code and the system.** A cause is a property of the software: an invariant, a failure mode, a contract, a performance characteristic, a platform constraint. State the mechanism, never the provenance.

Never a why:

- "because the task asked for it", "as requested", "per the requirements"
- "because a bug threw a NullReferenceException", "to fix the failing test", "ticket 412"
- "we discussed this earlier", "from the review findings", or anything else that exists only in the session

Bad: `// Added to fix the crash reported in testing`
Good: `// The provider returns null for revoked keys (see test revoked_key_keeps_the_ring); the ring must survive that without recycling the app`

Bad: "Moved the key ring off Redis because the review flagged it."
Good: "Moved the key ring off Redis. The instance is evicted under memory pressure, which invalidates every issued cookie."

The test: if the justification would stop being true once this conversation is forgotten, it is not a why. Delete it or replace it with the mechanism.

That test screens for session-local provenance and lets durable repo history through, so apply a second one. **Genre decides whether history belongs.** Release notes, changelogs, a version comment, and memory files exist to record what changed, so put it in one of those. A convention, a rules section, a module doc, and an API reference exist to tell a reader what to do now, and a past state of the repo is a claim they cannot check from the file in front of them. "We tried X and it failed" is the most persuasive form of a rule to whoever just watched it fail, and the least useful to everyone else. Delete the clause: if the instruction still stands without it, it was there to make the rule feel earned.

## Editing prose someone else wrote

A comment the `comments` skill (`${CLAUDE_SKILL_DIR}/../comments/SKILL.md`) does not allow gets deleted in the lines a task touches, with no benefit of the doubt; rewording it keeps a comment that should not exist. A module doc or constraint comment that is allowed stays as written, unless it breaks the always-on punctuation and sentence-shape rules or the why-is-in-the-code rule above. Rewrite it when it is false or stale against the code beside it, or when its stated reason is provenance instead of mechanism. The trigger is wrongness, not taste, and the comment must be attached to code the task already reaches. Do not open a file solely to correct its prose.

**Text that is moved is text that is written.** Prose carried into a new file, merged into another document, or restated at a different tier gets the full ruleset applied at the moment of the move. Prior presence in the repo is not a pass: relocating prose re-authors it. The "stays as written" limit protects prose left in place, never prose being lifted. Re-run the punctuation and sentence-shape checks over the destination file.

**Exception: a requested style sweep.** When the user asks for a prose or style pass, opening files for their prose alone is the task, and the scope limit does not apply. Two things still hold. Finish the sweep completely, because a half-converted codebase leaves no reader able to tell which convention is current. And run the build and the test suite afterwards even though only comments changed, because doc markup, string literals in assertion messages, and analyzer rules on documentation all sit inside the comment surface.
