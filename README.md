# toolchest

Claude Code plugin marketplace. Add it with `/plugin marketplace add futurenanigans/toolchest`, then install plugins from `/plugin`.

This is a personal toolchest, published as is. Everything here is experimental and changes without notice. Plugins carry no version, so an auto-updating install picks up behaviour changes from the next session. The pinned analyzers are alpha releases, and the global `CLAUDE.md` is one person's taste, written for repositories where an agent writes most of the code. Trestle runs coding agents autonomously and merges their work into your branches. There is no support, roadmap or response time: issues and pull requests may be read, acted on or closed without comment, and none of them creates an obligation. Fork it if you want it to go somewhere else.

Each plugin lives under `plugins/` with its own README. Conventions that apply to some files ship as skills in the plugin they belong to, and load by their description.

The global standards are not a plugin, because Claude Code loads no `CLAUDE.md` from a plugin. [`claude-md/CLAUDE.md`](claude-md/CLAUDE.md) is the user-level `CLAUDE.md` these plugins assume. Import it from the marketplace's own checkout so it updates with the plugins: put this line in `~/.claude/CLAUDE.md`, with any personal rules below it,

```
@~/.claude/plugins/marketplaces/toolchest/claude-md/CLAUDE.md
```

and turn on auto-update for toolchest in `/plugin` under Marketplaces, or set `"autoUpdate": true` on its `extraKnownMarketplaces` entry in `~/.claude/settings.json`. Third-party marketplaces do not auto-update by default, and an update lands a few minutes after the first message of a session, so a change to the standards takes effect from the next session. Its convention skills section maps each of those skills to the plugin that ships it.

## Requirements

CI validates every plugin and runs the tests with Claude Code 2.1.332; that is the tested version. What each plugin needs on `PATH`:

| Plugin | Needs |
| :- | :- |
| `awl` | the .NET 10 SDK (it loads solutions through MSBuild, so the runtime alone is not enough) |
| `dotnet` | the .NET SDK and `git`; Docker if the tests use Testcontainers |
| `gimlet` | `bash` and `curl`, `git` for baselines, `cosign` for `gimlet update`; each scanner or probe whose own prerequisite (`dotnet`, the .NET 10 runtime, `npm`, `uv`, Java 17+) is missing is skipped |
| `loom` | `bun`, on linux-x64 (glibc) or windows-x64 |
| `rotfeste` | the .NET 10 SDK (it loads projects through MSBuild, so the runtime alone is not enough) |
| `rust` | a Rust toolchain with edition 2024 (1.85, or 1.88 for let-chains) |
| `testing` | cargo-mutants, Stryker.NET or StrykerJS for the stack being mutated |
| `trestle` | `bun` and `git`, plus each agent CLI it drives (`claude`, `codex`, `opencode`, `agy`, `pi`), signed in |
| `writing` | Node 18+ or Bun to run `prose-lint.mjs` by hand or in CI; the dash hook runs inside Claude Code |

`review` needs `git`, plus `gh` for GitHub PRs or `az` with the `azure-devops` extension for Azure DevOps PRs. `lam`, `memory`, `refactoring` and `session` need nothing beyond Claude Code.

The two analyzers are opt-in per repository. Awl does nothing until the repository has `.awl/awl.json` naming a target; `/awl:awl-enable` writes it. Loom selects its rules from `.loom/loom.json`; `/loom:working-with-loom` covers configuring it.

## Plugins

