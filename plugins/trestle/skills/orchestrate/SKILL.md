---
name: orchestrate
description: Autonomous multi-agent CLI orchestration and task queueing via Trestle. Use when orchestrating external coding agents (claude, codex, opencode, agy, pi), queueing multiple tasks with dependencies (queue_add, queue_run_next), racing competing implementations in isolated git worktrees, running Ralph/Goal verification loops with automatic model/effort escalation, or steering/monitoring parallel agent runs.
---

# Trestle Multi-Agent Orchestration

Run autonomous **Contract-First Goal Loops** and **dependency-aware multi-task queues** across external agent CLIs (`claude`, `codex`, `opencode`, `agy`, `pi`) in isolated git worktrees, with deterministic mutex-gated verification checks and live visibility in the `/trestle` sidepanel.

## Core principles
1. **Contract-First, Default-FAIL:** Define explicit acceptance criteria and deterministic verification commands (`contract_create`) *before* any producer edits code. Every criterion starts `false`, and `check_run` fails closed if zero checks are detected or configured.
2. **Right Tool for the Job (Native Subagents vs. Trestle):**
   - Prefer **native Claude Code subagents** for quick read-only codebase inspection (to draft a sharp contract) and lightweight Claude-only subjective reviews.
   - Use **Trestle** for deterministic Ralph/Goal loops, cross-CLI runs (`codex`, `opencode`, `agy`, `pi`), competing multi-CLI drafts, and persistent multi-task queues.
3. **Model Tiers, Effort & Automatic Escalation:**
   - Pass tier aliases (`model: "cheap" | "balanced" | "strong"`) rather than hardcoded model IDs whenever possible. Trestle resolves each tier to `{ model, effort }` from user/repo config (`config_get`) and **automatically escalates** up the tier ladder (default: `cheap → balanced → strong` every 2 failed iterations).
   - A run with no tier (no `model`, no `agents.<cli>.defaultModel`, no `defaultTier`) starts on the CLI's own default model and counts from `cheap`, so its first escalation switches to `balanced`, which can be a downgrade. Pass a tier alias to avoid that.
   - Pinning a literal model ID disables automatic escalation.
4. **Keep-or-Discard Discipline:** Whether implementing features, fixing bugs, or optimizing a scalar metric (`metricPattern` on a check step), keep only changes that pass 100% of deterministic gates and log discarded attempts via `experiment_log`.
5. **Never Trust Self-Report:** `goal_run` / `goal_start` independently executes `check_run` after every iteration. Check steps run one after another. A run with any heavy step (the default) holds Trestle's mutex, which is per MCP server process; a run made only of `heavy: false` steps skips it.

## Single-Task & Competing-Draft Workflow

### 1. Inspect Config, Dead Ends & Establish Contract
- Call `config_get` to inspect active repo checks, model/effort tiers, and `resources.maxParallel`. (If Trestle is not yet configured for this repo, suggest or run `trestle:init`.)
- Call `experiment_read` to inspect past dead ends in `~/.trestle/<repo-key>/experiments.md`.
- Remind the user they can open **`/trestle`** to watch live progress, activity tails, and token/cost usage.
- Create the contract via `contract_create` (`maxIterations` defaults to config `maxIterations`, which is 10 unless changed; `freshContextPerIteration` defaults to `true`). Omit `checks` only if repo config or auto-detection already provides deterministic checks.

#### Pre-Contract Checklist (Verify Before Calling `contract_create`)
1. **Put caveats in the check command, not the goal text:** Trestle's loop never parses goal prose. If a known unrelated test is flaky or broken, exclude it in the check command itself (e.g. `-E 'not test(flaky_name)'`) and report it as skipped when landing.
2. **Declare a structured `reportFormat` on every test check:** Set `reportFormat: "nextest-json" | "libtest-json" | "junit-xml"` (with `baseline: "no-new-failures"` when base has known failures) so baseline comparison and `stuck` detection operate on exact failing test IDs rather than raw logs.
3. **Gate on what the change can affect:** Scope loop checks to the affected crates/packages/test suites so unrelated slow or flaky tests don't derail iterations; run the full workspace suite once after landing.
4. **Never write "stop and say why" instructions:** Programmatic loop control never parses `finalText` (see `AGENTS.md`). Resolve potential test/spec conflicts before starting, or set a lower `maxIterations` and inspect `finalText` yourself.
5. **Cross-check criteria for contradictions:** Before calling `contract_create`, grep every symbol that a criterion requires removing/renaming against every test that a criterion requires keeping unchanged.

