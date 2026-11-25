---
name: pattern-discovery
description: Discovers emergent patterns in the current code on disk (library reimplementations, repeated structural shapes, unnamed conventions) and optionally formalizes them by adopting a library, extracting an abstraction, documenting the convention, or leaving them alone. Use when the user asks to "find duplicated patterns", "find repeated code", "what could use a library here", "simplify recurring structures", or "surface conventions". Never reviews a git diff.
argument-hint: "[--auto] [--formalize [1,3]] [--context <path>] [path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash(git status *), Bash(git rev-parse *), Bash(git add *), Bash(git commit *)
---

Follow `${CLAUDE_SKILL_DIR}/../codebase-health/references/audit-procedure.md` for scanning against code on disk, report state and frontmatter, `--context`, the mutation pre-flight, and `--auto`. Report path: `.claude/state/patterns-report.md`. Mutation flag: `--formalize`.

## External context

Useful `--context` inputs are duplication reports, dependency graphs, and clone detection results. Use clone clusters with file locations as confirmed Pass 1 starting points, and use coupling metrics or circular-dependency data to surface patterns rooted in structural relationships that text scanning misses.

## Scan: two passes

**Pass 1, structural inventory.** Search the codebase (or `path` if scoped) for recurring structural shapes:
- Named design patterns (GoF or enterprise) implemented by hand
- Library reimplementations: code that does what a mature ecosystem library already handles (retry with backoff, request mediation, object mapping, validation pipelines, criteria filtering)
- Unnamed conventions repeated across 3 or more locations

For each candidate record the behavioral shape, every occurrence with `file:line`, and the closest named pattern or library.

**Pass 2, filtering.** Remove any candidate that fails these:

1. **Rule of three**: skip patterns with fewer than 3 occurrences. Exception: library reimplementations, where even one occurrence is worth flagging because the library handles edge cases the reimplementation misses.
2. **Behavioral, not syntactic**: structures must share behavioral shape. Three classes taking a logger in the constructor share a DI convention. Three pieces of code that build, cache, and invalidate the same kind of resource are a pattern.
3. **Framework-provided**: skip patterns the framework already handles correctly (routing, ORM session management, middleware pipelines). Flag only when the codebase reimplements what the framework provides.

## Classification

Assign exactly one recommendation per finding:

| Recommendation | When | Steering bias |
|---|---|---|
| **Adopt library** | A mature library does this | Prefer over Extract when a library exists |
| **Extract abstraction** | 3+ locations, no library, duplication causes shotgun surgery | Use sparingly; only when the cost is concrete |
| **Document convention** | Good pattern arrived at organically, undocumented | Prefer over Extract when the pattern is simple |
| **Leave alone** | Similarity is coincidental, pattern still evolving, or cost is low | Default when uncertain; premature abstraction is worse than duplication |

**Severity.** High: shotgun surgery on routine changes (5+ locations), or a reimplementation missing edge cases the library handles. Medium: locations have already diverged subtly, or new contributors add non-matching instances. Low: pattern is real but cost is minor.

**Effort.** Small: a `CLAUDE.md` update, or library adoption with under 5 call sites. Medium: extraction with clear boundaries, or library adoption with 5 to 15 call sites. Large: significant refactoring, many consumers, or architecture-level change.

## Report

Use the shared report format with these fill-ins:

- **Title**: `Emergent patterns`.
- **Classification**: `Recommendation`, one of the values in the table above. Extra header field: `Occurrences: {count}`.
- **What**: the behavior the repeated structure implements.
- **Evidence**: every occurrence as `{file:line}`.
- **Extra field** `**Reasoning:**`: why this recommendation over the others (rule of three, library availability, cost trade-off).
- **Not reported**: candidates removed by the Pass 2 filters, each with the filter that removed it.

## Formalize

Each finding's subagent works according to its recommendation:

- **Adopt library**: add the package, create a wrapper or config if needed, migrate call sites one at a time, remove the reimplementation, clean up tests that tested internals of the old code.
- **Extract abstraction**: design the minimal abstraction, create it, migrate consumers one at a time. If a consumer does not fit cleanly, leave it alone; the abstraction may be too narrow.
- **Document convention**: add a concise `CLAUDE.md` entry describing the convention, when to use it, and a pointer to an exemplar.
- **Leave alone**: skipped, per the shared procedure.
