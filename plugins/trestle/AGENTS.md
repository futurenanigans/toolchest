# Trestle Engineering & Architecture Rules

## 1. The Determinism Boundary (Non-Negotiable)

> **Programmatic control flow must only make decisions from outputs produced by programmatic logic.**
> **Outputs produced by LLMs may only be evaluated by LLMs (or humans), never parsed and acted upon by programmatic logic.**

- **Deterministic → Deterministic:** **OK** (exit codes, OS signals, structured CLI protocol frames, compiler/test-runner JSON/XML reports, git status/diff).
- **Non-deterministic → Non-deterministic:** **OK** (passing an agent's `finalText`, diff, or summary to a host/evaluator LLM or human operator).
- **Non-deterministic → Deterministic:** **FORBIDDEN**, *unless* the non-deterministic actor invoked a deterministic, schema-validated tool to produce the state (e.g., calling an MCP tool with typed arguments). Never prompt an LLM to emit specific text, markers, or hand-crafted JSON files so programmatic code can parse them and branch on the result.

### Why
Asking an LLM to produce exact syntax/paths/fields for programmatic branching introduces silent, non-deterministic failures (typos, schema drift, partial formatting, or premature triggering). Every control-flow branch in the orchestrator must be backed by deterministic signals.

### Applying This Rule in Trestle
- **Verification gates (`src/checks.ts`, `src/goal_gate.ts`, `src/goal_run.ts`):**
  - Pass/fail decisions come strictly from process exit codes and structured test-runner reports (`libtest-json`, `nextest-json`, `junit-xml`). Never parse free-form prose to infer test pass/fail.
  - Baseline gating (`require-green` / `no-new-failures`) and `stuck` detection rely on deterministic check outputs. Prefer structured `reportFormat` (`failedIds`) over raw stderr excerpts so non-deterministic timestamps/durations in logs don't perturb digests.
- **Adapter event streams (`src/adapters/*.ts`):**
  - Control-flow transitions (`turn_done`, `turn_failed`, `session`, `usage`) must come strictly from the CLI harness's own structured protocol frames, never from parsing assistant message text.
  - Prefer structured error codes (`codexErrorInfo`, `provider.quota`, `authentication_failed`) over substring heuristics; fail closed (e.g. `window: 'manual'`) when reset timing is absent.
- **Agent prose (`finalText`, `tail`):**
  - Display in `/trestle` and pass to the host LLM / human operator for judgment. Never branch on its contents in TypeScript.
- **Blocker / escalation signaling:**
  - Do not rely on an LLM hand-writing a magic file or magic phrase in prose to control loop termination. Programmatic loop termination should come from deterministic checks (baseline gate, stuck detector, quota/auth errors) or explicit tool calls (`goal_cancel`, `agent_stop`) invoked by an operator or host agent.
