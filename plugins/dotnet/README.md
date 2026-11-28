# dotnet

C# conventions for Claude Code, a canonical `.editorconfig` and `Directory.Build.props`, and a guarded workflow for updating NuGet packages. Install it if you want Claude to write C# to Microsoft's published conventions regardless of what the surrounding file does, and to update dependencies in small, tested, locally committed steps.

## The dotnet skill

The `dotnet` skill loads from its description before Claude writes or reviews `*.cs`, `*.csproj`, `*.props`, `*.targets`, `*.razor` or `*.cshtml`, or when you run `/dotnet:dotnet`. The other skills in this plugin read it, and the toolchest `CLAUDE.md` (installed as `~/.claude/CLAUDE.md`) lists it too.

The skill's central policy is that standard Microsoft conventions win over a project's local style, even when the project's own `CLAUDE.md` or `.editorconfig` says otherwise. Lines Claude writes get Allman braces, `_camelCase` fields, `is null`, file-scoped namespaces and the rest, even inside a K&R file. A direct instruction from you in the session to follow local style overrides this.

It also fixes house choices where the standard allows variance: `var` only when the type is apparent, expression bodies for properties and lambdas but not methods, no default `sealed`, nullable enabled for new projects but never switched on during a format pass. It covers DI lifetimes, `CancellationToken` threading, `IOptions<T>` configuration, validation at boundaries, and a handful of CA analyzer rules. Only the public API of a packaged library carries `///` doc comments. Application code puts CS1591 in `NoWarn`, a packaged library leaves it on, and `GenerateDocumentationFile` stays on in both so IDE0005 still reports unused usings.

The override is limited to style. Refactors must preserve behavior, and renames of `public` or `protected` members are flagged instead of applied unless you asked for a rename pass.

## Skills

| Skill | Invocation | Model can invoke it |
| :- | :- | :- |
| `dotnet-project-standards` | `/dotnet:dotnet-project-standards`, or Claude picks it up when you ask to set up analyzers or reformat code | yes |
| `nuget-package-update` | `/dotnet:nuget-package-update [minor\|patch]` | no (`disable-model-invocation: true`) |

### dotnet-project-standards

This skill copies two files from its `assets/` folder to the repo root. `.editorconfig` encodes Allman braces, apparent-type `var`, modifier order, `readonly`, sorted outside-namespace usings and file-scoped namespaces, mostly at `warning`. `Directory.Build.props` sets `AnalysisMode=Recommended`, `AnalysisLevel=latest`, `EnforceCodeStyleInBuild`, `GenerateDocumentationFile` and suppresses CS1591, which a packaged library turns back on in its own project. Greenfield projects also get `<Nullable>enable</Nullable>`.

On an existing codebase it runs `dotnet build` after adding the files and reports how many new warnings appeared. If the number is large or warnings are treated as errors, it stops and agrees a path with you instead of leaving the build broken. If your existing `.editorconfig` fights the standard, it proposes replacing it and does not rewrite it silently.

For a refactor or format request it converts the target files wholesale, then runs `dotnet format`, `dotnet build` and any tests, and reports what it skipped. Member reordering happens only when you ask. The skill does not commit.

### nuget-package-update

This skill updates SDK-style (PackageReference) solutions to the latest stable versions. It does not handle `packages.config`. The optional argument narrows scope: `minor` allows minor and patch updates, `patch` allows patch only, and no argument allows everything.

It discovers updates with `dotnet list package --outdated --format json`, edits `Directory.Packages.props` when Central Package Management is present, and checks target framework compatibility on major bumps. Packages go in groups: `Microsoft.Extensions.*`, `Microsoft.AspNetCore.*`, Azure, test libraries, then everything else one at a time. After each group it builds and tests in Release and commits with `git add -u`. A failing group gets up to three fix attempts with release-note research; after that its changes are reverted and it is recorded as failed.

It commits on the current branch, and asks first if that branch is main or master. It never creates branches, pushes, or opens a PR. It finishes with a printed report covering updates, holds, license skips, unverified runtime behavior and test results.

Prerequisites: the .NET SDK, git, and Docker if your tests use Testcontainers. A private feed that returns 401 makes it stop and ask you to authenticate.

License restrictions are checked before any update:

| Package | Status | Alternative |
| :- | :- | :- |
| FluentAssertions | Banned in all versions (license moved to commercial, Xceed) | Shouldly |

A banned package is left at its current version and flagged in the report. If the skill finds another license change during a run, it reports the row to add to the table; it does not edit the skill itself.
