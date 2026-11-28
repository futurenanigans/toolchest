# trestle

Runs other coding agent CLIs (`claude`, `codex`, `opencode`, `agy`, `pi`) in isolated git worktrees against a contract whose criteria start failed. The queue lands a worktree only after its checks pass; a direct `worktree_land` call merges whatever the worktree holds, checked or unchecked. An MCP server supervises the agents and runs the checks; a `/trestle` pane shows agents, worktrees, contracts, check results and the queue as they change.

Pass or fail comes from exit codes and structured reports (`libtest-json`, `nextest-json`, `junit-xml`, `sarif`), never from what an agent says about its own work. [`AGENTS.md`](AGENTS.md) holds that rule for anyone changing the code.

## What it does without asking

Read this before pointing Trestle at a repository you care about.

- A writer starts in its worktree and can modify any files its CLI and operating-system account allow, including files outside that worktree. Writer agents run with permission prompts off. `claude` and `agy` get `--dangerously-skip-permissions`, `codex` runs with the `danger-full-access` sandbox setting, and `opencode` gets `--auto`.
- `.env` and `.env.local` from the repository root are symlinked into every worktree (copied on Windows, or where symlinks are denied). An agent that writes through the symlink changes your real file.
- `queue_run_next` has no human step. It merges each item whose checks pass into the target branch, which defaults to the branch that was checked out when the item's worktree was created, then removes the worktree and deletes its branch.
- `worktree_clean` force-removes the worktree and deletes its branch by default, so uncommitted and unmerged work in it is lost. `deleteBranch: false` keeps the branch and its commits. Save any uncommitted changes you need before cleanup.
- A checked-in `<repo>/.trestle/config.json` supplies check commands and agent CLI launch commands, and Trestle executes them. Read that file before running Trestle in a repository someone else wrote.

## Skills

| Skill | Use |
| --- | --- |
| `orchestrate` | Write a contract, run a goal loop in one worktree or competing drafts in several, then compare, land and clean up. Also covers the persistent queue: `queue_add` with `dependsOn`, then `queue_run_next` to dispatch ready items in parallel. |
| `init` | Set user defaults in `~/.trestle/config.json` (model and effort tiers per CLI, the escalation ladder, resource limits) and repo checks in `<repo>/.trestle/config.json`, or a local override under `~/.trestle/<repo-key>/`. |

A goal loop runs the checks after every iteration. Every two failed iterations it moves one step along the tier ladder (by default `cheap`, then `balanced`, then `strong`), counting from the tier the run started on. A run started with no tier (no `model` argument, no `defaultModel` for the CLI, no `defaultTier`) uses the CLI's own default model and counts from `cheap`, so its first escalation switches to the `balanced` model, which can be weaker than the one it started with. A literal model ID pins the model and turns escalation off.

Check steps run one after another. A run that contains a heavy step (the default; `heavy: false` opts a step out) waits for a mutex, so two such runs in the same MCP server process never overlap. Separate server processes do not share the mutex. Without configured checks, Trestle detects them from `Cargo.toml`, `package.json`, `*.sln`, `go.mod` or `pyproject.toml`, and fails closed when it finds none.

Worktrees live under `<repo>/.trestle-wt/`. Creation appends `/.trestle-wt/` to the root `.gitignore` when Git does not already ignore the directory. The edit stays unstaged. Queue, contract and experiment state lives under `~/.trestle/<repo-key>/`. `worktree_land` commits pending changes first and leaves `.env` and `.env.local` out of that commit, then merges the branch and aborts on a conflict. A `.env` that an agent committed itself merges like any other file.

Configure an Awl or Loom scan to emit SARIF 2.1.0 and set the check's `reportFormat` to `sarif`. The checker reads stdout, or the file named by `reportPath`. Findings fail the check even when the scanner exits zero.

Queue mutations and reservations are serialized across MCP servers sharing the queue. Landing is serialized per Git repository, including a queued item's target recheck. A queue run stops for an existing task branch so its previous commits can be inspected.

Baseline checks use the same linked environment files as production worktrees. A newly failing check is rerun once on the pinned base commit. Under `require-green`, a matching base failure blocks the job. Under `no-new-failures`, matching failures become part of the baseline. A green gate with an empty worktree diff fails the producer run.

The supervisor batches activity writes over 75 ms. Terminal agent and job history expires after 24 hours on subsequent access or updates. Cleanup signals a recorded agent only when its process start token matches. Older records without a token cannot authorize a signal.

## Requirements

`bun` and `git` on `PATH`, and each agent CLI you want to drive, installed and signed in. A provider frame identifying an authentication error ends the run with `login_failed`. Errors supplied only as text appear as ordinary failures. A structured usage-limit error puts that CLI on cooldown and the loop continues on the first fallback CLI with quota left (`escalation.fallbackClis`, by default `claude` then `codex`); when none is available the run ends with `usage_limit`.

Bun resolves Trestle’s pinned dependencies for schema validation and XML parsing on first MCP startup. Every tool advertises its input schema through `tools/list` and checks arguments before dispatch. `agent_spawn` requires an existing directory inside the repository’s `.trestle-wt/` after resolving symbolic links.

## Development

```bash
bun install --frozen-lockfile
bun run test        # unit tests in src/__tests__
bun run test:plugin # pane and hook tests in tests/
bun run typecheck
bun run validate
```

The hook typecheck uses the host and built-in tool declarations in `ci/host-types`. When updating the Claude Code version in CI, refresh those two declarations from the same CLI release. The server typecheck uses Bun's types from `bun.lock`.

`bun run test:live` drives the real CLIs and spends tokens.
