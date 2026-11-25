---
name: dead-code
description: Finds dead code in the current code on disk and optionally removes it. Inventories the roots first (entry points, framework discovery, public API), treats every candidate as alive until a named source shows no root reaches it, and removes proven findings with the build and the surviving tests held to the baseline. Use when the user asks to "find dead code", "remove unused code", "clear out dead code", "what can we delete", or "prune unused dependencies". Never reviews a git diff.
argument-hint: "[--auto] [--remove [1,3]] [--context <path>] [path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent
---

Follow `${CLAUDE_SKILL_DIR}/../codebase-health/references/audit-procedure.md` for scanning against code on disk, report state and frontmatter, `--context`, the mutation pre-flight, and `--auto`, with the deviations stated below. Report path: `.claude/state/dead-code-report.md`. Mutation flag: `--remove`. Extra git command: `git restore --source=HEAD --staged --worktree -- <paths>`, to restore a failed finding's files.

This skill also executes code: it runs the build, the project's analyzers and dead-code tools, and the test suite. That is execution of the current code, not history inspection. Age is never evidence: code nobody has changed in years is as alive as its callers make it.

## Where this skill fits

`dead-code` asks one question of the whole codebase: which code can no root reach. `codebase-health` judges the design of live code, `pattern-discovery` finds duplication, and `test-noise-audit` prunes tests that cannot catch a regression. A unit that is live but badly shaped gets no finding here.

## Unused means unreachable from the roots you know

Every "unused" report is a claim about a root set. A tool that misses a root reports live code as dead, and most roots in an application are invisible to a reference search because the framework discovers them at startup. So the root inventory comes first and is written into the report, where the user can correct it before anything is removed.

Inventory these, with the file that establishes each:

- **Entry points**: `main`, binaries, CLI commands, HTTP routes, message consumers, scheduled jobs, hook and plugin entry points, build scripts.
- **Framework discovery**: dependency-injection registrations and assembly scanning, attribute or decorator registration, convention-named handlers and controllers, serializers and ORMs that reach members by name, source generators and macros, template and markup bindings.
- **Declared surface**: the public API of anything published or consumed outside the scanned code, exported symbols, FFI, anything named in a manifest.
- **Names held outside code**: configuration files, SQL, scripts, CI definitions, documentation samples that are compiled or run.

Tests are not roots. Code reachable only from its own tests is dead, and those tests go with it. Say so in the report for each such finding, because deleting tests is otherwise a warning sign.

When the scanned code is a library, the root set is its public surface, and the surface itself is never a finding. Removing a public declaration is a contract change that the user decides.

## Evidence, most exact source first

Use the most exact source available for each question and name it in the finding. Where a source cannot answer, say so; an unanswered question keeps the code alive.

1. **The compiler and its lints.** They are exact about what they cover: unused locals, parameters, private members and imports, unreachable statements. Examples are rustc `dead_code` and `unused_*`, the C# compiler and IDE0051, IDE0052 and IDE0060, and TypeScript `noUnusedLocals`. Turn a silenced lint back on for the scan when the project disabled it.
2. **A reachability tool built for the stack**, when one is installed. For .NET that is Rotfeste (`rot analyze`, with `--library` for a library), which composes the application to derive its roots and reports where its analysis stops. For TypeScript and JavaScript it is `knip`; for Cargo dependencies, `cargo machete` or `cargo udeps`. A tool's own unknowns are reported as unknowns.
3. **The language server**, for references to a named symbol across the workspace.
4. **Reading**, for what no tool models: a registration that scans by convention, a string that becomes a type name, a feature flag nothing sets.

A text search for a name is evidence of life only. A hit in configuration, markup or a script keeps the candidate alive until it is explained; no hits proves nothing on its own.

## Kinds of dead code

- **Unreferenced declarations**: functions, types, members, constants, files and modules no root reaches.
- **Dead branches**: a condition that is constant in every configuration that ships, a feature flag nothing can set, a parameter every caller passes the same value for, an error path whose trigger was removed.
- **Unused dependencies**: packages and project references nothing imports, and those kept alive only by dead code.
- **Stranded compatibility**: shims, fallbacks and migration readers for a format or caller that no longer exists.
- **Leftovers**: commented-out code, unused imports, write-only fields and variables, configuration keys nothing reads.
- **Reachable but unintended**: code a default configuration exposes that no intended function uses. Report it; a gate or a removal there changes behaviour, so the user decides.