| Plugin | What it does |
| :- | :- |
| [`awl`](https://github.com/futurenanigans/awl-dist) | Roslyn semantic analysis on every C# edit. It denies an edit that breaks a rule and reports design advisories, with a skill that explains each rule and how to resolve it. Installed from a sha256-pinned awl-dist release; needs the .NET 10 SDK on PATH. |
| [`dotnet`](plugins/dotnet/README.md) | C# conventions that follow Microsoft's style over a project's local one, a skill that installs a standard `.editorconfig` and `Directory.Build.props`, and a NuGet update workflow that updates in tested groups and commits locally. |
| [`gimlet`](plugins/gimlet/README.md) | Runs C#/.NET security scanners over a repository (opengrep with a bundled ruleset, the SDK's Security analyzers, Dotnetarium taint analysis, NuGet and OSV vulnerable-package checks, Betterleaks secrets) and probes a running API through its OpenAPI document (Spectral, Schemathesis, ZAP), merging everything into one findings file. A skill picks the scan (whole tree, a path, or only what a branch introduced) and triages the findings. Each tool it downloads is pinned to a version and installed on first use. |
| [`lam`](plugins/lam/README.md) | Local Agent Monitor. It adds advice when an edit or command looks like a process shortcut (a skipped or deleted test, a test run piped past its exit code, a pasted credential), counts those corrections, draws a status line and fetches from git at session start. |
| [`loom`](https://github.com/futurenanigans/loom-dist) | TypeScript, JavaScript and Vue analysis on every edit, with the same deny-or-advise model as awl and a skill for reading its findings. Installed from a sha256-pinned loom-dist release carrying engines for linux-x64 (glibc) and windows-x64; needs `bun` on PATH. |
| [`memory`](plugins/memory/README.md) | Checks Claude Code's saved memories against the repository and your instructions and reports which to keep, update, merge, promote or delete; `--apply` backs up the store and asks before changing it. |
| [`refactoring`](plugins/refactoring/README.md) | Audits of the code on disk for bugs, maintainability, architecture, dead code and repeated patterns. Each writes an evidence-backed report and can fix its findings one commit at a time. |
| [`review`](plugins/review/README.md) | Reviews a GitHub or Azure DevOps pull request, or a local branch, against its merge base, running Awl, Loom or Gimlet in diff mode where the repository opted in. Every finding is verified against the code, labelled blocking, should-fix or nit, and given a fix; the report says which files it did not review. Read-only toward the PR: replies are drafted in chat for you to post. |
| [`rotfeste`](https://github.com/futurenanigans/rotfeste-dist) | Finds .NET code nothing reaches. It roots every executable's entry point, composes an application the way it starts (without starting it) to read what its DI container and framework registries hold, or roots a library's public API (as `PublicAPI.Shipped.txt` declares it, where the project has one). It reports unreached declarations with the root set, the provenance of each root and the sites it cannot follow. Findings are ranked hypotheses, never a gate. Installed from a sha256-pinned rotfeste-dist release. |
| [`rust`](plugins/rust/README.md) | A `rust` skill for modern Rust (edition 2024, workspace lints, error types, the fmt, clippy and test checks) and a `modern-rust` reference skill for scaffolding and review. |
| [`session`](plugins/session/README.md) | `/session:handover <goal>` writes a verified brief for one goal; after `/clear`, `/session:continue` picks it up. |
| [`testing`](plugins/testing/README.md) | Mutation testing with cargo-mutants, Stryker.NET or StrykerJS in resumable chunks, closing the gaps surviving mutants show, plus an audit that removes tests that can never catch a regression. |
| [`trestle`](plugins/trestle/README.md) | Runs `claude`, `codex`, `opencode`, `agy` or `pi` in isolated git worktrees against a contract, loops until the repository's own checks pass by exit code or structured test report, and merges a passing worktree when asked. Includes a dependency-aware task queue and a live `/trestle` pane. |
| [`writing`](plugins/writing/README.md) | A house style for prose Claude writes to disk, a `comments` skill that limits code comments, and output styles that cap reply length. |

## Evals

`dotnet`, `rust`, `review`, `writing`, `testing` and `refactoring` carry `claude plugin eval` smoke cases under `evals/`, tagged `smoke`. Each case runs with and without its plugin, so the score shows what the plugin changes. They call the model on your credentials, so they run on demand, never in CI. From the plugin's folder:

```sh
claude plugin eval . --tag smoke --scaffold --allow-tools Edit Write Bash --no-publish
```
