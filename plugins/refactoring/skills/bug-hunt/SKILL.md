---
name: bug-hunt
description: Hunts correctness defects in the current code on disk. Treats tests and prose (comments, docstrings, names) as claims to verify, establishes intent from hard oracles only (type contracts, invariants, caller expectations, domain rules, compiler and analyzer output), and reproduces defects where cheap. Use when the user asks to "find bugs", "hunt for defects", "audit this code for correctness", or "what's broken here", with no diff to anchor on. Never reviews a git diff. Optionally fixes findings.
argument-hint: "[--auto] [--fix [1,3]] [--context <path>] [path]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent
---

Follow `${CLAUDE_SKILL_DIR}/../codebase-health/references/audit-procedure.md` for scanning against code on disk, report state and frontmatter, `--context`, the mutation pre-flight, and `--auto`, with the deviations stated below. Report path: `.claude/state/bug-report.md`. Mutation flag: `--fix`.

This skill also executes code: it may write and run throwaway reproduction harnesses (see Reproduction). That is execution of the current code, not history inspection.

## Where this skill fits

`bug-hunt` scans the whole current codebase on disk and centers test-skeptic epistemics. `code-review` hunts bugs in a git diff (change-scoped); the `inline-defect-prevention` rule (`${CLAUDE_SKILL_DIR}/../../rules/inline-defect-prevention.md`) catches them at write time. Reach for `bug-hunt` when there is no diff to anchor on: an audit of code that already exists, where a green test suite has been mistaken for a clean bill of health.

## Human-authored claims are not oracles

This is the spine of the skill. The codebase is full of assertions about what the code is supposed to do, and they drift. Two kinds, one failure mode:

