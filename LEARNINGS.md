# Engineering and evaluation notes

## 2026-11-28 · Plugin evaluations

| Observation | Decision for future work |
| --- | --- |
| The six paired Haiku smoke cases cost $0.035 in total. The corresponding Opus runs cost $1.06. Testing scored 1.00 with the plugin and 0.33 on the baseline with both models. Writing behaved differently across models. Each case ran once per arm. | Use Haiku to develop fixtures and graders. Repeat a case on the deployment model before using its result to change instructions. Purposefully selecting baseline failures makes these cases unsuitable for estimating everyday pass rates. |
| In the decoder placement conflict, neither model invoked the relevant code-organization skill. | Record target availability, exact skill invocation, and the outcome independently. Compare explicit invocation on the same fixture before attributing a miss to the skill text. |
| A blind Gemini Flash judge gave credit for a test filename where the writing rule requires the test name. | Keep a deterministic check for exact identifiers. Use the blind judge for semantic decisions and retain its reason alongside the verdict. |
| On the goal-less handover, the command asked which goal to carry forward. The baseline drafted a brief covering both tasks. In the audit, both arms made the same edit after approval, but only the command identified the removable assertion beforehand. | Exercise user-only workflows by dispatching their real slash commands. Give the baseline an equivalent plain-language task. Save the first-turn decision before sending approval. |
| Both resume arms passed the positive rounding test. Only the command changed the result for −1.005, outside the requested positive-receipt change. | Pin the negative boundary in the next resume fixture and score it alongside the requested fix. |

The local roadmap links the individual reports. These observations describe the recorded trials of Haiku 5.5 and Opus 5.5.

## 2026-11-28 · Trestle Phase 1

- Queue reservation and checkout landing have different critical sections. Queue changes use a short cross-process transaction. Landing holds a repository lock across target synchronization, recheck, merge, and restoration of the original checkout. A concurrent state-file update also needs its own lock to preserve both worktree records.
- A successful check on an unchanged worktree provides no evidence that the producer did the work. Check the Git diff and untracked files before running checks that might generate their own artifacts.
- A single green baseline can misattribute a load-sensitive failure. Recheck the failing steps on the original commit with the same environment files before feeding failures back to the producer.
- Confirm a subprocess test failure on the base revision in the same environment. The MCP stdin fixture timed out inside the execution sandbox on the base revision and passed when its subprocess pipes worked normally.

The Trestle fixes also cover cleanup after PID reuse, distinct worktrees for long IDs sharing a prefix, quoted prompt delivery, classification of provider errors, and pane lookup from a nested working directory. Linux regression tests exercised those cases. The native Windows batch-shim case awaits CI.

The supervisor batches activity writes for 75 ms and retains completed agent and job records for 24 hours, with pruning on later access or updates. Both durations are implementation defaults chosen during Phase 1. The regression runs establish no performance or retention optimum. [Trestle behavior notes](plugins/trestle/README.md)

## 2026-11-28 · Remaining Phase 1 fixes

| Observation | Decision and verification |
| --- | --- |
| A clean run, an empty project, and an invalid rule can all yield zero findings. | Consumers should read `report.json` for both findings and scanner outcomes. On Linux, the same fixture went from one match to zero on the second run, the empty project recorded a skipped analyzer, and the invalid rule recorded a failed scanner and exit 1. The previous array output remains readable. |
| Top-level versions left the dependency graph open. | Spectral uses npm integrity hashes including the vendored OWASP 2.0.1 tarball. A cached-package install ran Spectral 6.17.1 against a local document and recorded an ok status. Schemathesis 4.33.4 installed from a universal, hash-checked lock using Python 3.11. To update it, change `config/schemathesis.in`, regenerate with `uv pip compile --universal --python-version 3.11 --generate-hashes`, and update the displayed version. |
| Schemathesis wrote a JSON report and exited 2 for a schema with zero operations. | Preserve the failed scanner status even when a report exists. The offline replay separately checks the exit-1 findings path, severity, operation and run detail. These checks cover report handling without exercising a live API. |
| Cosign 2.6.2 verified the Linux x86 OpenGrep v2.1.0 binary using its release certificate, signature, configured identity and OIDC issuer. | Keep signature verification separate from the pinned artifact checksum. The Windows CI fixture still needs a native result for archive fallback and Git Bash path handling. |
| The title-case heuristic also matches “Visual Studio”. The git guard and lam's shell advice likewise have documented parsing limits. | Keep title-case findings informational. Retain the documented behavior of the other two checks. |

