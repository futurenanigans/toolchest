---
name: dotnet-project-standards
description: Sets up the canonical .editorconfig and Directory.Build.props for a C# project and converts existing code to standard conventions, with a blast-radius check before enabling them on an existing codebase. Use when the user asks to "set up .editorconfig and analyzers", "add the standard Directory.Build.props", "reformat to standard conventions", "apply Microsoft conventions", or to refactor or format existing C# files wholesale. The conventions themselves live in the dotnet rule, which loads for C# files.
---

# .NET standard setup and reformatting

The conventions are in `${CLAUDE_SKILL_DIR}/../../rules/dotnet.md`. This skill applies them to a whole project or file set.

## Standard `.editorconfig` and analyzer setup

The canonical config lives in `${CLAUDE_SKILL_DIR}/assets/`.

- `assets/editorconfig`: copy to the repo root as `.editorconfig`. Encodes Allman braces, apparent-type-only `var`, modifier ordering, `readonly`, `is null`, the expression-body policy, outside-namespace usings sorted `System`-first, no multiple blank lines, and file-scoped namespaces, mostly at `warning` severity.
- `assets/Directory.Build.props`: copy to the repo root. Turns on recommended CA analyzers (`AnalysisMode=Recommended`), runs IDE style rules at build time (`EnforceCodeStyleInBuild`), and generates the documentation file with CS1591 suppressed, because build-time IDE0005 (unused usings) needs it; members carry no doc comments. For a greenfield project, also add `<Nullable>enable</Nullable>`.

**Blast-radius check before committing to the setup on an existing codebase.** `EnforceCodeStyleInBuild` plus `AnalysisMode=Recommended` can surface hundreds of new warnings at once, and will fail the build wherever `TreatWarningsAsErrors` or `-warnaserror` is in effect (common in CI). After adding the files, run `dotnet build` and report the new warning count before going further. If the count is large or warnings-as-errors is on, tell the user and agree on a path (fix now, stage rules gradually, or lower severities) instead of leaving the build broken.

With the setup in place, `dotnet format` and the build enforce the conventions: run `dotnet format` after a refactor pass and `dotnet format --verify-no-changes` in CI. Optional heavier layers for stricter enforcement: `StyleCop.Analyzers` (granular SA1xxx layout and doc rules) and `Roslynator.Analyzers` (RCS1xxx semantic simplifications).

**Deviating project config.** If an existing `.editorconfig` actively fights the standard (tabs, K&R braces), neither obey it silently nor rewrite it silently. Apply standard conventions in the code and propose replacing the config with the standard one from `assets/`.

## Refactoring or formatting existing code

1. Convert the target files wholesale: braces, naming (subject to the public-API limit in the dotnet rule), `var` policy, expression bodies, switch expressions, null patterns, file-scoped namespaces, using ordering, comment cleanup. Local conventions the files previously followed are not preserved.
2. **Member reordering** only when the user explicitly asks, into this order: constants, fields (`readonly` first), constructors (static, then instance), properties, methods (public, then protected, then private), nested types. Reordering swamps the diff and makes the pass unreviewable. Otherwise leave member order alone and mention that it deviates, if it does.
3. Set up or align the `.editorconfig` and `Directory.Build.props` from `assets/` if missing or deviating, with the user's consent and the blast-radius check above.
4. Run `dotnet format`, then `dotnet build`; run tests if present.
5. Report what was converted and list anything intentionally skipped (public API renames, member reordering, functional exceptions) so the user can decide on those.
