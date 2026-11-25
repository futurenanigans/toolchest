# toolchest

Claude Code plugin marketplace. Add it with `/plugin marketplace add futurenanigans/toolchest`, then install plugins from `/plugin`.

Each plugin lives under `plugins/` with its own README. Rules ship in a plugin's `rules/` folder beside the skills that reference them.

The global standards are not a plugin. [`claude-md/CLAUDE.md`](claude-md/CLAUDE.md) is the user-level `CLAUDE.md` these plugins assume; copy it to `~/.claude/CLAUDE.md`. Its rules section maps each rule to the plugin that ships it.

## Plugins

| Plugin | What it does |
| :- | :- |
| `awl` | Roslyn semantic analysis on every C# edit. It denies an edit that breaks a rule and reports design advisories, with a skill that explains each rule and how to resolve it. |
| [`dotnet`](plugins/dotnet/README.md) | C# conventions that follow Microsoft's style over a project's local one, a skill that installs a standard `.editorconfig` and `Directory.Build.props`, and a NuGet update workflow that updates in tested groups and commits locally. |
| [`lam`](plugins/lam/README.md) | Local Agent Monitor. It adds advice when an edit or command looks like a shortcut (a skipped or deleted test, a type escape hatch, a swallowed exception, a pasted credential), counts those corrections, draws a status line and fetches from git at session start. |
| `loom` | TypeScript, JavaScript and Vue analysis on every edit, with the same deny-or-advise model as awl and a skill for reading its findings. |
| [`memory`](plugins/memory/README.md) | Checks Claude Code's saved memories against the repository and your instructions and reports which to keep, update, merge, promote or delete; `--apply` backs up the store and asks before changing it. |
| [`refactoring`](plugins/refactoring/README.md) | Audits of the code on disk for bugs, maintainability, architecture, dead code and repeated patterns. Each writes an evidence-backed report and can fix its findings one commit at a time. |
| [`rust`](plugins/rust/README.md) | A rule for modern Rust (edition 2024, workspace lints, error types, the fmt, clippy and test checks) and a `modern-rust` reference skill for scaffolding and review. |
| [`session`](plugins/session/README.md) | `/session:handover <goal>` writes a verified brief for one goal; after `/clear`, `/session:continue` picks it up. |
| [`testing`](plugins/testing/README.md) | Mutation testing with cargo-mutants, Stryker.NET or StrykerJS in resumable chunks, closing the gaps surviving mutants show, plus an audit that removes tests that can never catch a regression. |
| [`writing`](plugins/writing/README.md) | A house style for prose Claude writes to disk, a rule that limits code comments, and output styles that cap reply length. |

The `awl` plugin is a release archive from [awl-dist](https://github.com/futurenanigans/awl-dist), pinned by sha256. It carries `awl.dll` and runs it with `dotnet`, so it needs the .NET 10 runtime on PATH.

The `loom` plugin is a release archive from [loom-dist](https://github.com/futurenanigans/loom-dist), pinned by sha256. It runs on the machine's Bun, so it needs `bun` on PATH, and carries its engine, currently for linux-x64 (glibc) only.