## Trestle Phase 2 module split

The MCP server still advertises 33 tools. A stdio smoke test listed them, called `agent_list`, checked an unknown-tool error, and closed stdin. This exercises dispatch and shutdown across the new module boundaries. The tool declarations retain the Phase 1 SARIF report option.

Goal orchestration now delegates producer retries and session handling to `goal_producer.ts` and baseline comparison and verification to `goal_gate.ts`. Both typechecks, 59 unit tests and three pane tests passed on Linux. The largest affected module is the 488-line MCP tool catalog.

## Trestle Phase 2 MCP argument validation

A fresh plugin copy started through the manifest command from a different working directory with an empty dependency cache. Its 33 tools retained their names and required argument lists. An invalid call returned a validation error and a subsequent valid call succeeded in the same session. First startup needs the pinned Zod package available locally or from the registry.

A directory with the same prefix as the worktree root and a symlink from inside the root to that directory both failed the spawn check. The check uses the resolved directory as the launch path. This establishes the initial working directory only. Both typechecks, 61 unit tests and three pane tests passed on Linux.

## Trestle Phase 2 lock consolidation

The quota ledger is shared across Trestle processes. Its previous promise queue could order writes only within one process. Quota updates now hold the same SQLite-backed lock used for other shared files across the entire read, update and rename. Three independent Bun processes recorded 16 one-token entries apiece in one ledger. The final total was 48.

A separate test held one file lock open while another file completed an update, then made the first holder fail. Its caller received the error and the next two writers completed in submission order. Both typechecks, 63 unit tests and three pane tests passed on Linux.

## Trestle Phase 2 JUnit reports

A runner can print literal failure markup inside captured test output. Trestle now extracts failures from XML elements that are direct children of a testcase. A report-file fixture covered nested namespaced suites, comments, CDATA, escaped test names and both failure and error elements. A malformed stdout report from a runner that exited zero produced a failed check marked `invalidReport`.

Both typechecks, 65 unit tests and three pane tests passed on Linux. A fresh marketplace-style startup also resolved the pinned XML parser.

## Trestle Phase 2 completion

- The idle timer now starts when a spawned process reaches running state. Subprocess fixtures observed idle, resumed activity, explicit stop and total timeout. A separate fixture confirmed that killing an owned process tree closed a pipe inherited by its descendant.
- Two simultaneous edits to one queue item preserved both fields. The independent-server dispatch test also passed.
- A generated edit to a tracked `.gitignore` could otherwise prevent the first landing. Creation honors Git’s existing exclusions and serializes additions to the root ignore file. Landing accepts the sole unstaged rule addition and still refuses unrelated edits. The rule stays in the user's checkout for review.
- We retained force cleanup and the current writer permissions. The README describes loss of uncommitted work, branch retention and access outside the initial worktree. The orchestration instructions tell callers to save draft changes before cleanup.
- Authored Trestle code and docs follow the comment and dash conventions. Vendored declarations and captured provider frames are excluded from the style edit. Linux verification passed both typechecks, 71 unit tests and three pane tests. Plugin validation passed with the existing manifest-version warning. Native Windows execution remains pending.


## 2026-11-28 · Phase 3 three-arm evaluations, Study 1, and Study 2

All 19 eval cases (171 Claude Haiku 5.5 trials across `bare`, `plugin`, and `suite` + `claude-md/CLAUDE.md`, `n=3` per arm) verified arm isolation (`iso=True` on every run) and used blind `agy` (`gemini-3.8-flash-low`) grading for LLM rubrics alongside deterministic graders.