- **Tests** assert behavior and get mistaken for proof of it.
- **Prose** (comments, docstrings, READMEs, commit messages, even a function's name) describes behavior and goes stale the moment the code moves on.

Both are evidence of intent, never ground truth.

- **A green suite is not evidence of correctness.** The absence of a failing test is the absence of a test. Untested paths are where bugs live.
- **A comment is not evidence of correctness.** A docstring promising "returns non-null", a `// safe because` beside the unsafe line, a `validateEmail` that does not validate: each describes what someone once intended. Read prose and names for leads, then verify against a hard oracle.
- **When code contradicts a test or a comment, that is a finding, not a resolution.** Either the code is buggy or the artifact is stale. Decide by appeal to a hard oracle, never by deferring to the test or the prose.
- **An artifact that endorses buggy behavior is a co-defect.** A test asserting the wrong result, or a comment excusing it, will perpetuate the bug. Report it alongside the code bug, cross-referenced.
- **Mocks can launder a bug.** If the broken interaction is mocked away, the test proves nothing about it. Note when a finding sits behind a mock.

## Oracles: how to know it is a bug

A finding needs a hard oracle: a source of intended behavior that is neither human prose nor the suite. Hard oracles are enforced by other code or fixed by external truth. Name the violated oracle for every finding.

The code cannot be its own oracle. "What the function does" is never proof it is right; if behavior were the standard, nothing could be a bug. Read intent from the code's context (how the rest of the system uses and constrains the suspect), never from re-reading the suspect.

- **Type contract**: the signature, enforced by the compiler. A function typed to return `T` that can return `T | null`, a non-null parameter handed `undefined`. The function's name is not a type contract; a misleading name is stale-label drift, a lead only.
- **Caller expectations**: how call sites use a value versus what the callee can produce. A function that can return `null` whose callers dereference unconditionally is a bug at the mismatch. Enumerate every call site with the project's language server where available; fall back to a search covering aliases and re-exports.
- **Invariants**: properties the rest of the system relies on (balance never negative, a list stays sorted, a parsed value round-trips). Hard when other code depends on them holding.
- **Internal consistency**: two places that must agree but do not (a validator admits an input a downstream consumer treats as impossible; an enum gains a case one `switch` handles and another drops).
- **Conservation / round-trip**: encode then decode, serialize then deserialize, push then pop should be identity.
- **Domain rules**: known-correct external semantics (money rounding, timezone math, HTTP status meaning, idempotency, ordering guarantees). These come from domain knowledge outside the codebase, never from the repo's README or design docs, which are prose.
- **Reachability**: a gate rather than an oracle. A defect on unreachable code is not a bug. Confirm the path is reachable from a real entry point (a route, a command, a handler, a scheduled job) by walking callers upward.
- **Compiler and analyzer output**: a build, typecheck, or analyzer run surfaces real faults, and the strictness settings decide what it admits.

## Reproduction

Reproduction is the strongest oracle and the only one that earns **Confirmed**. Where cheap, write a throwaway harness that drives the suspect with its triggering input and compare the output against the oracle's expectation.

- Keep harnesses out of the source tree (a scratch file in a temp location) and delete them afterwards. Do not add them to the suite; a real regression test is `--fix`'s job.
- A harness exercising a real entry point with a real input demonstrates the bug. A harness that mocks the suspect away demonstrates nothing.
- If reproduction needs unavailable infrastructure (a live database, a credentialed API), say so and fall back to static reasoning at **Probable**. Never fake a green repro.

## Confidence tiers

Lead with confidence, not severity. A high-severity guess the user cannot trust is worse than useless.

- **Confirmed**: reproduced by a harness or a compiler or analyzer diagnostic, against a clearly violated oracle.
- **Probable**: a strong, independent oracle is violated by reading, with a reachable, concrete trigger identified, but not executed.
- **Possible**: plausible defect, but the oracle is weak, the trigger is uncertain, or "correct" might be taste. Quarantined in a separate report section.

False-positive discipline is make-or-break: twenty "Possible" findings train the user to ignore the report. The discriminating test for every candidate: which independent oracle says this is wrong, and is it a contract or a preference? Preference is not a bug; drop it.

## Bug categories: where to look

- **Boundary and null**: off-by-one, empty collection, null propagation, unchecked optional, integer overflow or truncation.
- **State and invariants**: illegal transitions, check-then-act gaps, partially applied updates.
- **Concurrency**: races on shared mutable state, non-atomic read-modify-write, missing locks, deadlock ordering, unawaited async, fire-and-forget that drops errors, missing cancellation.
- **Resource lifecycle**: unclosed handles, missing dispose or finally, leaks on the error path.
- **Error handling**: swallowed exceptions, catch-and-continue past an unrecoverable fault, half-committed state, lost original cause.
- **Data loss / corruption**: lost updates, silent truncation, encoding mistakes, overwrite-on-conflict, a default that destroys input.
- **Security boundaries**: injection, missing authorization on a reachable path, trust of unvalidated input in interior code, secrets in logs.
- **Logic**: wrong operator or comparison, sign error, inverted condition, wrong default, coercion surprises.

## Not a bug: filter these out

- **Style / preference**: naming, formatting, "I would structure it differently". No oracle is violated.
- **Type-system or framework guaranteed**: a null check the type already forbids, an invariant the framework enforces.
- **Unreachable**: dead code or a path no entry point reaches.
- **Theoretical without a trigger**: "this could break if someone passed X" where nothing can pass X. Possible at best.

## Hunt: two passes

**Pass 1, surface suspects.** Scan the codebase (or `path` if scoped) two ways and union the results: by category (walk the list above through the code) and by oracle (pick the load-bearing invariants and contracts, then find lines that can violate them). For each suspect record `file:line`, the category, the oracle it appears to violate, and the suspected trigger.

**Pass 2, filter and confirm.** For each suspect: confirm reachability from an entry point, name the violated oracle explicitly (drop it otherwise), attempt reproduction where cheap, and assign confidence. Run every suspect through the Not a bug filter. Confirmed and Probable go in the main report; Possible goes to quarantine.

## Test and prose status: mandatory per finding

For every reported bug, state its relationship to the human-authored claims around it:

- **Tests**: is there a test on this path at all? Does a test pass while the bug lives (it misses the trigger, or mocks it away)? Does a test assert the buggy behavior (co-defect; fixing the code turns it red)?
- **Prose**: does a comment, docstring, name, or README describe or excuse the buggy behavior? Then it is a co-defect. A stale comment over correct code is not a finding.

## Severity and effort

- **Severity**. High: data loss, corruption, security boundary, or a crash on a common path. Medium: wrong result on a narrower reachable path, recoverable error mishandled. Low: edge-case-only incorrectness.
- **Effort**. Small: localized fix under about 10 lines. Medium: touches a few call sites or tightens a contract. Large: structural; the fix is a refactor.

## Report

Use the shared report format with these fill-ins:

- **Title**: `Bug hunt`.
- **Classification**: `Confidence`, either `Confirmed` or `Probable`. Findings are ordered by confidence first, then severity, then effort.
- **Summary**: the counts include Possible findings, and the summary adds one line on the suite's blind spots.
- **What**: what the code does wrong.
- **Evidence**: the defect's location first, then any co-defect test or comment.
- **Extra fields**, in this order: `**Oracle:**` (the hard oracle: a type signature, a caller, an invariant, a domain rule, a diagnostic); `**Trigger:**` (the input or sequence that exercises it; for Confirmed, the harness and its observed output); `**Test and prose status:**` (test on this path? passes while the bug lives? co-defect?).
- **Next step**: the fix sketch, as a concrete change.
- **Section** after Findings: `## Possible (quarantined)`, one entry per finding with its location, the doubt, and what would promote it to Probable. Possible findings are not numbered.

## Fix

Possible findings are never auto-fixed; if cherry-picked explicitly, confirm with the user first.

Each finding's subagent:
1. Writes a failing regression test first (red), anchored on the trigger from the report and exercising a real path.
2. Fixes the production code until that test goes green and the rest of the suite stays green.
3. Handles a test-enshrined co-defect explicitly. If an existing test asserts the buggy behavior, do not silently edit it to pass; that is test-gaming. Stop, surface the test, explain that it encodes the bug, and get confirmation before changing it.

A red suite after a fix means the fix is wrong or a co-defect test was load-bearing; stop and re-examine.

## `--auto`

Only Confirmed and Probable findings are dispatched; Possible findings are excluded. Each subagent follows the Fix procedure, and a test-enshrined co-defect halts further dispatch for user confirmation.

## External context

Treat a `--context` file as suspect-seeding: static-analyzer output, sanitizer or fuzzer crashes, a stack trace, a bug report. Use located findings as Pass 1 starting points and any reproduction recipe to reach Confirmed faster.

A cross-correlating analyzer report (such as Merkhet's JSON output) is mined two ways:

- **Suspect-seeding (Pass 1).** Security findings (injection, secrets), dead-code candidates, and duplication clusters are concrete places to point the hunt. Read each as a lead and hold it to the same bar as everything else.
- **Prioritization.** Compound-risk synthesis (files flagged by several independent analyzers), hotspots, and per-function complexity order which units to analyze first. History-mined signals are acceptable here because they order the hunt; they never judge whether code is buggy.

The guardrail is the same one applied to tests and prose: context seeds and orders the hunt; it is never an oracle. A third-party finding still needs an independent hard oracle and, ideally, a repro before it is reported as Confirmed.
