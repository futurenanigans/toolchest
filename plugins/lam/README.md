# lam

Local Agent Monitor. It watches the edits and shell commands Claude Code makes, adds advice to the model when an edit looks like a known shortcut, counts the advisories it delivered, draws a status line under the prompt, and runs `git fetch` when a session starts so the model knows how fresh its remote-tracking refs are.

## Advisory checks

Every Edit and Write call, and every Bash or PowerShell call, runs through eight checks. A check that fires attaches its message to the tool result as context for the model. The call itself always goes ahead: lam never blocks or rewrites anything. If another hook or the permission system denies the call, lam leaves the denial alone, adds no advice and counts nothing.

All eight checks run in every repository, including one that configures the awl or loom analyzer. A `.awl/awl.json` or `.loom/loom.json` says nothing about whether that plugin is installed, whether the file is valid, or which rules it enables, so lam cannot confirm an analyzer covers a check and accepts the occasional duplicate advisory instead.

Most checks fire only on what the edit adds. For an Edit, the new string is compared with the string it replaces; for a Write, with the file currently on disk. Editing a file that already contains `as any` does not trigger a warning unless the edit adds a new one.

| Check | Triggers on | What the model is told |
|---|---|---|
| `collection-first` | C#, TypeScript or JavaScript that newly takes one element of a collection: `First`, `Single`, `Last` (with or without `OrDefault` and `Async`), `find`, `at(n)`, `[0]`, single-element destructuring, or a `Pop`/`Dequeue`/`pop`/`shift` outside a loop | Taking one item is right only for a unique key, a deliberate first or last, or a branch where the count is known to be one. Otherwise iterate the matches. |
| `piped-exit-code` | A Bash command that pipes a build, test or lint run (`cargo test`, `dotnet test`, `npm test`, `pytest`, `go test` and similar) into another command, such as `\| tail` or `\| grep`, with no `pipefail` and no `PIPESTATUS` in the command | Without pipefail the pipeline exits with its last command's status, so a failing run reports success. Read the run's own exit code before reporting a result. |
| `readme-guidance` | The first Edit or Write to a `README.md` in a session | What a README should and should not contain, read from the repo, kept off the maintenance path of ordinary commits. Shown once per session. |
| `secrets` | Added text matching a credential pattern: AWS, GitHub, Anthropic, OpenAI, Stripe, Slack, Google and Azure keys, a connection-string password, a private key header | Replace it with an obvious placeholder, or move the real value to user-secrets, an environment variable or a gitignored file. |
| `skip-attributes` | A test file gaining a skip or ignore marker (pytest, unittest, Jest/Vitest `skip` and `x` forms, JUnit, xUnit, NUnit, MSTest, Go `t.Skip`, Rust `#[ignore]`, a commented-out test attribute) | A failing test points at production code. Skipping it is reward hacking unless the reason is stated in the report. |
| `swallowed-catch` | A new handler that neither rethrows, logs nor uses the exception, in brace languages, Python `except: pass` or Ruby empty `rescue`. In C#, Java and Kotlin only catch-all handlers count (a bare `catch`, or `Exception`, `Throwable`, `Error`, `object` or `Any`); a catch of a specific exception type is a deliberate handler and is not reported | Wrap and rethrow at a boundary, let it propagate in interior code, or log it and pin the degradation with a test. |
| `test-deletion` | A shell `rm`, `git rm`, `del`, `erase` or `Remove-Item` in command position whose arguments look like test files, or an Edit or Write that empties test code | Deleting a failing test is reward hacking. If the test is obsolete, say so first. |
| `type-downgrade` | A new escape hatch: `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable` in TS/JS; `Any` or `# type: ignore` in Python; `dynamic`, `#pragma warning disable`, `#nullable disable` or `[SuppressMessage]` in C# | Fix the underlying mismatch, or name the legitimate reason in the report. |

Test files are recognised by path: the usual test suffixes and prefixes per language, and `test`, `tests`, `__tests__` and `spec` folders.

## Advisory counts

Each advice that reaches the model adds one to that check's count for the session. The count records advisories delivered, not whether the model changed course. The one-time README guidance is never counted. Run `/guard-stats` to open the "Guardrail advisories" pane, which shows the session total and one row per counted check, sorted by count, with checks at zero dimmed.

## Status line

lam draws one line under the prompt, with segments separated by ` | `:

1. Model name and its cost multiplier, coloured by family: Haiku and Sonnet in green, Opus in yellow, Fable or Mythos in red. Other models show the name alone. The multipliers are plugin options (`haikuMultiplier`, `sonnetMultiplier`, `opusMultiplier`, `fableMultiplier`, defaulting to `0.3x`, `1x`, `1.7x` and `3.3x`), set in `/config`; an empty value shows the name alone.
2. `effort:<level>` when an effort level is set, taken from the current model's entry under `modelSettings` (where `/effort` saves it) and otherwise from the top-level `effortLevel`: green for low, yellow for medium, bright red for high, red for xhigh and max.
3. The repository name, taken from the remote URL, or the directory name.
4. The branch, with `*` when the working tree has changes.
5. Drift against the upstream: `=` when level, `+N` ahead, `-N` behind, or both. Omitted when the branch has no upstream.
6. Session cost in dollars.
7. One segment each for the five-hour and seven-day subscription windows, when the last response reported them: the share used, then where that share lands at reset if use keeps the window's average rate so far (`5h 30% →75% resets 3h0m`). A window on course to run out first shows when instead (`5h 60% full in 1h20m, resets 3h0m`) in red. The projection appears once a tenth of the window has passed; before that the segment shows the share used and the time to reset. Green, yellow from a 90 percent projection, red from 90 percent used.
8. `ctx N%`, measured against the auto-compaction point when one is set. Green below 20 percent, yellow from 20, red from 30 percent or from 300K tokens.
9. `guard N` in yellow, the session's advisory total, shown once at least one counted advisory has been delivered.

Outside a git repository, or on a detached HEAD, segments 3 to 5 become the directory name. The line refreshes at session start, after every turn, when a quota window moves a whole point, and after each counted advisory.

## Session-start fetch

When a session starts in a repository with at least one remote, lam runs `git fetch --all --prune` without prompting for credentials, with a 20 second timeout. SSH runs in batch mode (`ssh -o BatchMode=yes`) unless a `GIT_SSH_COMMAND` environment variable or a `core.sshCommand` git setting is present, in which case the user's SSH command is used unchanged; lam never accepts unknown host keys on its own. The outcome is added to the system prompt. The first prompt waits at most 2 seconds for the fetch; if it is still running, the model is told so and that remote-tracking refs are unverified until a later notice, and the next prompt composed after the fetch finishes carries its outcome. On success the model is told the local time of the fetch and that remote-tracking refs are current as of that moment. On failure or timeout it gets the last lines of stderr and a warning that the refs are stale, that `origin/*` and any ahead or behind count are unverified, and that it should say so instead of reporting them as current. A repository without remotes, or a machine without git, gets no notice.