| Observation | Decision and evidence |
| --- | --- |
| Full suite (`all plugins + 22 KB CLAUDE.md`) adds ~30k to 160k total tokens per task (+$0.0025 to +$0.009/run on Haiku 5.5, roughly 1.8x to 2.2x bare cost). | Worth the overhead where skills deliver measurable lift (`testing:test-quality` +0.44, `writing:comments` +0.33, `dotnet:dotnet` +0.33 to +0.50, `review:pr-review` suite +0.17). Deadweight skills that neither activate nor beat baseline must be removed. |
| All 7 dormant cases scored 1.00 (100%) across all 3 arms with 0% false activation in `suite`. | Convention skills do not over-trigger or damage untouched code on dormant tasks. |
| `testing:test-quality` and `writing:comments` activated 100% in both `plugin` and `suite`. `dotnet:dotnet` activated 0% in `plugin` (67% in `suite`) and `refactoring:code-organization` activated 0% in both. | Tightened the descriptions of `dotnet` and `code-organization`. Recheck (`n=3/arm`): `dotnet/kr-file-added-method` jumped from 0%/67% activation (0.50/0.83) to **100%/100% activation (1.00/1.00)**; `refactoring/place-new-decoder` jumped from 0%/0% activation (0.67/0.00) to **67%/0% activation (1.00/0.67)**. |
| `inline-defect-prevention` did not beat baseline (`bare` 1.00, `plugin` 0.67, `suite` 1.00; 33%/0% activation). `pattern-awareness` never activated (0%/0%); `plugin` tied `bare` at 0.67 while `suite` scored 1.00 solely from `CLAUDE.md`. | Deleted both `inline-defect-prevention` and `pattern-awareness` in Phase 4 and cleaned up all references. |
| Study 1 (`review/injection-and-false-positive`, `n=3/arm`): `bare` 0.83 (67% pass, 1/3 missed prompt injection), `review` alone 0.67 (33% pass, 2/3 false-positive null findings), `suite` **1.00 (100% pass, 0 wrong interventions)**. | Full suite + `CLAUDE.md` eliminates both missed injection and false-positive null findings on Haiku 5.5 ($0.0131/run vs $0.0038 bare). |
| Study 2 (Trestle escalation ladder vs fixed models on 3 tasks via real `runGoalLoop` + `.trestle-wt` worktrees on `claude`): `fixed-cheap` 3/3 accepted at **$0.00432/patch**, `fixed-balanced` 3/3 at **$0.06195/patch**, `ladder` 3/3 at **$0.00449/patch**. | Keep the escalation ladder: it matches `fixed-cheap` cost (13.8x cheaper than `fixed-balanced`) while retaining automatic escalation for harder tasks. |
| Leakage linter (`scripts/lint-eval-leakage.py`) flagged 1 shared 4-gram in the pre-existing `dotnet/kr-file-user-asks-local-style/prompt.md` (`"follow the local style"`) and 0 leaks in all 12 new eval cases. | Retain `scripts/lint-eval-leakage.py` to screen new eval prompts before adding them. |

## 2026-11-28 · Phase 4 actions and analyzer check

- Consolidated the 8 sentence-shape bans into `plugins/writing/references/sentence-shapes.md` and synced `writing-style/SKILL.md` and the three output styles (`direct.md`, `impatient.md`, `one-line.md`). Added `scripts/check-synced-prose.mjs` to CI (`.github/workflows/validate.yml`) to fail on drift in either the sentence-shape blocks or the shared sections of `refactoring` and `testing` `audit-procedure.md`.
- Reworded `claude-md/CLAUDE.md` line 3 to explicitly allow OS-level platform notes (covering the Windows Defender executable note without moving a cross-stack OS warning into the `.NET` skill).
- Checked external analyzer repositories for the `writing:comments` public API doc conflict: **Mortise** (`README.md:259`, `checks.commentAnchor` forbids `///` item docs and silences `public-doc-guard`), **Awl** (`docs/comment-anchors.md:41-43`, covers XML `///` doc trivia with no library export exemption), and **Loom** (`packages/engine-native/src/rules/comments.rs:1251-1275`, exempts only leading `//!` or `/*` module docs) all have the same conflict. Left external repositories untouched; `writing:comments` already defers to the active analyzer when enabled.


## 2026-11-28 · Phase 5 decisions and implementations