## Alive until proven dead

For each candidate, try to prove it alive. Walk the root inventory against it, check each discovery mechanism the codebase uses, and search the names held outside code. Only a candidate that survives every attempt is dead, and uncertainty resolves toward keeping it.

- **Proven**: an exact source reports it (a compiler diagnostic, or a reachability tool whose root set covers this code), or it is private to a file or module and that scope shows no use.
- **Probable**: no reference found through the language server or a full search, the root inventory reaches it by no mechanism, and no tool covers it exactly. The gap is named.
- **Possible**: a dynamic mechanism could reach it and was not ruled out (reflection by name, a scanned assembly, a string-built identifier, an external consumer). Quarantined, never removed automatically.

## Not dead: filter these out

- Code reached by a mechanism in the root inventory, however indirect.
- Public surface of a published library or a contract another repository consumes.
- Code compiled only under another platform, target or feature combination that ships.
- Members required by an interface, a trait, a serializer or a generated partial, even when nothing calls them directly.
- Generated code and vendored code. Report the generator's input or the vendoring decision instead, when that is what is dead.
- Extension points the project documents as such.

## Severity and effort

- **Severity.** High: dead code that misleads (it reads as the live path, or holds a security-sensitive surface), or that keeps a dependency in the build. Medium: a whole file, module or feature. Low: isolated members and leftovers.
- **Effort.** Small: deletion inside one unit with no caller changes. Medium: a cascade across several files, or a dependency removal. Large: removal that changes a configuration surface or a public contract.

## Report

Use the shared report format with these fill-ins:

- **Title**: `Dead code`.
- **Classification**: `Confidence`, either `Proven` or `Probable`. Extra header field: `Kind: {one of the kinds above}`. Findings are ordered by confidence first, then severity, then effort.
- **Summary**: the counts include Possible findings, followed by an estimate of removable lines and dependencies.
- **Context section**, after Summary: `## Roots`, the root inventory, one line per root or discovery mechanism with the file that establishes it, then the mechanisms that could not be modelled.
- **Evidence**: the dead declaration or branch, then whatever it strands (its tests, its private helpers, a dependency).
- **Extra fields**, in this order: `**Source:**` (the compiler diagnostic, tool, language-server query or reading that shows it dead); `**Liveness checks:**` (each way it could have been alive and what ruled it out).
- **Next step**: what to delete, including the tests and helpers that go with it.
- **Section** after Findings: `## Possible (quarantined)`, one entry per candidate with its location, the mechanism that might reach it, and what would settle the question. Possible findings are not numbered.
- **Not reported**: candidates the liveness checks kept alive, each with the root that reaches it.

Group declarations that die together into one finding. A cluster that is only reachable from itself is one removal.

## Remove

Possible findings are never removed automatically; if cherry-picked explicitly, confirm with the user first. A finding that removes public surface or changes a shipped configuration also waits for confirmation.

Each finding's subagent:

1. Deletes the code. It leaves no commented-out copy, no shim and no re-export for the old name.
2. Deletes what the removal strands: tests that exercised only the dead code, private helpers, imports, fields, configuration keys, and dependencies nothing else uses.
3. Checks again inside the files it touched. A removal exposes the next layer, so repeat until nothing newly unreferenced remains.
4. Leaves live code alone. A signature that only dead code needed is narrowed; nothing else is refactored.

After each finding, the build must pass with no new warnings and every test that survives must pass as it did at baseline. A failure means something was alive: restore the finding's files, move it to Possible with the failure as the mechanism, and continue with the next finding. Each passing finding gets its own commit, under `--auto` too in place of the shared one commit per batch, so one removal can be reverted alone.

## `--auto`

Only Proven and Probable findings are dispatched. Findings that share a file run in sequence, and a finding waiting on confirmation is skipped and listed in the final reply.

## External context

A `--context` file seeds the candidate list: a Rotfeste reachability map or SARIF file, `knip` JSON, a coverage capture, linker or trimmer output. Coverage shows what ran in one execution and nothing about what can run, so uncovered code is a candidate and never a finding. Every seeded candidate still goes through the liveness checks.
