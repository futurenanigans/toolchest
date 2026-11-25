---
name: mutation-testing
description: Configures, runs and analyzes mutation testing in bounded chunks, then closes the test gaps the surviving mutants show. Splits a codebase into chunks sized to a time budget, pairs each with the tests that reach it, keeps a resumable plan, groups survivors into behaviours a test should pin, and verifies each fix by rerunning the mutants it targets. Use when the user asks to "run mutation testing", "set up cargo-mutants or Stryker", "check the tests with mutants", "work through the surviving mutants", or "how good are these tests". Supports Rust, C# and TypeScript or JavaScript.
argument-hint: "[--plan] [--chunk <n>|next] [--diff <base>] [--address [1,3]] [--auto] [path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent
---

Follow `${CLAUDE_SKILL_DIR}/../../references/audit-procedure.md` for the report format, the mutation pre-flight, and `--auto`, with the deviations stated below. Report path: `.claude/state/mutation-report.md`. Mutation flag: `--address`. Extra git command: `git diff <base>` to build the `--diff` chunk. Tool commands, configuration keys and output layouts per stack are in `${CLAUDE_SKILL_DIR}/references/tools.md`; read it before the first command and do not write flags from memory.

A mutation run changes one expression at a time and reruns tests. A mutant no test fails on marks behaviour the suite does not pin. The run is slow by construction, so this skill is on demand only: it never becomes a gate, a pre-commit step or part of the default test command, and no score threshold is ever set to fail a build.

A repository's own mutation instructions win over this file. Where the project documents a launcher or a scoped command (a script, a `mutation` section in its agent instructions, an analyzer's own mutation command), use that and apply only the chunking and triage below.

## Modes

- No plan on disk, or `--plan`: set up the tool if needed, then write the chunk plan and stop.
- `--chunk <n>` or `--chunk next`: run one chunk, triage its survivors, write the report.
- `--diff <base>`: skip the plan and run one chunk made of the lines changed since `<base>`.
- `--address`: fix the findings in the current report, all or a cherry-picked subset.
- A bare invocation with a plan on disk behaves as `--chunk next`.

One invocation runs one chunk. Whole-repository runs are never the default; a user who asks for one gets the plan and the estimated total first.

## Set up

1. Identify the stack and the tool from `references/tools.md`. Check the tool is installed and say how to install it when it is not; do not install without asking.
2. Run the unmutated tests once in the configuration the tool will use and record the wall time. A baseline that fails or flakes stops everything: mutation results over a red or flaky suite mean nothing.
3. Write the tool's configuration file with the choices this skill depends on: the test command limited to the fast pool (the project's tests that finish in seconds and run on every change, excluding slow integration, end-to-end and load suites), modest concurrency (two jobs unless the machine is known to be large), output under a directory git ignores, thresholds that never break, and timeouts derived from the baseline.
4. Exclude arid code in that configuration, each entry with its reason: logging and message text, `Debug` and `Display` plumbing, generated code, CLI argument glue, test support code. Mutants there are almost all equivalent or uninteresting, and they cost the same as useful ones.

## Plan: chunks sized to a budget

A chunk is a set of source files, the tests that reach them, and an estimate. The default budget is 15 minutes of wall time and about 100 mutants; the user can name another.

1. List the mutants without running them, where the tool can, and count them per file.
2. Estimate each file's cost as mutants times the time to build and run its tests, divided by the job count. Use the measured baseline, never a guess.
3. Group files that share tests into one chunk until the budget is reached. A file too large for one chunk is split by function filter or by shards, with every shard run under identical arguments.
4. Pair each chunk with the narrowest tests that reach it: the owning package's tests, the test project, or the case files that import the module and its main callers. Narrow tests are what make a chunk affordable.
5. Order chunks by what a missed bug would cost: domain rules, parsers, boundary and state logic, and recently changed code first; thin adapters last.

Write the plan to `.claude/state/mutation-plan.md` as a table with these columns: chunk number, scope (files or filter), tests, estimated mutants, estimated minutes, status (`pending`, `run`, `addressed`), and the last result. The plan is the resume point across sessions; update it after every run instead of rewriting it.