- **Skipped `awl`/`loom` read-only semantic caller queries.** Field evidence in `/home/lam/code/Substrate` (`docs/substrate-feedback-tondo-2026-07-08.md`, `docs/tools/assessment.md`, `docs/decisions/0050-grep-redirect-advisory-instance-3.md`, `docs/decisions/0065-honesty-invariant-no-empty-on-error.md`, `.claude/spec/caller-resolution-symbol-key-ownership.md`) confirms the accuracy/trust trap: honest caveats still cause models to fall back to grep, while confident results on stale indexes actively mislead.
- **Implemented all 6 approved Phase 5 items:**
  - `lam`: `credential-read` deny check (Read/Bash/PowerShell on `.env`, `*.pem`, `*.key`, `id_rsa`, etc., excluding `.example`/`.sample`/`.template`) and `destructive-git` advisory (`git push --force`, `git reset --hard`, `git add -A`).
  - `gimlet` + `refactoring:bug-hunt`: post-fix variant-analysis sweep in both skills; `gimlet query` (`text`, `json`, `sarif` 2.1.0) in `plugins/gimlet/lib/query.sh`.
  - `trestle`: `needs_input` status detection (`BLOCKED:` / `NEEDS_CONTEXT:` / `NEEDS_INPUT:`) and magenta alert row in `pane.tsx`, `worktree_land({ preview: true })` / `worktreeLandPreview`, and `blueprint_import` MCP tool parsing `feature-architect` Build Sequences into Trestle contracts and dependency-wired queue items.
  - `session`: `tool.call` + `prompt.compose` hook recording up to 5 deduplicated, non-exploratory failed shell commands for `/session:handover`.
  - `writing`: `info`-severity `negative-parallelism`, `noun-triad`, and `sentence-length-variance` checks in `plugins/writing/lint/`.


## 2026-11-28 · Coverage expansion (10 new cases, 90 Haiku 5.5 trials)

Full data: `plugins/review/evals/results/coverage-expansion-three-arm/results.json` (`n=3` per arm, `iso=True` on 90/90, blind `agy` grading on LLM rubrics).

| Case | Bare (pass) | Plugin (pass) | Suite (pass) | Act (P/S) | ΔP / ΔS | Indicator |
| :- | -: | -: | -: | -: | -: | :- |
| `refactoring/dead-code-framework-root-alive` | 0.00 (0%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | +1.00 / +1.00 | Strong lift: bare flagged Next.js `route.ts` `GET` as dead 3/3 times; `dead-code` kept it alive 3/3 times. |
| `trestle/orchestrate-blueprint-workflow` | 0.00 (0%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | +1.00 / +1.00 | Strong lift: `orchestrate` reliably produced Trestle contract/queue/worktree/preview steps. |
| `session/handover-requires-goal` | 0.50 (0%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | +0.50 / +0.50 | Strong lift: bare drafted a combined brief 3/3 times; `/session:handover` asked for a single goal 3/3 times. |
| `testing/test-noise-audit-identifies-noise` | 0.67 (33%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | +0.33 / +0.33 | Strong lift: `test-noise-audit` reliably flagged the constant assertion and protected the overdraft test. |
| `dotnet/nuget-update-plan-discipline` | 0.67 (67%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | +0.33 / +0.33 | Positive lift: `nuget-package-update` consistently separated major vs patch/minor and checked vulnerabilities. |
| `rust/edition-2024-typed-error-no-unwrap` | 0.78 (67%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | +0.22 / +0.22 | Positive lift + 100% automatic activation on Rust 2024 code. |
| `gimlet/triage-and-variant-sweep` | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 0%/0% | 0 / 0 | Ceiling fixture + 0% auto-activation (prompt did not name `gimlet`). |
| `refactoring/bug-hunt-test-enshrined-co-defect` | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | 0 / 0 | Ceiling fixture (15-line single file too small to separate `bug-hunt` from bare). |
| `refactoring/codebase-health-identifies-god-service` | 1.00 (100%) | 1.00 (100%) | 1.00 (100%) | 100%/100% | 0 / 0 | Ceiling fixture (single-file god class obvious to bare). |
| `memory/prune-stale-memory` | 1.00 (100%) | 0.50 (0%) | 0.50 (0%) | 100%/100% | -0.50 / -0.50 | Diagnostic: `memory-consolidation` asks confirmation before deleting/editing memory files (dry-run by default), whereas `bare` edited `.claude/memory/` immediately. |
