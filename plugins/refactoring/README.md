# refactoring

Audits of the code as it exists on disk, plus three agents for designing, building and reviewing a change. Each audit writes a report you can read before anything changes, and each can optionally act on its own findings with one commit per finding. The audits never review a git diff; use a diff review tool for that.

Install it if you want Claude to answer questions like "what's broken here", "what can we delete" or "what architecture is this" from the code itself, with evidence for each finding, instead of from comments, commit messages or tests taken on trust.

## Skills

| Skill | Use it for | Mutation flag | Report |
| --- | --- | --- | --- |
| `bug-hunt` | Correctness defects. Treats tests, comments and names as claims, judges intent only from type contracts, invariants, callers, domain rules and compiler or analyzer output, and writes throwaway reproductions where cheap. | `--fix` | `.claude/state/bug-report.md` |
| `codebase-health` | Maintainability of units and their collaborators: coupling, cohesion, testability, complexity. Separates strategic (multi-file, root cause) findings from tactical ones. | `--improve` | `.claude/state/health-report.md` |
| `architecture-scan` | The architecture the code is converging toward (N-Layer, Clean Architecture, Vertical Slice, Feature Folders and so on), plus inconsistencies and boundary violations. It never imposes a pattern. Moves use `git mv` to keep history. | `--reorganize` | `.claude/state/structure-report.md` |
| `dead-code` | Unused code and dependencies. Inventories roots first (entry points, framework discovery, public API) and treats every candidate as alive until a named source shows nothing reaches it. Age is never evidence. | `--remove` | `.claude/state/dead-code-report.md` |
| `pattern-discovery` | Library reimplementations, repeated structural shapes and unnamed conventions, each with a recommendation: adopt a library, extract an abstraction, document the convention, or leave it alone. | `--formalize` | `.claude/state/patterns-report.md` |
| `file-decomposition` | Splitting one large file into modules. Presents a plan first, then extracts step by step with characterization tests before each move. | none | none |
| `pattern-awareness` | Background guidance while writing code: flags new code that adds a fourth instance of an existing shape, reimplements a library, or diverges from a convention, without forcing adoption. | none | none |

The five audits trigger from requests that match their descriptions ("find bugs", "health check", "remove unused code") or by name, for example `/refactoring:bug-hunt`. Their arguments are:

```
/refactoring:bug-hunt [--auto] [--fix [1,3]] [--context <path>] [path]
/refactoring:architecture-scan [--auto] [--reorganize [1,3]] [path]
```

The other three audits take the same shape as `bug-hunt` with their own mutation flag. `path` narrows the scope; without it the whole project is scanned. `--context <path>` feeds in output from an external tool (complexity metrics, clone detection, dependency graphs); any format works, and a finding seeded from it still has to hold up against the code. `architecture-scan` does not take `--context`.

`file-decomposition` sets `disable-model-invocation`, so Claude never starts it on its own. Run it yourself with `/refactoring:file-decomposition "path/to/large-file.ext"`. It refuses `--auto`, because each extraction depends on the plan you approve and on the step before it. Files under 300 lines rarely benefit.

`pattern-awareness` has no command form in practice. It loads when Claude is writing code that resembles existing code.

## How an audit runs

Every audit follows one shared procedure, kept in `skills/codebase-health/references/audit-procedure.md`. A skill states where it deviates, and the skill wins.

The scan reads the current files only. It never uses `git diff`, `git log`, `git show` or `git blame` to decide what a finding is. Git is used for `rev-parse` (to record the commit in the report), `status` (the pre-flight check), and `add` and `commit` under a mutation flag, plus `git mv` in `architecture-scan` and `git restore` in `dead-code` to undo a failed removal.

A general-purpose subagent runs the scan so the reading stays out of your main context. It writes the report and returns only the path and the summary, which is what you see in chat. For a single file or a handful of files the scan runs in the main context instead. Each run overwrites the previous report, and a mutation run always scans fresh first unless you explicitly ask to act on the existing report.

Each report opens with a summary naming the finding to act on first, then numbers its findings, each with severity, effort and `file:line` evidence.

## Acting on findings

Add the mutation flag to act on all findings, or pass numbers such as `--fix [1,3]` to cherry-pick. Findings marked leave alone (or quarantined, in `bug-hunt` and `dead-code`) are skipped unless you name one, and then Claude confirms first.

1. Pre-flight: the working tree must be clean outside `.claude/state/`. If it is dirty, Claude stops and asks you to commit or stash.
2. Claude records the test baseline. Every test passing now must still pass afterwards.
3. Each finding goes to its own subagent, which is told to read the plugin's two rules before writing code.
4. After each finding, Claude runs the build and tests. A pass is committed, staging only that finding's files and never `.claude/state/`. A failure stops the run so you can step in.

With `--auto`, Claude skips your review of the report and dispatches every actionable finding. Findings on disjoint files run as a parallel batch, findings that share a file run in sequence, and each passing batch gets one commit.

## Agents

| Agent | Tools | What it does |
| --- | --- | --- |
| `feature-architect` | Read, Grep, Glob | Turns a feature request into a blueprint: decisions, contracts, worked examples, acceptance criteria and an ordered build sequence. Never edits files. |
| `task-implementer` | Bash, Read, Edit, Write, Grep, Glob | Builds and verifies one bounded task from its dispatch, such as a step of a build sequence or a scoped bug fix. Touches only the files it was given and reports a status: `DONE`, `DONE_WITH_FOLLOWUPS`, `DONE_WITH_CONCERNS`, `BLOCKED` or `NEEDS_CONTEXT`. Under `Verification: deferred` it skips builds and tests so parallel agents do not collide. |
| `implementation-reviewer` | Read, Grep, Glob | Checks finished code on disk against its design or acceptance criteria, optionally on a single focus so several reviewers can run in parallel. Never edits, builds, tests or runs git. |

`task-implementer` is told never to run git, and a `PreToolUse` hook enforces it. `hooks/gate-implementer-git.ps1` inspects every Bash and PowerShell command, and when the caller is `task-implementer` and the command invokes git, it denies the call and tells the agent to return `NEEDS_CONTEXT` or `BLOCKED` instead. Other agents and the main session are unaffected. The hook runs under `pwsh`, so PowerShell 7 must be on your `PATH`.

## Rules

The plugin ships two rules in `rules/`, scoped to common source file types.

| Rule | Covers |
| --- | --- |
| `code-organization` | Where a new file goes (following `.claude/state/structure-report.md` from `architecture-scan` when present, then `CLAUDE.md`, then the directory layout) and whether new code belongs in the file it is landing in. |
| `inline-defect-prevention` | Defect shapes to catch while writing: data loss paths, unvalidated input at trust boundaries, swallowed errors, resource leaks, race-prone sequences and defensive cruft. Obvious fixes are made silently; design choices are flagged for you. |

Plugin rules do not load on their own. The skills name the rule paths in their subagent prompts, and the companion `CLAUDE.md` in this repository tells Claude to read them before writing code or placing files. Without that file, the rules apply only inside the audit and mutation workflows.