`--diff <base>` builds a single chunk from the changed lines. It is the cheapest useful run and the right default after a feature lands. It tests only changed production lines, so a diff that touches only tests selects nothing, and say so instead of reporting a clean result.

## Run one chunk

1. Require a clean working tree outside `.claude/state/` when the tool mutates sources in place, and do not edit files while such a run is going.
2. Start the run in the background and wait for it to finish; do not poll.
3. Reuse earlier results where the tool supports it (iterate, incremental or baseline modes), so a rerun pays only for mutants whose outcome can have changed.
4. Record the counts: caught, missed, timed out, unviable, and no coverage where the tool reports it. Update the plan row.

A run that exceeds twice its estimate is stopped cleanly and the chunk is split. Do not raise the timeout or the budget to push it through.

## Triage survivors

Read each surviving mutant's diff, not only its name. Then, before treating it as a gap:

1. **Confirm it against wider tests.** A survivor under a narrow test list may be killed by the full fast pool. Rerun only the surviving mutants with the wider tests. Those that die there are not findings; they show the chunk's test pairing was too narrow, which is fixed in the plan.
2. **Classify what remains.**
   - Missing assertion: real behaviour changes and nothing notices. This is a finding.
   - Untested path: the mutated code is never executed by any test. One finding per untested unit, never one per mutant.
   - Unreachable code: the branch handles input no caller can produce. The fix is deleting it or tightening a type, which is `dead-code`'s territory; list it under Out of scope.
   - Equivalent mutant: the program behaves identically for every real input. Dismiss it with the reason.
   - Arid code that the exclusions missed. Dismiss it and add the exclusion to the configuration.
3. **Group by behaviour.** Several survivors in one function usually mean one unpinned behaviour (a boundary, an error path, a return value nobody checks). One behaviour is one finding.

Timeouts count as detected, but a cluster of them in one function usually means a mutant that hangs; exclude that function with the reason. Unviable mutants need no action.

## Report

Use the shared report format with these fill-ins:

- **Title**: `Mutation testing`.
- **Classification**: `Kind`, either `Missing assertion` or `Untested path`. Extra header field: `Mutants: {count}`.
- **Summary**: chunk number and scope, then caught, missed, timed out and unviable counts, then the findings count. Give the score once, as a record; do not compare it to a target.
- **Context section**, after Summary: `## Run`, with the exact command, the tests used, the wall time against the estimate, and the tool version.
- **What**: the behaviour no test pins, in terms of inputs and outputs.
- **Evidence**: each surviving mutant as `{file:line}` with the replacement it made.
- **Extra field** `**Wider tests:**`: which broader test set was run against these mutants and that they still survived.
- **Next step**: the test to write, named by the behaviour it asserts and the level it should sit at.
- **Section** after Findings: `## Dismissed`, one line per equivalent or arid mutant with the reason.
- **Severity.** High: a domain rule, a security check or a data-loss path is unpinned. Medium: a boundary or error path in ordinary logic. Low: a narrow edge case.
- **Effort.** Small: one assertion or case in an existing test. Medium: a new test with its own fixture. Large: the code needs a seam before it can be tested.

## Address

Each finding's subagent:

1. Writes or extends a test at the public surface of the unit, asserting the behaviour the finding names. The test must pass on the unmutated code and would fail on each mutant in the finding.
2. Holds the test to `${CLAUDE_SKILL_DIR}/../test-quality/SKILL.md`. A test that mirrors the mutant (asserting an internal constant, a call count, an implementation detail) kills the mutant and pins nothing, so it is not written.
3. Changes production code only where a finding says the code cannot be tested as it stands, and then only to add the seam.

After each finding, rerun only that finding's mutants with the tool's narrowest filter. The finding is done when they are caught and the fast tests pass. A mutant that still survives means the test does not assert what it claims: fix the test, never the filter.

Never clear a survivor by skipping it. A skip attribute, a disable comment or a new exclusion is allowed only for a mutant classified as equivalent or arid, with the reason beside it.

When every finding in a chunk is addressed, mark the plan row `addressed` with the rerun's counts.

## `--auto`

Runs `--chunk next`, then addresses its findings, then stops. It does not continue to the following chunk; each chunk is a separate invocation so its cost is a separate decision.
