# testing

Two skills that measure how much a test suite really protects, and one rule for writing tests worth keeping. Install it when you want to find behaviour your tests do not pin, or to cut tests that could never fail on a real regression.

## mutation-testing

Mutation testing changes one expression at a time and reruns the tests. A mutant that no test fails on marks behaviour the suite does not check. This skill runs that in chunks small enough to finish, keeps a plan you can resume across sessions, and then writes the tests the survivors call for.

Run it as `/testing:mutation-testing`, or ask Claude to "run mutation testing" or "work through the surviving mutants". Claude may also pick it up on its own, since model invocation is not disabled. The argument hint is `[--plan] [--chunk <n>|next] [--diff <base>] [--address [1,3]] [--auto] [path]`.

| Flag | What happens |
| --- | --- |
| none, no plan yet, or `--plan` | Sets up the tool if needed, writes the chunk plan, stops |
| `--chunk <n>` or `--chunk next` | Runs one chunk, triages survivors, writes the report |
| none, plan on disk | Same as `--chunk next` |
| `--diff <base>` | Runs one chunk built from lines changed since `<base>` |
| `--address` or `--address [1,3]` | Fixes all findings in the current report, or the numbered ones |
| `--auto` | Runs the next chunk, addresses its findings, then stops |

Supported stacks are Rust with cargo-mutants, C# with Stryker.NET and TypeScript or JavaScript with StrykerJS. The skill checks the tool is installed and tells you how to install it; it does not install anything without asking. If your repository documents its own mutation command, that wins.

Setup runs the unmodified tests once to get a baseline time, and stops if they fail or flake. It writes the tool's config with the fast test pool only, two jobs, output under an ignored directory, timeouts from the baseline, thresholds that never break a build, and exclusions for logging, generated code and similar code where mutants are noise. Chunks default to about 15 minutes or 100 mutants, ordered so domain rules and parsers come before thin adapters. A run that takes more than twice its estimate is stopped and the chunk is split.

The plan lives in `.claude/state/mutation-plan.md` and the latest report in `.claude/state/mutation-report.md`. Survivors are rerun against the wider fast pool before they count, then grouped by behaviour, so several mutants in one function usually become one finding. Equivalent and arid mutants are listed as dismissed with a reason. The score is recorded once and never compared to a target.

Under `--address`, the working tree outside `.claude/state/` must be clean. A subagent writes one test per finding at the unit's public surface, the finding's mutants are rerun to confirm they die, the build and tests run, and each passing finding is committed. Survivors are never cleared by adding a skip.

The skill is on demand only. It never becomes a pre-commit step, a CI gate or part of the default test command.

## test-noise-audit

Classifies passing tests as valuable or noise, where noise means removing the test would not reduce confidence in the code. It then deletes the noise. Only you can start it, with `/testing:test-noise-audit [--auto] [path]`; model invocation is disabled.

It needs a clean working tree. The audit runs in a subagent and writes `.claude/state/test-noise-report.md`, with per-file tables and a list of failing, skipped or flaky tests it did not audit. Without `--auto` you review the findings and confirm before anything is removed. Then it deletes the tests and any helpers they orphan, runs the full suite, and commits with the noise count by category. If the suite fails, it restores the deleted code and stops.

## The test-quality rule

`rules/test-quality.md` lists six kinds of noise test (constructor assignment, mock call verification, trivial mapping, framework behaviour, constant values, config binding) and six kinds worth writing (state transitions, boundaries, business rules, error paths with consequences, integration boundaries, regression anchors). Both skills read it.

Plugin rules do not load automatically. The global `CLAUDE.md` in this repository tells Claude to read this rule before touching test files; without that, add a similar line to your own instructions or copy the file into `~/.claude/rules/`.
