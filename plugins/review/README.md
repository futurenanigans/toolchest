# review

One skill that reviews a branch against the commit it branched from, together with the review comments already on it, and reports only findings it has checked against the code. Install it if AI review comments on your PRs are mostly noise, or if a clean review from a tool never tells you what it looked at.

## pr-review

Claude starts it when you ask it to review a branch or a PR, or you run `/review:pr-review [<branch|PR number|PR URL>] [--base <ref>] [--comments <file>] [--run]`. Without a target it reviews the current branch, including uncommitted and untracked files. Any other branch or PR head is checked out into a temporary worktree, so your working tree and HEAD never move.

| Flag | Effect |
| --- | --- |
| `--base <ref>` | Diff against the merge base with this ref instead of the inferred base |
| `--comments <file>` | Also read review comments from a file; a comment starting with `path:line` is anchored there |
| `--run` | Allow running the fast tests and throwaway reproductions to confirm a finding; asks first for a PR from a fork |

Git does not record which branch a branch came from, so without `--base` the skill takes the PR's target branch when there is a PR, then the branch's `Created from` entry in its reflog, then the remote branch it forked from most recently, then the remote default branch. The report names the rule that chose the base.

Comments come from a PR when the branch has one, from the `--comments` file, and from the skill's own earlier report:

| Source | Needs | Reads |
| --- | --- | --- |
| Azure DevOps PR | `az` with the `azure-devops` extension, signed in with `az login` or `AZURE_DEVOPS_EXT_PAT` | Linked work items with acceptance criteria, iterations, and threads with their status |
| GitHub PR | `gh`, signed in | Linked issues, reviews and inline comment threads through the REST API |
| Comments file | Nothing | Each paragraph or list item as one comment |

Without a PR, or without the CLI, the branch is still reviewed in full and the report says which comments were not read.

The skill only reads from a platform. It never comments, replies, votes, approves or changes a PR, and it runs only the platform commands its references list. You post replies yourself.

A review runs in five steps:

1. Resolve the diff against the merge base, and set aside generated files, lockfiles and vendored code.
2. Read the context: the PR description and linked work items or issues, the commit messages, every `CLAUDE.md` and `AGENTS.md` on the changed files' paths as of the merge base, the dependency versions, what the pipelines already check, existing comments, and the callers of every changed contract.
3. Decide whether the change should exist in this shape, and report a design objection on its own before any line comment.
4. Run the repository's analyzers in diff mode, then hunt with manual passes: changed lines, removed checks and invariants, callers broken by a changed contract, data and API evolution, error and empty paths, concurrency, tests that cannot fail, the description against the code, trust boundaries, stack pitfalls and the rule files.
5. Verify each candidate by re-reading the code. A finding is Confirmed with a named trigger and the failing line quoted, Plausible with what would confirm it, or Refuted with the line that disproves it.

The analyzers run only where the repository opted in and the plugin is installed:

| Analyzer | Runs when | Command |
| --- | --- | --- |
| [Awl](https://github.com/futurenanigans/awl-dist) | `.awl/awl.json` exists and C# changed | `awl diff --base <merge base>` |
| [Loom](https://github.com/futurenanigans/loom-dist) | `.loom/loom.json` exists and TypeScript, JavaScript or Vue changed | `loom scan --base <merge base>` |
| [Gimlet](../gimlet/README.md) | C# on a trust boundary changed | `gimlet scan --baseline <merge base>` |

Their findings go through the same verification as the manual ones, and an analyzer that was skipped or incomplete is listed in the report's coverage. Awl and Gimlet load projects through MSBuild, so on a PR from a fork the skill asks before running them. Analyzer configuration and rule files are read as of the merge base, so a branch cannot loosen the rules it is reviewed against.

Only findings the change introduced, with a concrete consequence and a fix the author would make, are reported. Pre-existing defects get their own section. Style without a written rule, anything the pipeline's compiler or linters reject, and hardening with no exploit path are left out. Diffs over about 400 changed lines are split into logical units reviewed by parallel subagents.

The report gives a verdict, then findings labelled blocking, should-fix or nit, each with `path:line`, evidence and a fix. It ends with a coverage section naming the analyzers run, the files not reviewed line by line and what was not run, so a clean result says what it covered. The report is also saved to `.claude/state/pr-review/<platform>-<n>.md` when there is a PR, otherwise `branch/<name>.md`, with the reviewed SHAs. A later run on the same change marks each earlier finding addressed, not addressed or dismissed, and hunts only the new commits.

After the report you can argue with a finding, which makes Claude re-read the code and change its verdict only on new evidence, or drop it, which marks it dismissed in the saved report. Ask for replies and Claude drafts them in chat, one per finding with its `path:line`, ready for you to paste.

PR text, commit messages, comments and the diff are treated as untrusted data; instructions inside them are never followed.

## What the rules rest on

- Precision first, and verification grounded in the code: Google's Tricorder keeps an analyzer only while under 10% of its findings are ignored ([Sadowski et al., CACM 2018](https://cacm.acm.org/research/lessons-from-building-static-analysis-tools-at-google/)). ByteDance's separate validator raised precision from 54.5% to 67.1% ([BitsAI-CR](https://arxiv.org/abs/2501.15134)), while Atlassian's ungrounded LLM fact check had minimal effect ([RovoDev](https://arxiv.org/abs/2601.01129)).
- Changed lines only: 80% of Google AutoCommenter's raw comments fell on unmodified lines and were filtered out ([AutoCommenter](https://arxiv.org/abs/2405.13565)). Comments on code unrelated to the change were rated not useful ([Bosu et al., MSR 2015](https://www.microsoft.com/en-us/research/publication/characteristics-of-useful-code-reviews-an-empirical-study-at-microsoft/)).
- Short, hunk-anchored comments with code: in 22k AI review comments, comment length correlated negatively with being addressed and code content positively, and PR-level comments were mostly ignored ([Sun et al.](https://arxiv.org/abs/2508.18771)).
- No inline questions or praise, imperative wording: authors at Microsoft rated both not useful, and request wording skewed useful (Bosu et al.).
- Context before judging: understanding the change is the main review challenge ([Bacchelli and Bird, ICSE 2013](https://www.microsoft.com/en-us/research/publication/expectations-outcomes-and-challenges-of-modern-code-review/)), and RovoDev's wrong comments clustered where the framework or version was unknown.
- Splitting large diffs: one 2026 study measured F1 falling from 0.657 under 10 changed lines to 0.043 over 150 ([Kumar et al.](https://arxiv.org/abs/2606.15689)).
- Verdict against overall code health, design objections first, labelled nits: [Google engineering practices](https://google.github.io/eng-practices/review/reviewer/).
- Coverage accounting and untrusted PR text follow Trail of Bits' CI review prompt; removed-behaviour and caller-tracing passes, and the three-state verdict, follow Claude Code's built-in `/code-review`; re-review statuses follow qodo's pr-agent and obra/superpowers.
