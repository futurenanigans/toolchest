---
name: test-noise-audit
description: Classifies existing passing tests as noise or valuable (noise being any test whose removal would not reduce confidence in the codebase), writes a report, and deletes the noise tests. Use only when the user explicitly asks to "audit the tests for noise", "remove useless tests", "prune the test suite", or "find tests that don't catch anything".
argument-hint: "[--auto] [path]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(git status *), Bash(git rev-parse *), Bash(git add *), Bash(git commit *), Bash(git rm *)
---

Deep audit of existing tests only: no gap analysis, no new test writing. The goal is a smaller, more honest suite by removing tests that cannot catch real regressions.

Parse `$ARGUMENTS` for `--auto` (remove all noise tests without per-finding review) and an optional `path` to scope the audit. Without `--auto`, present findings and ask before removing.

## Pre-flight

Require a clean working tree. If dirty, stop and ask the user to commit or stash first.

## Audit

Read the project's existing tests (or those under `path` if scoped). A test is **noise** if removing it would not reduce confidence in the codebase.

Run the audit and write the report in one subagent, as the "Run the scan in a subagent" section of the audit procedure describes. Confirmation and removal stay in the main context.

**Scope.** Consider only tests that pass in a clean run. Failing, skipped, todo, or flaky-annotated tests are out of scope; they need attention, not classification. List them in the report as "not audited" with a one-line reason, and do not propose deletion.

**The classification question is about what the test verifies, not whether it is convenient.** A test that catches a real regression intermittently because the system under test is flaky is not noise; the flakiness is the bug. A slow test is not noise on those grounds. The only ground for noise is that the test could not catch a real regression no matter how the production code changed.

## Categories

Before classifying, read `${CLAUDE_SKILL_DIR}/../../rules/test-quality.md`. Its "Noise" list gives the categories to classify as noise, and its "Valuable" list gives categories never to classify as noise. That file is the single source for both lists; if it cannot be read, stop and say so instead of classifying from memory.

When in doubt, ask: "What production bug would make this test fail?" No concrete answer means noise.

## Report

Write the report to `.claude/state/test-noise-report.md`, using the report format in `${CLAUDE_SKILL_DIR}/../../references/audit-procedure.md` with these fill-ins. A finding here is one test, and noise has no severity or effort, so findings are table rows instead of numbered entries.

- **Title**: `Test noise audit`.
- **Summary**: `{total} tests, {valuable} valuable, {noise} noise ({noise_pct}%)`, followed by a table with the columns Category, Count, and Example (`TestClass.TestName`).
- **Findings**: one `### {test file}` heading per file, each with a table whose columns are Test, Category, and Why it is noise (what it tests and why that cannot catch a regression).
- **Section** after Findings: `## Not audited`, the failing, skipped, todo, or flaky tests, one line each with the reason.
- **Not reported**: tests that look trivial but catch something meaningful, each with the regression it catches. This guards against over-pruning.

## Remove

After the report is written (under `--auto`, or after user confirmation otherwise):

- Delete the test methods listed in the Findings tables. If every test in a class or file is noise, delete the class or file.
- Remove orphaned fields, imports, helper methods, and setup or teardown code left behind.
- Run the full test suite; every remaining test must still pass.
- Commit the removal with a message stating the noise count and category breakdown.

If the suite fails after deletions, something classified as noise was load-bearing. Stop, restore the deleted code, and re-examine the report before retrying.
