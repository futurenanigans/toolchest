# Mutation tools by stack

Flags and keys here were read from each tool's own documentation or `--help`. Lines marked "from memory" were not, so confirm them against the installed version before relying on them. When the installed tool's `--help` disagrees with this file, the tool is right.

## Rust: cargo-mutants

Configuration lives in `.cargo/mutants.toml`. Command-line scalars override it and list values are appended to it.

| Purpose | Command line | Config key |
| --- | --- | --- |
| Files to mutate or skip | `-f <glob>`, `-e <glob>` | `examine_globs`, `exclude_globs` |
| Mutants by name | `-F <regex>`, `-E <regex>` | `examine_re`, `exclude_re` |
| One package | `-p <package>` | |
| Tests to run for every mutant | `--test-package <package>`, `--test-workspace=true` (or `false` for only the mutated package's tests) | |
| Test runner | `--test-tool nextest` | `test_tool = "nextest"` |
| Jobs | `-j 2` | |
| Timeouts | `--timeout <secs>`, `--timeout-multiplier <n>`, `--minimum-test-timeout <secs>` | `timeout_multiplier` |
| Build profile | `--profile mutants` | `profile` |
| Calls whose arguments are left alone | `--skip-calls <names>` | `skip_calls` |
| Output directory | `-o <dir>` | `output` |

Listing and sizing: `cargo mutants --list` prints the mutants without running them, `--list --json` prints them as JSON, `--list --diff` shows each change, and `--list-files` lists the source files. Add the same `-f`, `-p` and `-F` filters as the run will use, and count the lines.

Chunking:

- By file or package: `-f 'crates/parser/src/**'` or `-p parser`, with `--test-package parser` so each mutant runs only that package's tests.
- By function: `-F '<regex>'` matched against the names `--list` shows.
- By shards, for one scope too large for the budget: `--shard k/n`, with k from 0 to n-1. Every shard needs identical arguments and the same n. The guide suggests at least 10 mutants per shard.
- By diff: write the diff to a file (`git diff <base> > /tmp/x.diff`) and pass `--in-diff <file>`. Only production code overlapping changed regions is mutated; the guide calls this "not a substitute for a full test run".
- Rerunning after fixes: `--iterate` skips mutants recorded as caught or unviable in the previous `mutants.out`, so only earlier misses are tested again. Finish a chunk with one run without `--iterate`.

Output is `mutants.out/` (a previous run is moved to `mutants.out.old`): `outcomes.json` holds results and counts, `missed.txt`, `caught.txt`, `timeout.txt` and `unviable.txt` list mutants per outcome, `diff/` has one diff per mutant, and `log/` has one log per mutant (cargo-mutants 27.1.0 writes `log/`; the guide spells it `logs/`). Exit codes: 0 all caught, 2 missed mutants, 3 timeouts, 4 the baseline failed or hung.

Performance, from the guide: start at `-j 2` or `-j 3` and do not scale with core count, because each job needs its own build directory (often over 2 GB). `--in-place` avoids the copy and cannot be combined with `--jobs`. A `[profile.mutants]` that inherits from `test` with `debug = "none"` shortens builds. The default test timeout is five times the baseline with a 20 second floor.

Skipping, for equivalent or arid code only: `#[mutants::skip]` on a function, impl, module or item (needs the `mutants` crate as a dependency), or `#[cfg_attr(test, mutants::skip)]`, or an `exclude_re` entry with a comment giving the reason.

## C#: Stryker.NET

Run `dotnet stryker` from the test project folder. Install, from memory: `dotnet tool install -g dotnet-stryker`. Configuration is `stryker-config.json` in the test project folder, under a `stryker-config` object; `-f` names another file.

| Purpose | Option |
| --- | --- |
| Files to mutate | `mutate` globs, `!` to exclude; `-m` on the command line |
| Project and tests | `project`, `test-projects`, `solution` |
| Only changed code | `--since:<committish>` (`since.target` in config) |
| Reuse unchanged results | `--with-baseline:<committish>`; cannot be combined with `since` |
| Which tests run per mutant | `coverage-analysis`, default `perTest` |
| Jobs | `concurrency`, default half the logical processors |
| How many mutators | `mutation-level`: `Basic`, `Standard` (default), `Advanced`, `Complete` |
| Mutators and methods to skip | `ignore-mutations`, `ignore-methods` |
| Thresholds | `thresholds`: `{ "high": 80, "low": 60, "break": 0 }`; keep `break` at 0 |
| Reports | `reporter`: `json`, `html`, `cleartext`, `progress`; output under `StrykerOutput/<timestamp>/reports/` |

Chunking: one test project is the natural chunk, narrowed with `mutate` globs to a folder only when the project alone exceeds the budget. `coverage-analysis` at `perTest` already limits each mutant to the tests that cover it, so the pairing step is mostly choosing the test project. Use `since` for a diff chunk, and `with-baseline` to make reruns pay only for changed code. Set `concurrency` to 2 on a small machine.

Disabling, for equivalent or arid code only: `// Stryker disable once <Mutator>: <reason>` for the next line, or `// Stryker disable <Mutator>: <reason>` paired with `// Stryker restore <Mutator>`.

## TypeScript and JavaScript: StrykerJS

Run `npx stryker run`. Configuration is `stryker.config.json`.

| Purpose | Option |
| --- | --- |
| Files to mutate | `mutate` globs, `!` to exclude |
| Line range in one file | `--mutate src/app.ts:10-40`; a range cannot be combined with a glob in one entry |
| Reuse earlier results | `--incremental`, stored in `reports/stryker-incremental.json` (`incrementalFile`); `--force` reruns everything in scope |
| Which tests run per mutant | `coverageAnalysis`: `perTest` (default), `all`, `off` |
| Jobs | `concurrency` |
| Timeouts | `timeoutMS` (default 5000), `timeoutFactor` (default 1.5) |
| Mutating the working tree | `inPlace` |
| Thresholds | `thresholds`: `{ high: 80, low: 60, break: null }`; keep `break` at `null` |
| Reports | `reporters`: `json`, `html`, `clear-text`, `progress`; defaults `reports/mutation/mutation.json` and `reports/mutation/mutation.html` |

Chunking: a `mutate` glob or line range per chunk. With a test runner Stryker has a plugin for, `perTest` coverage pairs tests to mutants on its own. With the `command` runner (Bun, or any runner without a plugin) Stryker cannot see coverage, so every mutant reruns the whole command: the chunk's test command must name only the case files that reach the mutated source, and cost is mutants times that command's run time.

Reading survivors from the JSON report:

```sh
jq -r '.files | to_entries[] | .key as $file | .value.mutants[] | select(.status == "Survived" or .status == "NoCoverage") | "\($file):\(.location.start.line) \(.status) \(.mutatorName) -> \(.replacement)"' reports/mutation/mutation.json
```

Disabling, for equivalent or arid code only: `// Stryker disable next-line <Mutator>: <reason>`.

## Scores

Stryker's definitions: detected is killed plus timeout, undetected is survived plus no coverage, and the mutation score is detected divided by detected plus undetected. Compile and runtime errors and ignored mutants are left out. cargo-mutants reports counts and leaves the ratio to the reader; unviable mutants are left out the same way.