### 2. Provision Worktree(s) & Run Goal Loop
- Create an isolated worktree with `worktree_create` (e.g. `wt-impl`). `goal_run`, `goal_start` and `agent_spawn` reject a `worktreePath` outside the repository's `.trestle-wt/`.
  - *Competing drafts:* Create 2+ worktrees (`wt-codex`, `wt-agy`) and run against the **same `contractId`**.
- **Prefer non-blocking `goal_start`** (with `goal_status` / `goal_cancel`) for anything beyond a quick 1-iteration task so MCP calls never time out and you can steer or cancel mid-run. Use blocking `goal_run` only for short, bounded tasks.
- **Live intervention:** Use `agent_tail` to inspect recent activity, `agent_steer` to redirect a running agent mid-turn (`claude`, `codex`, `agy`), or `agent_stop` / `goal_cancel` to abort.
- **Failure handling:**
  - `login_failed`: fails fast. Report to the user or switch to another CLI.
  - `usage_limit`: the CLI goes on cooldown and the loop continues on the first `escalation.fallbackClis` entry with quota left (default `claude`, `codex`). With none available the run fails with `usage_limit`.
  - `agent_stop` on a goal-loop agent ends the loop as `cancelled` without running checks.
  - `transient`: retried automatically with backoff without burning an iteration.
  - `exhausted`: inspect `worktree_diff` and `agent_tail`, log dead ends (`experiment_log`), and either adjust the contract/escalate or clean up (`worktree_clean`).

### 3. Evaluate, Update Criteria & Land
- Compare passing worktrees via `worktree_diff` (supports optional `maxChars`) and any captured `metric` values.
- Optionally run a read-only subjective review (native Claude subagent, or `agent_spawn` with `mode: "read-only"` on another CLI) and record per-criterion evidence with `contract_update_criterion`.
- Call `worktree_land` only on a worktree whose goal loop passed: it runs no checks itself. Its auto-commit skips `.env` and `.env.local`, a `.env` the agent committed still merges, and a merge conflict aborts cleanly. Save any uncommitted changes you need in the remaining drafts. Then call `worktree_clean` on the temporary worktrees (`worktree_list` to verify no orphans remain).

## Multi-Task Queue Workflow (`queue_add` + `queue_run_next`)
Use the persistent repo queue (`~/.trestle/<repo-key>/queue.json`) whenever the user has multiple related tasks, a backlog, or a dependency DAG:
1. Enqueue tasks with `queue_add`. Specify `dependsOn` for prerequisites (cycles are rejected), `priority`, `cli`, `model` (tier alias or literal), and optional per-item `checks` / `maxIterations`. `queue_add` takes no `effort` or `baseline`; effort comes from the tier.
2. Dispatch ready batches with `queue_run_next` (defaults to `config.resources.maxParallel`, automatically throttles to `1` if free RAM is below `minFreeMemMb`, and re-merges + re-checks any item whose target branch moved during its run). Passing items merge into the target branch with no confirmation; their worktrees and branches are then deleted.
3. Inspect and maintain the queue with:
   - `queue_list`: shows `queued`, `running`, `blocked` (dependency failed), `landed`, and `failed` items.
   - `queue_retry`: cleans up a failed/interrupted item's stale worktree and resets it to `queued`.
   - `queue_update`: adjusts priority, CLI, model/tier, or dependencies.
   - `queue_clear`: prunes `landed` / `failed` items.
