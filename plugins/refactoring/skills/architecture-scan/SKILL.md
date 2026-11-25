---
name: architecture-scan
description: Identifies the architectural organization the current code on disk is converging toward (N-Layer, Clean Architecture, Vertical Slice, Feature Folders, and so on), names inconsistencies and boundary violations, and optionally reorganizes toward consistency. Use when the user asks "what architecture is this", "how is this codebase organized", "align the scattered code", or "check structural consistency". Never imposes a pattern and never reviews a git diff.
argument-hint: "[--auto] [--reorganize [1,3]] [path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent
---

Follow `${CLAUDE_SKILL_DIR}/../codebase-health/references/audit-procedure.md` for scanning against code on disk, report state and frontmatter, the mutation pre-flight, and `--auto`. Report path: `.claude/state/structure-report.md`, which the `code-organization` rule also reads for file placement. Mutation flag: `--reorganize`. Extra git command: `git mv`, to preserve history when relocating files.

## Scan: two passes

**Pass 1, architectural fingerprinting.** For each project or top-level directory, analyze:

- **Directory tree shape**: depth, naming conventions, grouping strategy (by technical role, by feature or domain, or mixed)
- **Dependency direction**: what references what; which way project or package dependencies flow
- **Interface placement**: alongside implementations, in a separate folder, or in a separate project
- **Feature or domain boundaries**: by folder, by project, by namespace
- **Co-location**: related things together (handler, model, validator in one folder) or split by technical role

Map observations against known patterns: N-Layer, Clean Architecture, Vertical Slice, Feature Folders, Ports and Adapters, Modular Monolith, or an intentional hybrid (Clean boundaries at the project level with feature folders inside the application layer, for example). A hybrid is valid when it is consistent across the codebase.

For each project or area record the closest matching pattern, a confidence level (strong, moderate, weak), and key evidence (directories and dependency references).

**Pass 2, consistency analysis.** Apply three checks:

1. **Cross-project consistency**: do different projects follow the same organizing principle? Divergence is often intentional (a UI project organized by screen against a core library organized by layer). Flag only accidental or confusing divergence.
2. **Intra-project consistency**: within a project, does the pattern hold everywhere? Services organized by feature with models in a flat bag is drift.
3. **Boundary integrity**: do dependencies flow the way the pattern prescribes? Under N-Layer the data layer must not reference the service layer; under Clean Architecture the domain must not reference infrastructure.

**Filtering.**
- Do not flag framework conventions (routes, public assets, entry points, build output directories).
- Do not flag projects with fewer than 5 source files. Note they exist; produce no findings.
- Do not prescribe a pattern. Name what the project is already converging toward. A consistently N-Layer project is a strength, not a finding.
- Respect intentional hybrids. Different strategies at different levels of granularity are valid. Flag only inconsistency within a level, or the absence of any coherent level.

## Classification

Assign exactly one recommendation per finding:

| Recommendation | When | Steering bias |
|---|---|---|
| **Commit to pattern** | Project is 70%+ toward a named pattern with scattered inconsistencies | Prefer; naming the pattern already in use is cheap |
| **Resolve hybrid** | Two patterns coexist in the same scope (not at different levels) | Only when the hybrid causes confusion |
| **Realign boundary** | Dependencies flow the wrong direction, or concerns leak across a clear boundary | Flag even if small; boundary violations compound |
| **Document convention** | Organization is consistent but unnamed | Low cost, high value |
| **Leave alone** | Structure is adequate, changes would be churn, or the project is too early to have settled | Default when uncertain; reorganizing is expensive and risky |

**Severity.** High: boundary violations, or complete inconsistency within a project (new contributors cannot predict file placement). Medium: partial drift, where 30%+ of a project ignores an identifiable pattern, or two projects conflict where consistency would help. Low: minor inconsistencies, or a clear but undocumented pattern.

**Effort.** Small: document the convention in `CLAUDE.md`, or move under 5 files. Medium: reorganize a single project's internal structure. Large: restructure solution-level project boundaries, introduce new projects, or migrate between patterns.

## Report

Use the shared report format with these fill-ins:

- **Title**: `Architectural structure`.
- **Classification**: `Recommendation`, one of the values in the table above. Extra header field: `Scope: {project or directory}`.
- **Context section**, after Summary: `## Detected patterns`, one line per project or area with the closest pattern, the confidence, and the key directories or references behind it.
- **Evidence**: `{path/}` entries, each saying what the code does against where the pattern says it belongs.
- **Why it matters**: the impact on navigability, onboarding, or dependency management.
- **Strengths**: consistent areas, clean boundaries, and good conventions.

## Reorganize

Each finding's subagent works according to its recommendation:

- **Commit to pattern**: document the pattern in `CLAUDE.md`, move misaligned files to match, update imports and references.
- **Resolve hybrid**: present the two patterns and which areas use which, propose which to keep (bias toward the one with more coverage), migrate the minority areas, document the chosen pattern.
- **Realign boundary**: identify the violating references, move types to the correct layer or project, update consumers, verify dependency direction.
- **Document convention**: add a concise `CLAUDE.md` entry describing the pattern, which projects follow it, and where new files of each type go.
- **Leave alone**: skipped, per the shared procedure.
