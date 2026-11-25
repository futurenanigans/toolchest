# writing

A house style for prose Claude writes to disk, a skill that limits code comments, and three output styles that cap how long Claude's replies get. Install it if generated READMEs, commit messages and chat replies read as padded or machine-written to you.

## writing-style skill

The skill holds the rules for anything written to a file: module docs, comments, READMEs, doc pages, commit bodies and PR descriptions. Claude loads it on its own when it writes prose, and the global `CLAUDE.md` in this repository tells it to. You can also ask for a "style sweep" or run `/writing:writing-style` directly. It takes no arguments and changes no files by itself.

What it asks for:

- No em-dashes or en-dashes in any file, and a grep of touched files before work is reported done.
- No sentence shapes that mark text as generated, such as "not X but Y", "serves as", trailing ", ensuring ..." clauses and rhetorical questions.
- Markdown with sentence-case headings, no emoji, no `---` separators, no boilerplate sections and no closing summary.
- Commit and PR bodies that explain why in a few sentences, without a "This PR" opener or a Summary/Changes/Testing scaffold.
- A why that names a property of the code (an invariant, a failure mode, a limit) instead of where the request came from.

The plugin also runs the mechanical part of these rules. A PostToolUse hook checks each file Claude writes or edits for em-dashes and en-dashes and tells Claude which lines to fix; it never blocks the edit. `bin/prose-lint.mjs` (Node 22, no dependencies) lints Markdown files, or a commit or PR body with `--stdin --scope commit`, against the rules in `rules.json`, skipping fenced code, inline code and front matter. It prints `--format text` or `--format github` annotations, filters with `--min-severity`, and exits 1 only on an error-severity hit, so vocabulary hits never fail a run. In a repository, `.writing/allow.txt` lists rule ids or words to drop and `.writing/stoplist.txt` adds words to warn on, one per line.

```sh
node plugins/writing/bin/prose-lint.mjs --min-severity warning README.md docs/*.md
git log -1 --format=%B | node plugins/writing/bin/prose-lint.mjs --stdin --scope commit
```

It also carries a vocabulary warning list and limits on editing prose someone else wrote. Allowed text is changed only when it is false or breaks the rules, and only in code the task already reaches. A requested sweep is the exception.

## The comments skill

The `comments` skill covers code comments in any language. It allows two kinds of comment: a short module doc at the top of a file, and a constraint comment that names the test keeping it true. Every other comment in lines Claude touches gets deleted, except sections a compiler or lint requires.

Claude loads it from its description before writing or editing a comment, and the global `CLAUDE.md` in this repository points to it as well. You can also run `/writing:comments` directly.

## Output styles

All three keep Claude's coding instructions and tell it to work without asking on low-risk changes. They differ in how much it says.

| Style | Reply length |
| --- | --- |
| Direct | One or two lines by default, four at most; answer first, one recommendation with its reason |
| Impatient | One line by default, with a fixed budget per kind of reply; findings stated without the justification |
| One Line | A single line, two only for a blocker, a failure, a warning or an assumption that changes the result |

Each bans the same sentence shapes and dashes as the skill. None of them lets Claude hide a blocker, invent a passing result or skip confirmation before a destructive action. Code, quoted failing output and confirmation dialogs are outside the limits.

Pick one under Output style in `/config`, or set `outputStyle` in your settings file.
