---
name: codebase-health
description: Assesses maintainability of the current code on disk at the level of units and their collaborators (coupling, cohesion, testability, complexity), and separates strategic (multi-file, root-cause) findings from tactical ones. Use when the user asks for a "health check", "code quality assessment", "how maintainable is this", or "what's the state of this codebase". Leaves architectural layout to architecture-scan and repeated patterns to pattern-discovery. Never reviews a git diff. Optionally addresses the findings.
argument-hint: "[--auto] [--fix [1,3]] [--context <path>] [path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent
---

Follow `${CLAUDE_SKILL_DIR}/references/audit-procedure.md` for scanning against code on disk, report state and frontmatter, `--context`, the mutation pre-flight, and `--auto`. Report path: `.claude/state/health-report.md`. Mutation flag: `--fix`.

## External context

Use a `--context` report to ground findings in numbers (complexity, coupling, ownership values), inherit severity calibration from research-backed thresholds (for example a bus factor of 1), and prioritize files hit by multiple independent signals as strategic findings.

## Assess

Evaluate maintainability at the level of units (classes, modules, components) and how they collaborate:

- **Coupling**: hidden dependencies, global or static state, units that know another's internals, change in one unit forcing change in its collaborators.
- **Cohesion**: units doing several unrelated jobs, data and the logic that owns it living apart.
- **Testability**: missing seams, dependencies constructed inline, side effects that cannot be isolated, logic reachable only through I/O.
- **Complexity**: control flow too deep or branched to reason about, functions doing several levels of abstraction at once.

Flag naming or formatting only when it masks intent or causes misuse.

Two adjacent questions belong to other skills, so they get no finding here. How directories, layers, and projects are organized, and whether dependencies flow the way that layout prescribes, belongs to `architecture-scan`. Duplicated behavioral shapes and library reimplementations belong to `pattern-discovery`. When either shows up prominently, list it under Out of scope.

Distinguish **strategic** findings (structural, multi-file, root-cause issues that compound) from **tactical** ones (localized, symptomatic). Both go in the report; the distinction guides effort during `--fix`.

**Severity.** High: the problem slows or endangers most changes in the area, or blocks testing it. Medium: it raises the cost of some changes or hides intent in a frequently read unit. Low: localized friction.

**Effort.** Small: one unit, no caller changes. Medium: a unit and its direct collaborators. Large: a refactor across many files or a change to a widely used contract.

## Report

Use the shared report format with these fill-ins:

- **Title**: `Health assessment`.
- **Classification**: `Type`, either `Strategic` or `Tactical`.
- **Evidence**: the affected files, with `file:line` where one location shows the problem.
- **Why it matters**: the impact on development.
- **Out of scope**: layout or duplication issues noticed, each naming `architecture-scan` or `pattern-discovery`.
- **Strengths**: units and boundaries worth preserving.

## Improve

Each finding's subagent:
- Designs an incremental plan where each step independently leaves tests passing
- Writes characterization tests before changing code that lacks coverage
- For multi-component findings, instruments each component boundary and runs once to locate where data breaks before designing the refactor
- For plans touching 6 or more files, states which files and why before starting

Address every finding in the report. The only valid reason to skip is that the build or tests cannot be kept passing through the refactor. Effort or scope alone are not reasons.
