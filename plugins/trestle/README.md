# trestle

Runs other coding agent CLIs (`claude`, `codex`, `opencode`, `agy`, `pi`) in isolated git worktrees against a contract whose criteria start failed. The queue lands a worktree only after its checks pass; a direct `worktree_land` call merges whatever the worktree holds, checked or unchecked. An MCP server supervises the agents and runs the checks; a `/trestle` pane shows agents, worktrees, contracts, check results and the queue as they change.

Pass or fail comes from exit codes and structured test reports (`libtest-json`, `nextest-json`, `junit-xml`), never from what an agent says about its own work. [`AGENTS.md`](AGENTS.md) holds that rule for anyone changing the code.

## What it does without asking

Read this before pointing Trestle at a repository you care about.

- Writer agents run with permission prompts off. `claude` and `agy` get `--dangerously-skip-permissions`, `codex` runs with the `danger-full-access` sandbox setting, and `opencode` gets `--auto`.
- `.env` and `.env.local` from the repository root are symlinked into every worktree (copied on Windows, or where symlinks are denied). An agent that writes through the symlink changes your real file.
- `queue_run_next` has no human step. It merges each item whose checks pass into the target branch, which defaults to the branch that was checked out when the item's worktree was created, then removes the worktree and deletes its branch.
- `worktree_clean` force-removes the worktree and deletes its branch by default, so uncommitted and unmerged work in it is lost. `deleteBranch: false` keeps the branch and its commits.
- A checked-in `<repo>/.trestle/config.json` supplies check commands and agent CLI launch commands, and Trestle executes them. Read that file before running Trestle in a repository someone else wrote.

## Skills

| Skill | Use |
| --- | --- |
| `orchestrate` | Write a contract, run a goal loop in one worktree or competing drafts in several, then compare, land and clean up. Also covers the persistent queue: `queue_add` with `dependsOn`, then `queue_run_next` to dispatch ready items in parallel. |
| `init` | Set user defaults in `~/.trestle/config.json` (model and effort tiers per CLI, the escalation ladder, resource limits) and repo checks in `<repo>/.trestle/config.json`, or a local override under `~/.trestle/<repo-key>/`. |

A goal loop runs the checks after every iteration. Every two failed iterations it moves one step along the tier ladder (by default `cheap`, then `balanced`, then `strong`), counting from the tier the run started on. A run started with no tier (no `model` argument, no `defaultModel` for the CLI, no `defaultTier`) uses the CLI's own default model and counts from `cheap`, so its first escalation switches to the `balanced` model, which can be weaker than the one it started with. A literal model ID pins the model and turns escalation off.

Check steps run one after another. A run that contains a heavy step (the default; `heavy: false` opts a step out) waits for a mutex, so two such runs in the same MCP server process never overlap. Separate server processes do not share the mutex. Without configured checks, Trestle detects them from `Cargo.toml`, `package.json`, `*.sln`, `go.mod` or `pyproject.toml`, and fails closed when it finds none.

Worktrees live under `<repo>/.trestle-wt/`; queue, contract and experiment state under `~/.trestle/<repo-key>/`. `worktree_land` commits pending changes first and leaves `.env` and `.env.local` out of that commit, then merges the branch and aborts on a conflict. A `.env` that an agent committed itself merges like any other file.

## Requirements

`bun` and `git` on `PATH`, and each agent CLI you want to drive, installed and signed in. A run that hits a login error ends at once with `login_failed`. A usage-limit error puts that CLI on cooldown and the loop continues on the first fallback CLI with quota left (`escalation.fallbackClis`, by default `claude` then `codex`); when none is available the run ends with `usage_limit`.

## Development

```bash
bun run test        # unit tests in src/__tests__
bun run test:plugin # pane and hook tests in tests/
bun run typecheck
bun run validate
```

`bun run test:live` drives the real CLIs and spends tokens.
