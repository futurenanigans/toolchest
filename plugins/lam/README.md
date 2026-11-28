# lam

Local Agent Monitor. It watches the edits and shell commands Claude Code makes, adds advice to the model when an edit looks like a known shortcut, counts the advisories it delivered, draws a status line under the prompt, and runs `git fetch` when a session starts so the model knows how fresh its remote-tracking refs are.

## Advisory checks

Every Edit and Write call, and every Bash or PowerShell call, runs through five checks. A check that fires attaches its message to the tool result as context for the model. The call itself always goes ahead: lam never blocks or rewrites anything. If another hook or the permission system denies the call, or an Edit or Write reports an error (for example when the string to replace is not in the file), lam adds no advice and counts nothing. A shell command that exits with an error is still advised, because it may have run in part.

lam carries no code-shape checks. Whether a catch swallows its exception, a type is widened or one element is taken from a collection is a question for awl, loom or another analyzer that reads the syntax tree. The checks here cover the process around an edit, which no analyzer sees.

The edit checks compare counts. For an Edit, matches in the new string are counted against matches in the string it replaces; for a Write, against the file currently on disk. A check fires when the new text holds more matches than the old, so an edit that keeps one `it.skip` does not trigger a warning and an edit that adds a second one does. A shell command has no earlier text and is read on its own.

| Check | Triggers on | What the model is told |
|---|---|---|
| `piped-exit-code` | A Bash command that pipes a build, test or lint run (`cargo test`, `dotnet test`, `npm test`, `pytest`, `go test` and similar) into another command, such as `\| tail` or `\| grep`. The run may sit behind a path, `!`, `uv run` or a similar wrapper, or inside a piped `( )` or `{ }` group. A run that only lists or reports (`--version`, `--help`, `--list`, `-list`, `--collect-only`, `--dry-run`) is skipped, as is a command that sets pipefail with `set -o pipefail` or reads `PIPESTATUS` | Without pipefail the pipeline exits with its last command's status, so a failing run reports success. Read the run's own exit code before reporting a result. |
| `readme-guidance` | The first Edit or Write to a `README.md` in a session that is not denied and does not fail | What a README should and should not contain, read from the repo, kept off the maintenance path of ordinary commits. Shown once per session. |
| `secrets` | Edited or written text that gains a credential: an AWS access key (`AKIA` or `ASIA`, except the documented `...EXAMPLE` keys), a GitHub, Anthropic, OpenAI, Stripe, Slack, Google or Azure key, a private key header, a `Password=` or `Pwd=` value in a connection string, a quoted literal assigned to `password` (JSON, YAML or code), or an unquoted `password:` value in a `.yml` or `.yaml` file. A Bash or PowerShell command is checked for the key patterns only | Replace it with an obvious placeholder, or move the real value to user-secrets, an environment variable or a gitignored file. |
| `skip-attributes` | A test file gaining a skip or ignore marker: pytest `skip`, `skipif` and `xfail`, unittest `skip`, Jest/Vitest `skip`, `skipIf`, `skip.each`, `todo`, `fixme` and `x` forms, JUnit, xUnit, NUnit, MSTest, Go `t.Skip`, `t.Skipf` and `t.SkipNow`, a commented-out .NET test attribute. Rust `#[ignore]`, with or without a reason, is checked in every `.rs` file | A failing test points at production code. Skipping it is reward hacking unless the reason is stated in the report. |
| `test-deletion` | A shell `rm`, `git rm`, `del`, `erase` or `Remove-Item` whose arguments look like test files or a test directory. An Edit or Write to a test file that leaves it with fewer test declarations than the text it replaces, or replaces text with nothing | Deleting a failing test is reward hacking. If the test is obsolete, say so first. |

Test files are recognised by path: the usual test suffixes and prefixes per language, and `test`, `tests`, `__tests__` and `spec` folders. A delete command also counts when its argument is one of those folders. Paths under `coverage`, `node_modules`, `bin`, `obj`, `TestResults` and the Python and nyc cache folders are build output and are not counted, and `git rm --cached` is not a deletion.

A delete command is recognised where the shell would run it: at the start of the command, after `;`, `&&`, `||`, `|`, `&` or a newline, after `(`, `{` or `!`, and behind `if`, `then`, `do`, `sudo`, `env`, `xargs`, a `NAME=value` assignment or a path such as `/bin/rm`. Text inside quotes or after `#` is never read as a command.

### Limits

The checks match text with patterns and split shell commands on their separators. They do not parse a shell or a programming language, so these inputs go unseen:

- A command passed as a string to another program, such as `bash -c "rm a.test.ts"`, `find -exec rm` or `find -delete`, a command inside `$( )` or backticks, a heredoc body, an alias, a shell function or a script file.
- A wrapper with its own options before the command, such as `timeout -s KILL 60 cargo test` or `uv run --frozen pytest`.
- A pipeline in a PowerShell call. `piped-exit-code` reads Bash only.
- A pipefail setting made outside the command text, in an earlier call or a shell profile, and a `set +o pipefail` that follows a `set -o pipefail` in the same command.
- A test file or directory deleted through a variable, a glob that does not itself look like a test path, a move or rename, `git clean`, or a language API.
- A test commented out or renamed so its runner no longer collects it, and a test deleted from a Rust source file, where the path does not mark the file as a test file.
- A credential that matches none of the key formats, a password under any key other than `password` or `pwd`, an unquoted password outside a connection string or a YAML file, and a password given to a shell command.
- A skip marker read through a variable or a helper, and a framework's skip form that is not in the list above.

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
